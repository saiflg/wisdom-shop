import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ControlPrismaService } from "@/control-db/control-prisma.service";
import { ProvisioningService } from "@/provisioning/provisioning.service";
import { AuthService } from "@/auth/auth.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { RequestMeta, TokenPair } from "@/common/auth-types";
import type { EnvConfig } from "@/config/env.validation";
import { HandoffTokenError, verifyHandoffToken } from "./edu-handoff-token";
import type { OnboardFromLicenseDto } from "./dto/onboard-from-license.dto";

export type OnboardResult =
  | { alreadyOnboarded: true; schoolSlug: string }
  | ({ alreadyOnboarded: false } & TokenPair & { user: AuthenticatedUser });

@Injectable()
export class OnboardingService {
  constructor(
    private readonly controlPrisma: ControlPrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly provisioning: ProvisioningService,
    private readonly auth: AuthService,
  ) {}

  async onboardFromLicense(dto: OnboardFromLicenseDto, meta: RequestMeta): Promise<OnboardResult> {
    const payload = this.verifyToken(dto.token);

    // The whole point of storing licenseKey @unique: a license activates
    // at most one school, ever. A repeat click of "Complete Your School
    // Setup" (the token is re-mintable, so this isn't even rare — the
    // shop's frontend fetches a fresh one on every click) must not attempt
    // a second CREATE DATABASE, and must not be treated as an error either
    // — it's the same purchaser, correctly finishing what they already did.
    const existing = await this.controlPrisma.school.findUnique({ where: { licenseKey: payload.k } });
    if (existing) {
      return { alreadyOnboarded: true, schoolSlug: existing.slug };
    }

    const school = await this.provisioning.provisionSchool({
      name: dto.schoolName,
      slug: dto.schoolSlug,
      adminEmail: dto.adminEmail,
      adminPassword: dto.adminPassword,
      adminFirstName: dto.adminFirstName,
      adminLastName: dto.adminLastName,
      licenseKey: payload.k,
    });

    if (school.status !== "ACTIVE") {
      // Provisioning itself already recorded a ProvisioningAttempt with the
      // real cause — this is a genuine infra failure, not something the
      // purchaser can fix by retyping the form.
      throw new InternalServerErrorException(
        "Something went wrong setting up your school. Support has been notified — please try again shortly.",
      );
    }

    const session = await this.auth.login(dto.schoolSlug, dto.adminEmail, dto.adminPassword, meta);
    return { alreadyOnboarded: false, ...session };
  }

  private verifyToken(token: string) {
    try {
      return verifyHandoffToken(token, this.config.get("EDU_SETUP_SIGNING_SECRET", { infer: true }));
    } catch (error) {
      if (error instanceof HandoffTokenError) {
        throw new BadRequestException(
          "This setup link is invalid or has expired — go back to your account and click “Complete Your School Setup” again.",
        );
      }
      throw error;
    }
  }
}
