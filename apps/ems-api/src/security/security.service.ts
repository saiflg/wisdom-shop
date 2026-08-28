import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { alreadyEnded, describeDevice, isActive, revokeProblem, summariseSessions } from "./session-rules";

@Injectable()
export class SecurityService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * The sessions that can reach this account.
   *
   * Your own, always — never anybody else's, and not for administrators
   * either. A list of somebody's devices and the addresses they signed in
   * from is a record of where that person has been, and an administrator who
   * needs to shut an account down can do that without reading it (see
   * `revokeAllFor`).
   *
   * Expired sessions are shown alongside active ones because "when did that
   * device last have access" is a question somebody asks after losing a
   * phone, and an empty list would answer it wrongly.
   */
  async sessions(viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const now = new Date();

    const rows = await client.refreshToken.findMany({
      where: { userId: viewer.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    return {
      sessions: rows.map((row) => ({
        id: row.id,
        device: describeDevice(row.userAgent),
        // Shown in full: it is the viewer's own address, and a masked one
        // cannot answer "was that me, at home, on Tuesday?".
        ipAddress: row.ipAddress,
        startedAt: row.createdAt,
        lastUsedAt: row.updatedAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
        active: isActive(row, now),
      })),
      summary: summariseSessions(rows, now),
    };
  }

  /**
   * End one of your own sessions.
   *
   * Ending one that has already ended is reported, not refused — somebody
   * clicking twice because the first click seemed not to work should be told
   * it is already gone rather than shown a failure that makes them wonder
   * whether their account is still reachable.
   */
  async revoke(sessionId: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const session = await client.refreshToken.findFirst({
      where: { id: sessionId, userId: viewer.id },
    });

    // 404 rather than 403 for somebody else's session id: confirming that an
    // id exists is itself something worth not doing on a security screen.
    const problem = revokeProblem(session);
    if (problem) throw new NotFoundException(problem);

    const now = new Date();
    if (alreadyEnded(session!, now)) return { ended: false, alreadyEnded: true };

    await client.refreshToken.update({ where: { id: sessionId }, data: { revokedAt: now } });
    return { ended: true, alreadyEnded: false };
  }

  /**
   * End every session on this account, including the one asking.
   *
   * Deliberately not "everywhere else". The access token carries no session
   * id — only the refresh token does — so the server cannot tell which
   * session an ordinary request belongs to, and a button labelled "sign out
   * my other devices" would be guessing about the one thing somebody using it
   * most needs to be right. Signing everything out is the honest version, and
   * the screen says so before the button is pressed.
   */
  async revokeAll(viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const now = new Date();

    const { count } = await client.refreshToken.updateMany({
      where: { userId: viewer.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });

    return { ended: count };
  }

  /**
   * Shut somebody else's account out, without reading where they have been.
   *
   * For a lost laptop or a compromised account. An administrator gets the
   * count and nothing else — no devices, no addresses, no times. Being able
   * to protect somebody's account is a different power from being able to
   * see where they have been using it, and this keeps them apart.
   */
  async revokeAllFor(userId: string, actor: AuthenticatedUser) {
    if (!actor.roles.includes("SCHOOL_ADMIN")) {
      throw new ForbiddenException("Only an administrator can sign somebody else out");
    }

    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException("No user found with that id");

    const now = new Date();
    const { count } = await client.refreshToken.updateMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });

    return { ended: count };
  }
}
