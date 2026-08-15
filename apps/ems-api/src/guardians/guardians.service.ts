import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { CreateGuardianDto } from "./dto/create-guardian.dto";
import { groupGuardians } from "./guardian-directory";
import { buildOverview, type OverviewInput } from "./parents-overview";
import {
  changedFields,
  cleanEmail,
  cleanPhone,
  contactProblem,
  describeReachability,
  parentChangeProblem,
  type ContactInput,
} from "./guardian-contact";

@Injectable()
export class GuardiansService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateGuardianDto) {
    const client = await this.tenantPrisma.getClient();

    const student = await client.studentProfile.findFirst({
      where: { id: dto.studentProfileId, deletedAt: null },
    });
    if (!student) throw new NotFoundException("No student found with that id");

    let guardianUser = await client.user.findUnique({ where: { email: dto.email } });

    if (!guardianUser) {
      if (!dto.firstName || !dto.lastName || !dto.password) {
        throw new BadRequestException(
          "firstName, lastName and password are required when creating a new guardian",
        );
      }
      const passwordHash = await argon2.hash(dto.password);
      guardianUser = await client.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          roles: ["GUARDIAN"],
        },
      });
    } else if (!guardianUser.roles.includes("GUARDIAN")) {
      guardianUser = await client.user.update({
        where: { id: guardianUser.id },
        data: { roles: { push: "GUARDIAN" } },
      });
    }

    const existingLink = await client.guardianLink.findUnique({
      where: {
        guardianUserId_studentProfileId: { guardianUserId: guardianUser.id, studentProfileId: student.id },
      },
    });
    if (existingLink) throw new ConflictException("This guardian is already linked to this student");

    return client.guardianLink.create({
      data: { guardianUserId: guardianUser.id, studentProfileId: student.id, relationship: dto.relationship },
      include: { guardianUser: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }

  /**
   * Every family in the school, one entry per guardian.
   *
   * Deliberately the whole school rather than only the families of children a
   * given teacher teaches — the same call already made for the parent-message
   * inbox. A parent who telephones needs whoever picks up to find them, and a
   * per-teacher view means the office cannot answer the phone.
   *
   * Children of soft-deleted students are excluded: the link outlives the
   * student record, and a directory that lists withdrawn pupils invites
   * somebody to contact a family about a child who has left.
   */
  async list() {
    const client = await this.tenantPrisma.getClient();

    const links = await client.guardianLink.findMany({
      where: { studentProfile: { deletedAt: null } },
      include: {
        guardianUser: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, passwordHash: true },
        },
        studentProfile: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true } },
            enrollments: {
              orderBy: { createdAt: "asc" },
              select: { class: { select: { name: true } } },
            },
          },
        },
      },
    });

    // The hash is reduced to a boolean here, before anything else sees the
    // rows. Handing the raw record to the grouper and trimming it later is
    // how a password hash reaches a screen the first time somebody adds a
    // field to the directory.
    return groupGuardians(
      links.map((link) => ({
        ...link,
        guardianUser: {
          id: link.guardianUser.id,
          firstName: link.guardianUser.firstName,
          lastName: link.guardianUser.lastName,
          email: link.guardianUser.email,
          phone: link.guardianUser.phone,
          hasPassword: Boolean(link.guardianUser.passwordHash),
        },
      })),
    );
  }

  /**
   * Correct a parent's email address or telephone number.
   *
   * The office's version. It may change both, because the office can see who
   * it is talking to — a parent standing at the desk, or a voice it knows on
   * the telephone.
   */
  async updateContact(guardianUserId: string, input: ContactInput, viewer?: { id: string }) {
    const client = await this.tenantPrisma.getClient();

    const guardian = await client.user.findFirst({
      where: { id: guardianUserId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, passwordHash: true, roles: true },
    });
    if (!guardian) throw new NotFoundException("No guardian found with that id");
    if (!guardian.roles.includes("GUARDIAN")) throw new BadRequestException("That person is not a guardian");

    const current = {
      email: guardian.email,
      phone: guardian.phone,
      hasPassword: Boolean(guardian.passwordHash),
    };

    const problem = contactProblem(current, input);
    if (problem) throw new BadRequestException(problem);

    const changed = changedFields(current, input);
    // Nothing to write. Reported honestly rather than as a save, so an
    // office is not told it changed something it did not.
    if (changed.length === 0) return this.presentContact(guardian.id, current, guardian, []);

    const data: { email?: string | null; phone?: string | null } = {};
    if (changed.includes("email")) data.email = cleanEmail(input.email);
    if (changed.includes("phone")) data.phone = cleanPhone(input.phone);

    try {
      const updated = await client.user.update({
        where: { id: guardianUserId },
        data,
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, passwordHash: true },
      });

      return this.presentContact(
        updated.id,
        { email: updated.email, phone: updated.phone, hasPassword: Boolean(updated.passwordHash) },
        updated,
        changed,
      );
    } catch (error) {
      // The email is unique across the school. Somebody else already has it,
      // which in a school usually means two parents sharing one address and
      // an office trying to record the second — worth saying plainly rather
      // than as "internal server error".
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictException("Another person at this school already uses that email address");
      }
      throw error;
    }
  }

  /**
   * The parent's own version.
   *
   * Their telephone number only. Email is what they sign in with, and an
   * account that can rewrite its own login identifier turns a session that
   * should not have been open into a permanent one — so that one goes
   * through the office, who can see who they are talking to.
   */
  async updateMyContact(viewer: { id: string; roles: string[] }, input: ContactInput) {
    if (!viewer.roles.includes("GUARDIAN")) {
      throw new BadRequestException("Only a parent or guardian has contact details to change here");
    }

    const refused = parentChangeProblem(input);
    if (refused) throw new BadRequestException(refused);

    return this.updateContact(viewer.id, input);
  }

  async myContact(viewer: { id: string }) {
    const client = await this.tenantPrisma.getClient();
    const me = await client.user.findFirst({
      where: { id: viewer.id, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, passwordHash: true },
    });
    if (!me) throw new NotFoundException("No account found");

    return this.presentContact(
      me.id,
      { email: me.email, phone: me.phone, hasPassword: Boolean(me.passwordHash) },
      me,
      [],
    );
  }

  /** Built by hand so a password hash can never ride along in a spread. */
  private presentContact(
    id: string,
    contact: { email: string | null; phone: string | null; hasPassword: boolean },
    person: { firstName: string; lastName: string },
    changed: string[],
  ) {
    return {
      guardianUserId: id,
      name: `${person.firstName} ${person.lastName}`,
      email: contact.email,
      phone: contact.phone,
      hasPassword: contact.hasPassword,
      reachability: describeReachability(contact),
      changed,
    };
  }

  /**
   * The morning view of a school's families.
   *
   * Everything is read in one pass rather than lazily per card, because the
   * page shows all of it at once and five sequential round trips on a slow
   * connection is what makes a dashboard feel broken.
   *
   * "Today" is the server's calendar day. A school runs on one clock in one
   * place, so a per-user timezone would be a fiction — and attendance
   * registers are already normalised to UTC midnight for the same reason.
   */
  async overview() {
    const client = await this.tenantPrisma.getClient();
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

    const [links, threads, absences, invoices] = await Promise.all([
      client.guardianLink.findMany({
        where: { studentProfile: { deletedAt: null } },
        include: {
          guardianUser: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, passwordHash: true },
          },
          studentProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      }),
      client.parentThread.findMany({
        where: { lastSide: "FAMILY", studentProfile: { deletedAt: null } },
        select: {
          studentProfileId: true,
          lastMessageAt: true,
          studentProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      }),
      client.attendanceRecord.findMany({
        where: {
          status: "ABSENT",
          register: { date: { gte: startOfDay, lt: endOfDay } },
          studentProfile: { deletedAt: null },
        },
        select: {
          studentProfileId: true,
          studentProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
          register: { select: { class: { select: { name: true } } } },
        },
      }),
      client.feeInvoice.findMany({
        // DRAFT is excluded on purpose: an invoice nobody has issued is not a
        // debt, and chasing a family for one is worse than not chasing at all.
        where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, studentProfile: { deletedAt: null } },
        select: {
          studentProfileId: true,
          totalCents: true,
          paidCents: true,
          currency: true,
          dueDate: true,
          studentProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      }),
    ]);

    // One entry per guardian, carrying every child — the same collapsing the
    // directory does, because a mother of three is one family here too.
    const byGuardian = new Map<string, OverviewInput["guardians"][number]>();
    for (const link of links) {
      const u = link.guardianUser;
      let entry = byGuardian.get(u.id);
      if (!entry) {
        entry = {
          guardianUserId: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          phone: u.phone,
          // The hash itself never leaves this method; only whether one exists.
          hasPassword: Boolean(u.passwordHash),
          childNames: [],
        };
        byGuardian.set(u.id, entry);
      }
      entry.childNames.push(`${link.studentProfile.user.firstName} ${link.studentProfile.user.lastName}`);
    }

    const name = (p: { user: { firstName: string; lastName: string } }) =>
      `${p.user.firstName} ${p.user.lastName}`;

    return buildOverview(
      {
        guardians: [...byGuardian.values()],
        awaitingReply: threads.map((t) => ({
          studentProfileId: t.studentProfileId,
          studentName: name(t.studentProfile),
          waitingSince: t.lastMessageAt ?? now,
        })),
        absentToday: absences.map((a) => ({
          studentProfileId: a.studentProfileId,
          studentName: name(a.studentProfile),
          className: a.register.class?.name ?? null,
        })),
        outstandingInvoices: invoices
          .map((i) => ({
            studentProfileId: i.studentProfileId,
            studentName: name(i.studentProfile),
            outstandingCents: i.totalCents - i.paidCents,
            currency: i.currency,
            dueDate: i.dueDate,
          }))
          // A fully paid invoice can still sit in PARTIALLY_PAID if the last
          // payment settled it exactly; owing nothing is not a debt.
          .filter((i) => i.outstandingCents > 0),
      },
      now,
    );
  }

  async remove(linkId: string) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.guardianLink.findUnique({ where: { id: linkId } });
    if (!existing) throw new NotFoundException("No guardian link found with that id");
    await client.guardianLink.delete({ where: { id: linkId } });
  }
}
