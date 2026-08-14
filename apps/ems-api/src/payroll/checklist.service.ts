import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import {
  approvalWarning,
  byPosition,
  isDuplicate,
  nextPosition,
  normaliseLabel,
  progressOf,
  seedFrom,
  type ChecklistItemLike,
} from "./payroll-checklist";

@Injectable()
export class ChecklistService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * The checklist for a run, created on first sight.
   *
   * Seeded from the previous run rather than from a template the school has
   * to maintain: whatever wording they settled on last month is what they get
   * this month, and the ticks never come with it.
   */
  async forRun(runId: string) {
    const client = await this.tenantPrisma.getClient();

    const run = await client.payrollRun.findUnique({
      where: { id: runId },
      select: { id: true, year: true, month: true, status: true },
    });
    if (!run) throw new NotFoundException("No payroll run found with that id");

    let items = await client.payrollChecklistItem.findMany({ where: { runId } });

    if (items.length === 0) {
      const previousRun = await client.payrollRun.findFirst({
        where: {
          OR: [{ year: { lt: run.year } }, { year: run.year, month: { lt: run.month } }],
        },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        select: { id: true },
      });

      const previous = previousRun
        ? await client.payrollChecklistItem.findMany({ where: { runId: previousRun.id } })
        : [];

      const seed = seedFrom(previous as ChecklistItemLike[]);
      if (seed.length > 0) {
        // createMany with skipDuplicates: two administrators opening the run
        // at the same moment would otherwise race, and the unique index would
        // turn a page view into a 500.
        await client.payrollChecklistItem.createMany({
          data: seed.map((entry) => ({ runId, label: entry.label, position: entry.position })),
          skipDuplicates: true,
        });
        items = await client.payrollChecklistItem.findMany({ where: { runId } });
      }
    }

    return this.present(run, items);
  }

  private present(
    run: { id: string; year: number; month: number; status: string },
    items: ChecklistItemLike[],
  ) {
    const ordered = [...items].sort(byPosition);
    const progress = progressOf(ordered);

    return {
      runId: run.id,
      period: { year: run.year, month: run.month },
      runStatus: run.status,
      items: ordered.map((item) => ({
        id: item.id,
        label: item.label,
        position: item.position,
        done: item.doneAt !== null,
        doneAt: item.doneAt,
        doneByName: item.doneByName,
        note: item.note,
      })),
      progress: {
        total: progress.total,
        done: progress.done,
        percent: progress.percent,
        complete: progress.complete,
      },
      // Shown next to the approve button, not only on this screen: the point
      // is to be read by somebody about to approve.
      warning: approvalWarning(progress),
    };
  }

  /**
   * Tick or untick a check.
   *
   * Unticking is allowed and keeps no history: this is a working list, not an
   * audit trail. Somebody who ticked the wrong line must be able to correct it
   * without asking an administrator, or they will simply leave it wrong.
   */
  async setDone(
    runId: string,
    itemId: string,
    done: boolean,
    viewer: { id: string },
    note?: string,
  ) {
    const client = await this.tenantPrisma.getClient();

    const item = await client.payrollChecklistItem.findFirst({ where: { id: itemId, runId } });
    if (!item) throw new NotFoundException("No checklist item found on that run");

    let doneByName: string | null = null;
    if (done) {
      const actor = await client.user.findUnique({
        where: { id: viewer.id },
        select: { firstName: true, lastName: true },
      });
      doneByName = actor ? `${actor.firstName} ${actor.lastName}` : viewer.id;
    }

    await client.payrollChecklistItem.update({
      where: { id: itemId },
      data: {
        doneAt: done ? new Date() : null,
        doneByUserId: done ? viewer.id : null,
        doneByName,
        note: note?.trim() || null,
      },
    });

    return this.forRun(runId);
  }

  async addItem(runId: string, label: string) {
    const client = await this.tenantPrisma.getClient();

    const clean = normaliseLabel(label);
    if (!clean) throw new BadRequestException("A check needs a description");

    const items = await client.payrollChecklistItem.findMany({ where: { runId } });
    if (isDuplicate(clean, items.map((i) => i.label))) {
      throw new ConflictException("That check is already on this list");
    }

    await client.payrollChecklistItem.create({
      data: { runId, label: clean, position: nextPosition(items) },
    });

    return this.forRun(runId);
  }

  async removeItem(runId: string, itemId: string) {
    const client = await this.tenantPrisma.getClient();
    const item = await client.payrollChecklistItem.findFirst({ where: { id: itemId, runId } });
    if (!item) throw new NotFoundException("No checklist item found on that run");

    await client.payrollChecklistItem.delete({ where: { id: itemId } });
    return this.forRun(runId);
  }
}
