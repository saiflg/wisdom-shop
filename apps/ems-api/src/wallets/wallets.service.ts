import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { RecordWalletEntryDto } from "./dto/record-wallet-entry.dto";
import { balanceOf, isOverdraft, signedAmount, validateAmount } from "./wallet-math";

const STAFF_ROLES = ["SCHOOL_ADMIN", "TEACHER"];

@Injectable()
export class WalletsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * A wallet the caller is allowed to look at, created on first sight.
   *
   * Created lazily rather than at enrolment: a school that never uses wallets
   * should not accumulate a row per child, and the first top-up is the moment
   * one starts to mean anything.
   */
  async walletFor(studentProfileId: string, viewer: AuthenticatedUser) {
    await this.assertMayView(studentProfileId, viewer);
    const client = await this.tenantPrisma.getClient();

    const student = await client.studentProfile.findFirst({
      where: { id: studentProfileId },
      select: { id: true, user: { select: { firstName: true, lastName: true } } },
    });
    if (!student) throw new NotFoundException("No student found with that id");

    const wallet = await client.studentWallet.upsert({
      where: { studentProfileId },
      create: { studentProfileId },
      update: {},
    });

    return { ...wallet, student };
  }

  /**
   * The statement: newest first, because the question a parent arrives with
   * is almost always about the last thing that happened.
   */
  async statement(studentProfileId: string, viewer: AuthenticatedUser, take = 100) {
    const wallet = await this.walletFor(studentProfileId, viewer);
    const client = await this.tenantPrisma.getClient();

    const entries = await client.walletEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: Math.min(take, 500),
    });

    return { wallet, entries };
  }

  /**
   * Move money, and write down that it moved.
   *
   * The balance column is changed with an increment rather than by writing a
   * number we worked out first, so two tills serving the same child at the
   * same moment serialise on the row instead of racing. When the money is not
   * there the CHECK constraint fails the statement and the whole transaction
   * rolls back, which is why the entry is written inside it: there is no path
   * where the record says money moved and the balance disagrees.
   */
  async record(studentProfileId: string, dto: RecordWalletEntryDto, actor: AuthenticatedUser) {
    if (!actor.roles.some((role) => STAFF_ROLES.includes(role))) {
      throw new ForbiddenException("Only school staff can move money in a wallet");
    }

    const problem = validateAmount(dto.amountCents);
    if (problem) throw new BadRequestException(problem);

    const client = await this.tenantPrisma.getClient();
    const wallet = await client.studentWallet.upsert({
      where: { studentProfileId },
      create: { studentProfileId },
      update: {},
    });

    /*
     * A reference that has been seen before is not an error.
     *
     * Gateways retry. A bursar who is not sure the first click landed clicks
     * again. Both should end with the family credited exactly once, and the
     * honest answer to the second attempt is the entry the first one made —
     * not a conflict, and certainly not a second credit.
     */
    if (dto.reference) {
      const seen = await client.walletEntry.findFirst({
        where: { walletId: wallet.id, reference: dto.reference },
      });
      if (seen) return { entry: seen, duplicate: true };
    }

    const actorName = await this.nameOf(actor.id);
    const signed = signedAmount(dto.kind, dto.amountCents);

    try {
      const entry = await client.$transaction(async (tx) => {
        const updated = await tx.studentWallet.update({
          where: { id: wallet.id },
          data: { balanceCents: { increment: signed } },
        });

        return tx.walletEntry.create({
          data: {
            walletId: wallet.id,
            kind: dto.kind,
            amountCents: signed,
            balanceAfterCents: updated.balanceCents,
            description: dto.description,
            reference: dto.reference ?? null,
            recordedByUserId: actor.id,
            recordedByName: actorName,
          },
        });
      });

      return { entry, duplicate: false };
    } catch (error) {
      if (isOverdraft(error)) {
        throw new BadRequestException("There is not enough in this wallet for that");
      }
      // Two requests carrying the same reference can both pass the check
      // above and meet at the unique index. The family is credited once,
      // which is the point; the loser reads back what the winner wrote.
      if ((error as { code?: string }).code === "P2002" && dto.reference) {
        const seen = await client.walletEntry.findFirst({
          where: { walletId: wallet.id, reference: dto.reference },
        });
        if (seen) return { entry: seen, duplicate: true };
      }
      throw error;
    }
  }

  /**
   * Does the stored balance still equal the entries that produced it?
   *
   * Admin-only, and it changes nothing. The column is what decides a spend
   * and the entries are the record of what happened; if they ever part
   * company somebody needs to know before a parent finds it. Reported rather
   * than repaired, because a wallet that has drifted is a question about how
   * it drifted, not a number to overwrite.
   */
  async reconcile(studentProfileId: string, viewer: AuthenticatedUser) {
    if (!viewer.roles.includes("SCHOOL_ADMIN")) {
      throw new ForbiddenException("Only an administrator can reconcile a wallet");
    }

    const client = await this.tenantPrisma.getClient();
    const wallet = await client.studentWallet.findUnique({ where: { studentProfileId } });
    if (!wallet) throw new NotFoundException("That student has no wallet");

    const entries = await client.walletEntry.findMany({
      where: { walletId: wallet.id },
      select: { amountCents: true },
    });

    const fromEntries = balanceOf(entries);
    return {
      storedCents: wallet.balanceCents,
      fromEntriesCents: fromEntries,
      agrees: wallet.balanceCents === fromEntries,
      entryCount: entries.length,
    };
  }

  private async nameOf(userId: string): Promise<string> {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown";
  }

  /**
   * A family may look at their own child's wallet and nobody else's.
   *
   * Same shape as fees: the check is here rather than in the controller,
   * because a route that is open to guardians has to be narrowed by who is
   * asking, not by which role they hold.
   */
  private async assertMayView(studentProfileId: string, viewer: AuthenticatedUser) {
    if (viewer.roles.some((role) => STAFF_ROLES.includes(role))) return;

    const client = await this.tenantPrisma.getClient();

    if (viewer.roles.includes("GUARDIAN")) {
      const link = await client.guardianLink.findFirst({
        where: { guardianUserId: viewer.id, studentProfileId },
      });
      if (link) return;
    }

    const own = await client.studentProfile.findUnique({
      where: { userId: viewer.id },
      select: { id: true },
    });
    if (own?.id === studentProfileId) return;

    // 404 rather than 403, matching fees: telling somebody they are not
    // allowed to see a particular child confirms that child exists here.
    throw new NotFoundException("No student found with that id");
  }
}
