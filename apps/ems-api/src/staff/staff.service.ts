import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { toMaskedBankDetails, validateBankDetails } from "./bank-details";
import type { RegisterStaffDto, RevealAccountNumberDto, UpsertStaffProfileDto } from "./dto/staff.dto";
import { buildTurnover } from "./staff-turnover";

const UNIQUE_VIOLATION = "P2002";

/** Which column collided, so the message names the field the user must change. */
function collidedOn(error: unknown, field: string): boolean {
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? "").includes(field);
}

@Injectable()
export class StaffService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly secrets: TenantSecretsService,
  ) {}

  /**
   * Every staff member with their employment record.
   *
   * Bank details come back masked, always. There is no flag on this route to
   * return them unmasked — the full value has its own endpoint, so that
   * reading it is a decision someone makes rather than a default they inherit.
   */
  async list() {
    const client = await this.tenantPrisma.getClient();

    const staff = await client.user.findMany({
      where: { deletedAt: null, roles: { hasSome: ["TEACHER", "SCHOOL_ADMIN"] } },
      include: { staffProfile: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return staff.map((user) => this.present(user));
  }

  /**
   * Creates a staff login, with the employment record in the same breath.
   *
   * Until this existed the only way to make a staff account was
   * `POST /v1/teachers`, which always produced a TEACHER — so a school had
   * exactly one administrator, the one seeded at provisioning, and no way to
   * register a bursar, a registrar, or a second head. Losing that one login
   * meant losing the school.
   *
   * Both halves go in one `create`, so a duplicate staff number cannot leave
   * behind a login nobody asked for.
   */
  async register(dto: RegisterStaffDto) {
    const client = await this.tenantPrisma.getClient();

    // Optional now. Leaving it out creates the account with no password and
    // no way in until the office sends an invitation, which is the better
    // path: an administrator who types a colleague's password knows how to
    // sign in as them, and a teacher's account reaches every child's record
    // in the school. The password route stays for bulk imports and for
    // schools that genuinely want it.
    const passwordHash = dto.password ? await argon2.hash(dto.password) : null;
    const employment =
      dto.staffNumber || dto.jobTitle || dto.employmentType || dto.startDate
        ? {
            staffProfile: {
              create: {
                staffNumber: dto.staffNumber?.trim() || null,
                jobTitle: dto.jobTitle ?? null,
                employmentType: dto.employmentType ?? null,
                startDate: dto.startDate ? new Date(dto.startDate) : null,
              },
            },
          }
        : {};

    try {
      const user = await client.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          roles: [dto.role],
          ...employment,
        },
        include: { staffProfile: true },
      });
      return this.present(user);
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        if (collidedOn(error, "staffNumber")) {
          throw new ConflictException("Another staff member already has that staff number");
        }
        throw new ConflictException("Someone already has a login with that email address");
      }
      throw error;
    }
  }

  async findOne(userId: string) {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { staffProfile: true },
    });
    if (!user) throw new NotFoundException("No staff member found with that id");
    return this.present(user);
  }

  /**
   * Creates or updates the employment record behind a staff login.
   *
   * The account number is encrypted on the way in and never echoed back —
   * the response is the same masked shape as a list. Sending an empty string
   * clears it, which is distinct from omitting the field, which leaves it
   * alone. Without that distinction there would be no way to remove bank
   * details once entered.
   */
  async upsert(userId: string, dto: UpsertStaffProfileDto) {
    const client = await this.tenantPrisma.getClient();

    const user = await client.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { staffProfile: true },
    });
    if (!user) throw new NotFoundException("No staff member found with that id");

    const existingNumber = this.secrets.tryDecrypt(user.staffProfile?.accountNumberEncrypted);
    const problem = validateBankDetails({
      bankCode: dto.bankCode,
      // Validate against whichever name will be stored, not only a supplied
      // one — otherwise clearing the name while leaving a number on file
      // would slip through.
      accountName: dto.accountName ?? user.staffProfile?.accountName,
      accountNumber: dto.accountNumber !== undefined ? dto.accountNumber : existingNumber,
    });
    if (problem) throw new BadRequestException(problem);

    const accountNumberEncrypted =
      dto.accountNumber === undefined
        ? undefined
        : dto.accountNumber.trim() === ""
          ? null
          : this.secrets.encrypt(dto.accountNumber.trim());

    // A cleared field arrives as an empty string from a browser, and storing
    // that would leave a record that reads as filled in — a bank name of ""
    // renders as a bank nobody can name. Empty means nothing on file.
    const data = {
      staffNumber: dto.staffNumber?.trim() || null,
      jobTitle: dto.jobTitle?.trim() || null,
      employmentType: dto.employmentType ?? null,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      bankName: dto.bankName?.trim() || null,
      bankCode: dto.bankCode?.trim() || null,
      accountName: dto.accountName?.trim() || null,
      qualification: dto.qualification?.trim() || null,
      remark: dto.remark?.trim() || null,
      pensionPin: dto.pensionPin?.trim() || null,
      section: dto.section?.trim() || null,
      // Undefined means "not part of this edit" and leaves the arrangement
      // alone; a screen that omits the field must not silently switch off a
      // fee recovery somebody agreed to.
      ...(dto.childFeeDeductionCents === undefined
        ? {}
        : { childFeeDeductionCents: Math.max(0, Math.trunc(dto.childFeeDeductionCents)) }),
      ...(accountNumberEncrypted === undefined ? {} : { accountNumberEncrypted }),
    };

    try {
      await client.staffProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException("Another staff member already has that staff number");
      }
      throw error;
    }

    return this.findOne(userId);
  }

  /**
   * Returns one staff member's full account number, and records that it was
   * looked at.
   *
   * The log is written before the value is returned. If recording the access
   * fails, the caller does not get the number — an unlogged disclosure is
   * worse than a failed payroll run, because only one of the two is
   * recoverable.
   */
  async revealAccountNumber(userId: string, dto: RevealAccountNumberDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const user = await client.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { staffProfile: true },
    });
    if (!user?.staffProfile) throw new NotFoundException("No staff member found with that id");

    const accountNumber = this.secrets.tryDecrypt(user.staffProfile.accountNumberEncrypted);
    if (!accountNumber) throw new NotFoundException("No account number is on file for that staff member");

    const actor = await client.user.findUnique({
      where: { id: viewer.id },
      select: { firstName: true, lastName: true },
    });

    await client.bankDetailAccess.create({
      data: {
        staffProfileId: user.staffProfile.id,
        staffName: `${user.firstName} ${user.lastName}`,
        actorUserId: viewer.id,
        actorName: actor ? `${actor.firstName} ${actor.lastName}` : viewer.id,
        reason: dto.reason,
      },
    });

    return {
      staffUserId: user.id,
      accountName: user.staffProfile.accountName,
      bankName: user.staffProfile.bankName,
      bankCode: user.staffProfile.bankCode,
      accountNumber,
    };
  }

  /** Who has looked at whose bank details, most recent first. */
  async accessLog() {
    const client = await this.tenantPrisma.getClient();
    return client.bankDetailAccess.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  }

  /**
   * Who has left, grouped by the section they left a gap in.
   *
   * Somebody whose end date is in the future is still working: their
   * resignation is in, but counting them as gone would show a vacancy that is
   * not open and a salary the school is still paying.
   */
  async turnover(asAt = new Date()) {
    const client = await this.tenantPrisma.getClient();

    const profiles = await client.staffProfile.findMany({
      where: { endDate: { not: null, lte: asAt } },
      select: {
        id: true,
        section: true,
        jobTitle: true,
        startDate: true,
        endDate: true,
        user: { select: { firstName: true, lastName: true } },
        // Their final payslip: what they were actually last paid. Salary
        // components get edited and deleted after somebody leaves; a payslip
        // is a snapshot of what really happened.
        payslips: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { netCents: true, run: { select: { year: true, month: true } } },
        },
      },
    });

    return buildTurnover(
      profiles.map((profile) => ({
        staffProfileId: profile.id,
        name: `${profile.user.firstName} ${profile.user.lastName}`,
        section: profile.section,
        jobTitle: profile.jobTitle,
        startDate: profile.startDate,
        // Non-null by the query above; narrowed here rather than asserted so
        // a future change to the filter cannot silently produce an invalid row.
        endDate: profile.endDate ?? asAt,
        lastMonthlyCents: profile.payslips[0]?.netCents ?? null,
        // The school's currency is shown once in the page heading rather than
        // against every row, as it is on the voucher.
        currency: null,
      })),
    );
  }

  private present(user: {
    id: string;
    email: string | null;
    firstName: string;
    lastName: string;
    roles: string[];
    /**
     * Whether a password is set — never the hash itself. The office needs to
     * know who still cannot sign in, so it knows whom to invite.
     */
    passwordHash?: string | null;
    staffProfile: {
      id: string;
      staffNumber: string | null;
      jobTitle: string | null;
      employmentType: string | null;
      startDate: Date | null;
      endDate: Date | null;
      bankName: string | null;
      bankCode: string | null;
      accountName: string | null;
      accountNumberEncrypted: string | null;
      qualification: string | null;
      remark: string | null;
      pensionPin: string | null;
      section: string | null;
      childFeeDeductionCents: number;
    } | null;
  }) {
    const profile = user.staffProfile;
    // tryDecrypt rather than decrypt: a key rotation must not make the whole
    // staff list unreadable, it should show as "no number on file" until
    // someone re-enters it.
    const accountNumber = this.secrets.tryDecrypt(profile?.accountNumberEncrypted);

    return {
      id: user.id,
      // The employment record's own id, distinct from the user's. Anything
      // attached to somebody's employment rather than their login — a loan, a
      // payslip — is keyed on this, and without it a caller has to guess or
      // fetch each person again. Null for a user with no staff record.
      staffProfileId: profile?.id ?? null,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      // The hash itself never leaves this method; only whether one exists, so
      // the office can see who has never signed in and invite them.
      hasPassword: Boolean(user.passwordHash),
      staffNumber: profile?.staffNumber ?? null,
      jobTitle: profile?.jobTitle ?? null,
      employmentType: profile?.employmentType ?? null,
      startDate: profile?.startDate ?? null,
      endDate: profile?.endDate ?? null,
      qualification: profile?.qualification ?? null,
      remark: profile?.remark ?? null,
      // Returned in full, unlike the account number. A PIN identifies a
      // pension account but cannot move money out of it, and it is printed on
      // a schedule that leaves the building every month regardless.
      pensionPin: profile?.pensionPin ?? null,
      section: profile?.section ?? null,
      childFeeDeductionCents: profile?.childFeeDeductionCents ?? 0,
      bank: toMaskedBankDetails(profile ?? {}, accountNumber),
    };
  }
}
