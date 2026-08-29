import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { canSeeStudent, studentAudienceFor } from "./student-visibility";
import * as argon2 from "argon2";
import type { PrismaClient as TenantPrismaClient } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { TenancyService } from "@/tenancy/tenancy.service";
import { buildAdmissionNumber, schoolAbbreviation } from "./admission-number";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { CreateStudentDto } from "./dto/create-student.dto";
import type { UpdateStudentDto } from "./dto/update-student.dto";

const STUDENT_INCLUDE = {
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
  enrollments: {
    where: { status: "ACTIVE" as const },
    include: { class: { select: { id: true, name: true, academicYear: true } } },
  },
  guardianLinks: {
    include: { guardianUser: { select: { id: true, firstName: true, lastName: true, email: true } } },
  },
};

@Injectable()
export class StudentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenancy: TenancyService,
  ) {}


  /**
   * Claims the next admission number for this school.
   *
   * The serial is incremented in the same statement that reads it, so two
   * children admitted in the same second cannot be handed the same number —
   * the identical reason fee receipts claim theirs this way.
   *
   * Returns null when the school has switched automatic numbering off, which
   * leaves the old behaviour exactly as it was: the office types the code.
   */
  private async claimAdmissionNumber(client: TenantPrismaClient): Promise<string | null> {
    const settings =
      (await client.admissionSettings.findFirst()) ??
      // Created lazily rather than at provisioning, so schools that existed
      // before this feature get one the first time they admit a child.
      (await client.admissionSettings.create({ data: {} }));

    if (!settings.enabled) return null;

    const year = new Date().getFullYear();

    // A new year restarts the serial. Written as one update per branch
    // rather than a read-then-write, so a January morning with two
    // simultaneous admissions cannot reset the counter twice.
    const claimed =
      settings.counterYear === year
        ? await client.admissionSettings.update({
            where: { id: settings.id },
            data: { counter: { increment: 1 } },
          })
        : await client.admissionSettings.update({
            where: { id: settings.id },
            data: { counterYear: year, counter: 1 },
          });

    const abbreviation =
      settings.abbreviation?.trim() || schoolAbbreviation(await this.schoolName());

    return buildAdmissionNumber({ abbreviation, year, sequence: claimed.counter });
  }

  /** The school's own name, for deriving its letters. */
  private async schoolName(): Promise<string> {
    const client = await this.tenantPrisma.getClient();
    const branding = await client.brandingSettings.findFirst({ select: { displayName: true } });
    if (branding?.displayName?.trim()) return branding.displayName.trim();

    const school = await this.tenancy.resolveSchoolById(this.tenantPrisma.currentSchoolId);
    return school?.name ?? "";
  }

  async create(dto: CreateStudentDto) {
    if (dto.email && !dto.password) {
      throw new BadRequestException("password is required when email is set");
    }

    const client = await this.tenantPrisma.getClient();

    if (dto.email) {
      const existing = await client.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException("A user with that email already exists");
    }
    if (dto.studentCode) {
      const existingCode = await client.studentProfile.findUnique({ where: { studentCode: dto.studentCode } });
      if (existingCode) throw new ConflictException("A student with that code already exists");
    }

    const passwordHash = dto.password ? await argon2.hash(dto.password) : null;

    /*
     * A typed code always wins.
     *
     * A school arriving from paper has six years of children already
     * carrying a number, and the office typing one is saying "this is that
     * child". Generating over the top of it would not be a tidy-up.
     */
    let studentCode = dto.studentCode ?? (await this.claimAdmissionNumber(client));

    /*
     * The unique index is the guarantee, not this loop.
     *
     * A generated number can still collide: somebody may have typed
     * "DA/2026/0003" by hand last term, and the counter knows nothing about
     * it. Rather than failing an admission over a number, the next one is
     * claimed. Bounded, because a loop that cannot end is worse than an
     * error a person can read.
     */
    for (let attempt = 0; attempt < 5 && !dto.studentCode && studentCode; attempt++) {
      const taken = await client.studentProfile.findUnique({ where: { studentCode } });
      if (!taken) break;
      studentCode = await this.claimAdmissionNumber(client);
    }

    const user = await client.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roles: ["STUDENT"],
        studentProfile: {
          create: {
            studentCode,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          },
        },
      },
      include: { studentProfile: true },
    });

    return user.studentProfile;
  }

  /**
   * Staff see every student. A guardian sees the children they are linked to.
   * A pupil sees themselves. Anyone else sees nothing.
   *
   * "Which rows" is a data filter rather than a yes/no permission check, which
   * is why it lives here and not at the guard layer. It is written as an
   * exhaustive match on the viewer's audience rather than as a special case
   * for guardians — see student-visibility.ts. The previous shape asked
   * "GUARDIAN and not SCHOOL_ADMIN", and a pupil, being neither, fell through
   * to the branch that returns the whole roll.
   */
  async list(viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const audience = studentAudienceFor(viewer.roles);

    switch (audience) {
      case "ALL":
        return client.studentProfile.findMany({ where: { deletedAt: null }, include: STUDENT_INCLUDE });
      case "LINKED_CHILDREN":
        return client.studentProfile.findMany({
          where: { deletedAt: null, guardianLinks: { some: { guardianUserId: viewer.id } } },
          include: STUDENT_INCLUDE,
        });
      case "SELF":
        return client.studentProfile.findMany({
          where: { deletedAt: null, userId: viewer.id },
          include: STUDENT_INCLUDE,
        });
      case "NONE":
        return [];
    }
  }

  async findOne(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const record = await client.studentProfile.findFirst({
      where: { id, deletedAt: null },
      include: STUDENT_INCLUDE,
    });

    if (!record) throw new NotFoundException("No student found with that id");

    const allowed = canSeeStudent(
      studentAudienceFor(viewer.roles),
      {
        studentProfileId: record.id,
        studentUserId: record.userId,
        guardianUserIds: record.guardianLinks.map((link) => link.guardianUserId),
      },
      { userId: viewer.id },
    );

    // 404, not 403 — nobody must be able to tell "this student exists but
    // isn't mine" from "this student doesn't exist at all". Previously only a
    // guardian was checked here, so one pupil could read another pupil's
    // record, guardians' email addresses included.
    if (!allowed) throw new NotFoundException("No student found with that id");

    return record;
  }

  async update(id: string, dto: UpdateStudentDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.studentProfile.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("No student found with that id");

    const { firstName, lastName, studentCode, dateOfBirth } = dto;
    if (firstName || lastName) {
      await client.user.update({ where: { id: existing.userId }, data: { firstName, lastName } });
    }
    return client.studentProfile.update({
      where: { id },
      data: { studentCode, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined },
    });
  }
}
