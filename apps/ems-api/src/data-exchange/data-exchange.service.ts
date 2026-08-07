import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import { maskAccountNumber } from "@/staff/bank-details";
import { ENTITIES, findEntity, type EntityDefinition } from "./entities";
import { buildImportPlan, canCommit, type ImportPlan } from "./import-engine";
import { MAX_IMPORT_ROWS, buildSheet, formatFromFilename, parseSheet, type SheetFormat } from "./workbook";

/**
 * Turns a database failure into something the person holding the spreadsheet
 * can act on.
 *
 * Prisma's own text — "Unique constraint failed on the fields: (`email`)" —
 * names a column in our schema, not a column in their file, and tells a
 * school administrator nothing about what to change. The most common cause by
 * far is two people sharing an address, so that case is named directly.
 */
export function explainFailure(error: unknown): string {
  const code = (error as { code?: string })?.code;

  if (code === "P2002") {
    const target = (error as { meta?: { target?: string[] | string } })?.meta?.target;
    const fields = Array.isArray(target) ? target.join(", ") : target;
    return fields
      ? `Another record already uses that ${fields}`
      : "Another record already uses one of these values";
  }
  if (code === "P2003") return "This row points at something that does not exist";
  if (code === "P2025") return "The record this row updates was not found";

  const message = error instanceof Error ? error.message : String(error);
  // An empty message would render as a row flagged as failed with nothing
  // beside it, which is less use than admitting we do not know why.
  return message.trim() || "This row could not be saved";
}

export interface CommitResult {
  created: number;
  updated: number;
  skipped: number;
  failures: { rowNumber: number; problem: string }[];
}

@Injectable()
export class DataExchangeService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly secrets: TenantSecretsService,
  ) {}

  listEntities() {
    return ENTITIES.map((entity) => ({
      name: entity.name,
      label: entity.label,
      columns: entity.columns.map((column) => column.header),
      keyColumn: entity.spec.columns.find((column) => column.field === entity.spec.keyField)?.headers[0],
      requiredColumns: entity.spec.columns.filter((c) => c.required).map((c) => c.headers[0]),
    }));
  }

  /** An empty file with the right headers — the shape a school should fill in. */
  async template(entityName: string, format: SheetFormat) {
    const entity = this.mustFind(entityName);
    return buildSheet(entity.columns, [], format, entity.label);
  }

  async export(entityName: string, format: SheetFormat) {
    const entity = this.mustFind(entityName);
    const client = await this.tenantPrisma.getClient();
    const rows = await entity.exportRows(client as never);

    if (entity.name === "staff") {
      // The service holds the decryption key, so masking happens here rather
      // than in the entity definition. Masked, never full: this file is built
      // to be emailed around.
      const profiles = await client.staffProfile.findMany({
        where: { deletedAt: null },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
      profiles.forEach((profile, index) => {
        const row = rows[index];
        if (!row) return;
        row.accountNumberMasked = maskAccountNumber(this.secrets.tryDecrypt(profile.accountNumberEncrypted)) ?? "";
      });
    }

    return { buffer: await buildSheet(entity.columns, rows, format, entity.label), rows: rows.length };
  }

  /**
   * Reads an uploaded file and says what it *would* do.
   *
   * Nothing is written. A school gets a per-row account of creates, updates
   * and problems, and decides from there — because a file that quietly
   * overwrites four hundred records is not undoable in any way they would
   * recognise.
   */
  async plan(entityName: string, filename: string, buffer: Buffer): Promise<ImportPlan & { canCommit: string | null }> {
    const entity = this.mustFind(entityName);
    const format = this.mustFormat(filename);

    const { headers, rows } = await parseSheet(buffer, format);
    if (rows.length >= MAX_IMPORT_ROWS) {
      throw new BadRequestException(`Please split files larger than ${MAX_IMPORT_ROWS} rows`);
    }

    const client = await this.tenantPrisma.getClient();
    const existingKeys = await entity.loadExistingKeys(client as never);
    const plan = buildImportPlan(headers, rows, entity.spec, existingKeys);

    return { ...plan, canCommit: canCommit(plan) };
  }

  /**
   * Carries out a plan.
   *
   * Rows are applied one at a time rather than in a single transaction, on
   * purpose. A school importing four hundred students with two bad rows wants
   * the three hundred and ninety-eight, and a failure report for the rest —
   * not a rollback that leaves them exactly where they started with no idea
   * which rows were at fault. Structural faults are still refused outright,
   * before anything is written.
   */
  async commit(entityName: string, filename: string, buffer: Buffer): Promise<CommitResult> {
    const entity = this.mustFind(entityName);
    const plan = await this.plan(entityName, filename, buffer);

    if (plan.canCommit) throw new BadRequestException(plan.canCommit);

    const client = await this.tenantPrisma.getClient();
    const result: CommitResult = { created: 0, updated: 0, skipped: 0, failures: [] };

    for (const row of plan.rows) {
      if (row.action === "error") {
        result.skipped += 1;
        continue;
      }
      try {
        await entity.apply(client as never, row);
        if (row.action === "create") result.created += 1;
        else result.updated += 1;
      } catch (error) {
        // Reported against the spreadsheet row, so the message is actionable
        // by the person holding the file.
        result.failures.push({ rowNumber: row.rowNumber, problem: explainFailure(error) });
      }
    }

    return result;
  }

  private mustFind(name: string): EntityDefinition {
    const entity = findEntity(name);
    if (!entity) {
      throw new NotFoundException(`There is nothing called "${name}" to import or export`);
    }
    return entity;
  }

  private mustFormat(filename: string): SheetFormat {
    const format = formatFromFilename(filename);
    if (!format) {
      throw new BadRequestException("Upload a .xlsx or .csv file — the older .xls format cannot be read");
    }
    return format;
  }
}
