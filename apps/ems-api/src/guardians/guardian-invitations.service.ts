import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import type { EnvConfig } from "@/config/env.validation";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { TenancyService } from "@/tenancy/tenancy.service";
import { hashToken } from "@/common/utils/hash-token";
import {
  canAccept,
  describeExpiry,
  expiryFor,
  invitationState,
  invitationUrl,
  refusalReason,
  supersedes,
} from "./guardian-invitations";

/**
 * 32 bytes of randomness, base64url.
 *
 * Not a UUID: a v4 UUID carries 122 bits and prints in a format people
 * recognise and try to shorten. This is 256 bits and obviously opaque.
 */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

@Injectable()
export class GuardianInvitationsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenancy: TenancyService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * Create an invitation and return the link, once.
   *
   * The plain token is returned here and nowhere else. It is not stored, not
   * logged, and cannot be read back — an administrator who loses it issues a
   * new one, which is a smaller problem than a recoverable password-reset
   * link sitting in a database.
   */
  async invite(guardianUserId: string, actor: { id: string }) {
    const client = await this.tenantPrisma.getClient();

    const guardian = await client.user.findFirst({
      where: { id: guardianUserId, deletedAt: null },
      select: { id: true, email: true, firstName: true, lastName: true, roles: true },
    });
    if (!guardian) throw new NotFoundException("No account found with that id");

    // Guardians *and* staff. The mechanism was written for parents and is
    // identical for a teacher: an administrator who types a colleague's
    // password knows how to sign in as them, and a teacher's account reaches
    // every child's record in the school. Students are excluded — a child's
    // password is set by the office, and a mailbox is not something every
    // pupil has.
    const invitable = ["GUARDIAN", "TEACHER", "SCHOOL_ADMIN"];
    if (!guardian.roles.some((role) => invitable.includes(role))) {
      throw new BadRequestException("Only parents and staff can be invited to set up their own password");
    }

    // Nowhere to send it. The office needs an email address on file first,
    // and saying so is more use than a link they cannot deliver.
    if (!guardian.email) {
      throw new BadRequestException("Add an email address for this person before inviting them");
    }

    const now = new Date();

    // One live link per parent. Two means one stops working the moment the
    // other is used and the office cannot tell which they sent.
    const existing = await client.guardianInvitation.findMany({
      where: { userId: guardianUserId, acceptedAt: null, revokedAt: null },
    });
    const stale = existing.filter((invitation) => supersedes(invitation, now)).map((i) => i.id);
    if (stale.length > 0) {
      await client.guardianInvitation.updateMany({
        where: { id: { in: stale } },
        // SUPERSEDED, not CANCELLED: a parent who opens the older of two
        // emails should be pointed at the newer one, not sent back to the
        // office for a link already sitting in their inbox.
        data: { revokedAt: now, revokedReason: "SUPERSEDED" },
      });
    }

    const actorUser = await client.user.findUnique({
      where: { id: actor.id },
      select: { firstName: true, lastName: true },
    });

    const token = mintToken();
    const invitation = await client.guardianInvitation.create({
      data: {
        userId: guardianUserId,
        tokenHash: hashToken(token),
        expiresAt: expiryFor(now),
        createdByUserId: actor.id,
        createdByName: actorUser ? `${actorUser.firstName} ${actorUser.lastName}` : null,
      },
    });

    const school = await this.tenancy.resolveSchoolById(this.tenantPrisma.currentSchoolId);

    return {
      id: invitation.id,
      guardian: {
        id: guardian.id,
        name: `${guardian.firstName} ${guardian.lastName}`,
        email: guardian.email,
      },
      /** Shown once. There is no route that returns this again. */
      url: invitationUrl(this.portalBaseUrl(), school.slug, token),
      expiresAt: invitation.expiresAt,
      expiresIn: describeExpiry(invitation, now),
      supersededCount: stale.length,
    };
  }

  /** Every invitation ever sent to one parent, newest first. */
  async forGuardian(guardianUserId: string) {
    const client = await this.tenantPrisma.getClient();
    const now = new Date();

    const invitations = await client.guardianInvitation.findMany({
      where: { userId: guardianUserId },
      orderBy: { createdAt: "desc" },
    });

    // The token hash never leaves this method, so the shape is built by hand
    // rather than spread — a spread here is how a digest ends up on a screen
    // the first time somebody adds a field.
    return invitations.map((invitation) => ({
      id: invitation.id,
      state: invitationState(invitation, now),
      expiresIn: describeExpiry(invitation, now),
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      sentByName: invitation.createdByName,
      createdAt: invitation.createdAt,
    }));
  }

  async revoke(invitationId: string) {
    const client = await this.tenantPrisma.getClient();

    const invitation = await client.guardianInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw new NotFoundException("No invitation found with that id");

    // Cancelling something already used would rewrite history: the parent is
    // in, and pretending otherwise hides a real access grant.
    if (invitation.acceptedAt) {
      throw new BadRequestException("That invitation has already been used and cannot be cancelled");
    }

    if (!invitation.revokedAt) {
      await client.guardianInvitation.update({
        where: { id: invitationId },
        data: { revokedAt: new Date(), revokedReason: "CANCELLED" },
      });
    }

    return this.forGuardian(invitation.userId);
  }

  /**
   * What the parent's browser asks before showing the form.
   *
   * Unauthenticated, so it says as little as possible: whether the link
   * works and whose name is on it, and nothing about the child, the school's
   * other families, or the email address itself.
   */
  async check(schoolSlug: string, token: string) {
    const found = await this.findByToken(schoolSlug, token);
    if (!found) return { valid: false, reason: "This invitation link is not valid." as string, name: null };

    const now = new Date();
    const reason = refusalReason(found.invitation, now);
    if (reason) return { valid: false, reason, name: null };

    return {
      valid: true,
      reason: null,
      // A first name so the page can greet them and they can tell a
      // mis-sent link from their own. Nothing else.
      name: found.firstName,
    };
  }

  /**
   * The parent chooses their password.
   *
   * Single use is enforced by the update's own where clause rather than by
   * checking and then writing: two taps on a slow phone connection are two
   * concurrent requests, and a check-then-write lets both through.
   */
  async accept(schoolSlug: string, token: string, password: string) {
    const found = await this.findByToken(schoolSlug, token);
    if (!found) throw new BadRequestException("This invitation link is not valid.");

    const now = new Date();
    const reason = refusalReason(found.invitation, now);
    if (reason) throw new BadRequestException(reason);
    if (!canAccept(found.invitation, now)) throw new BadRequestException("This invitation link is not valid.");

    const passwordHash = await argon2.hash(password);

    const claimed = await found.client.guardianInvitation.updateMany({
      where: { id: found.invitation.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: now },
    });
    // Somebody else got there first — the other request is setting the
    // password, and this one must not overwrite it.
    if (claimed.count === 0) {
      throw new BadRequestException("This invitation has already been used.");
    }

    await found.client.user.update({
      where: { id: found.invitation.userId },
      data: { passwordHash },
    });

    // Any session opened with a password this parent did not choose stops
    // here: if the office set one when the account was created, that is
    // exactly the access this feature exists to end.
    await found.client.refreshToken.updateMany({
      where: { userId: found.invitation.userId, revokedAt: null },
      data: { revokedAt: now },
    });

    return { ok: true, schoolSlug, email: found.email };
  }

  /**
   * Resolve a token inside one school.
   *
   * The slug comes from the link rather than from a header because the
   * parent is not signed in and there is no tenant context to read. An
   * unknown slug and an unknown token both return null, so neither can be
   * used to find out which schools exist.
   */
  private async findByToken(schoolSlug: string, token: string) {
    if (!token) return null;

    // findActive… rather than resolve…: this one returns null for an unknown
    // or suspended school instead of throwing, which is the answer wanted
    // here — an unknown slug must look exactly like an unknown token.
    const school = await this.tenancy.findActiveSchoolBySlug(schoolSlug);
    if (!school) return null;

    const client = await this.tenancy.getClientForSchool(school.id);
    const invitation = await client.guardianInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!invitation) return null;

    const user = await client.user.findFirst({
      where: { id: invitation.userId, deletedAt: null },
      select: { firstName: true, email: true },
    });
    // The account was removed after the invitation went out.
    if (!user) return null;

    return { client, invitation, firstName: user.firstName, email: user.email };
  }

  /**
   * Where the parent portal lives.
   *
   * Configured rather than derived from the request: a link built from a
   * Host header is a link an attacker can point wherever they like by
   * setting that header, and this one goes in an email.
   */
  private portalBaseUrl(): string {
    return this.config.get("APP_URL", { infer: true });
  }
}
