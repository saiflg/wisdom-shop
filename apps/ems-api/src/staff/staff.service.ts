import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { toMaskedBankDetails, validateBankDetails } from "./bank-details";
import type { RevealAccountNumberDto, UpsertStaffProfileDto } from "./dto/staff.dto";

const UNIQUE_VIOLATION = "P2002";

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

    const data = {
      staffNumber: dto.staffNumber?.trim() || null,
      jobTitle: dto.jobTitle ?? null,
      employmentType: dto.employmentType ?? null,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      bankName: dto.bankName ?? null,
      bankCode: dto.bankCode ?? null,
      accountName: dto.accountName ?? null,
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

  private present(user: {
    id: string;
    email: string | null;
    firstName: string;
    lastName: string;
    roles: string[];
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
    } | null;
  }) {
    const profile = user.staffProfile;
    // tryDecrypt rather than decrypt: a key rotation must not make the whole
    // staff list unreadable, it should show as "no number on file" until
    // someone re-enters it.
    const accountNumber = this.secrets.tryDecrypt(profile?.accountNumberEncrypted);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      staffNumber: profile?.staffNumber ?? null,
      jobTitle: profile?.jobTitle ?? null,
      employmentType: profile?.employmentType ?? null,
      startDate: profile?.startDate ?? null,
      endDate: profile?.endDate ?? null,
      bank: toMaskedBankDetails(profile ?? {}, accountNumber),
    };
  }
}
