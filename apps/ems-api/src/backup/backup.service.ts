import { Injectable } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { ENTITIES } from "@/data-exchange/entities";
import { buildWorkbook } from "@/data-exchange/workbook";

/**
 * What this screen honestly is.
 *
 * It is not "back up the school". It cannot see the server's own backups, it
 * cannot trigger one, and it cannot restore anything — those live on the
 * machine and are run by whoever administers it.
 *
 * What it CAN do is give a school a copy of its own records in a file it
 * holds itself, which is the part a school can actually act on: something to
 * keep off this system entirely. Everything that is not in that file is
 * listed rather than implied, because a file called "backup" that quietly
 * lacked the photographs is worse than no file at all — somebody would delete
 * the originals.
 */

export interface BackupCoverage {
  /** Entities that go into the download, by their own label. */
  included: string[];
  /** Things a school might reasonably expect and will not get. */
  excluded: string[];
}

@Injectable()
export class BackupService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** What a download would and would not contain, in words, before pressing it. */
  coverage(): BackupCoverage {
    return {
      included: ENTITIES.map((entity) => entity.label),
      excluded: [
        "Photographs of children and staff, and any file uploaded as an attachment.",
        "Marks, results and report cards.",
        "Fee invoices, payments and payroll.",
        "Messages, announcements and anything in the outbox.",
        "This is a copy of records, not a database backup. It cannot be restored over the top of the school — it is something to read, and to hold somewhere else.",
      ],
    };
  }

  /**
   * One spreadsheet, a sheet per entity.
   *
   * Sequential rather than parallel: this reads most of a school in one go,
   * and five simultaneous full-table scans on a small server is how a
   * download nobody was waiting for makes the console slow for everybody who
   * was.
   */
  async download(): Promise<{ buffer: Buffer; filename: string }> {
    const client = await this.tenantPrisma.getClient();

    const sheets = [];
    for (const entity of ENTITIES) {
      sheets.push({
        name: entity.label,
        columns: entity.columns,
        rows: await entity.exportRows(client as never),
      });
    }

    const buffer = await buildWorkbook(sheets);
    const stamp = new Date().toISOString().slice(0, 10);
    return { buffer, filename: `school-records-${stamp}.xlsx` };
  }
}
