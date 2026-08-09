import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PrismaClient as TenantPrismaClient } from "ems-tenant-client";
import type { EnvConfig } from "@/config/env.validation";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { TenancyService } from "@/tenancy/tenancy.service";
import { StorageService } from "@/storage/storage.service";
import {
  ALLOWED_IMAGE_TYPES,
  REJECTED_IMAGE_TYPES,
  brandingKeyFor,
  buildBrandingKey,
  storedNameOf,
} from "@/storage/storage";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRIMARY_COLOR,
  normaliseHexColor,
  toPublicBranding,
  type PublicBranding,
} from "./branding-rules";
import type { UpdateBrandingDto } from "./dto/update-branding.dto";

export interface UploadedLogo {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** The row shape used everywhere below, defaults included. */
interface BrandingRow {
  id: string | null;
  displayName: string | null;
  tagline: string | null;
  logoKey: string | null;
  primaryColor: string;
  accentColor: string;
}

const EMPTY: BrandingRow = {
  id: null,
  displayName: null,
  tagline: null,
  logoKey: null,
  primaryColor: DEFAULT_PRIMARY_COLOR,
  accentColor: DEFAULT_ACCENT_COLOR,
};

@Injectable()
export class BrandingService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenancy: TenancyService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * The school admin's own view: the same fields the public endpoint
   * returns, plus nothing. There is nothing secret in branding — the
   * separation exists because the *public* endpoint has to keep being
   * checked, not because this one hides anything.
   */
  async getForCurrentSchool(): Promise<PublicBranding & { schoolSlug: string }> {
    const client = await this.tenantPrisma.getClient();
    const row = await this.read(client);
    const school = await this.tenancy.resolveSchoolById(this.tenantPrisma.currentSchoolId);

    return {
      ...toPublicBranding({
        schoolName: school.name,
        branding: row,
        logoUrl: this.logoUrlFor(school.slug, row.logoKey),
      }),
      schoolSlug: school.slug,
    };
  }

  async update(dto: UpdateBrandingDto): Promise<PublicBranding & { schoolSlug: string }> {
    const client = await this.tenantPrisma.getClient();

    // Normalised on the way in, so the database only ever holds six
    // lowercase digits and every reader — CSS, contrast check, preview —
    // can stop worrying about which spelling it got.
    const data = {
      ...(dto.displayName !== undefined ? { displayName: emptyToNull(dto.displayName) } : {}),
      ...(dto.tagline !== undefined ? { tagline: emptyToNull(dto.tagline) } : {}),
      ...(dto.primaryColor !== undefined ? { primaryColor: normaliseHexColor(dto.primaryColor) } : {}),
      ...(dto.accentColor !== undefined ? { accentColor: normaliseHexColor(dto.accentColor) } : {}),
      updatedByUserId: this.tenantPrisma.currentUserId,
    };

    await this.writeSingleton(client, data);
    return this.getForCurrentSchool();
  }

  async replaceLogo(file: UploadedLogo | undefined): Promise<PublicBranding & { schoolSlug: string }> {
    if (!file) throw new BadRequestException("No file was uploaded");

    if (REJECTED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        "SVG logos are not accepted: an SVG can carry a script, and this logo is served on a page anyone can open.",
      );
    }

    const extension = ALLOWED_IMAGE_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException(`Unsupported image type "${file.mimetype}". Use PNG, JPEG or WebP.`);
    }

    const maxBytes = this.config.get("EMS_MAX_LOGO_MB", { infer: true }) * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(`That logo is larger than the ${maxBytes / 1024 / 1024}MB limit`);
    }

    const schoolId = this.tenantPrisma.currentSchoolId;
    const client = await this.tenantPrisma.getClient();
    const previous = (await this.read(client)).logoKey;

    const key = buildBrandingKey(schoolId, extension);
    await this.storage.save(key, file.buffer);
    await this.writeSingleton(client, { logoKey: key, updatedByUserId: this.tenantPrisma.currentUserId });

    // Only after the new key is committed. Deleting first would leave a
    // school with no logo if the write failed, and a new key every upload
    // means the old file is never the one being served in the meantime.
    if (previous && previous !== key) await this.storage.delete(previous);

    return this.getForCurrentSchool();
  }

  async removeLogo(): Promise<PublicBranding & { schoolSlug: string }> {
    const client = await this.tenantPrisma.getClient();
    const previous = (await this.read(client)).logoKey;
    await this.writeSingleton(client, { logoKey: null, updatedByUserId: this.tenantPrisma.currentUserId });
    if (previous) await this.storage.delete(previous);
    return this.getForCurrentSchool();
  }

  /**
   * Branding for a hostname, with no authentication at all.
   *
   * This is the login page's first request, so it runs before anyone has
   * proved anything. It reaches a tenant database directly through
   * TenancyService rather than TenantPrismaService, because there is no
   * tenant context to read — the host is what selected the school, and
   * `resolveSchoolByHost` has already refused anything that is not an
   * ACTIVE school.
   *
   * Returns null for an unrecognised host rather than throwing: the caller
   * turns that into "ask which school", which is the pre-existing behaviour.
   */
  async getPublicForHost(host: string | undefined): Promise<(PublicBranding & { schoolSlug: string }) | null> {
    const school = await this.tenancy.resolveSchoolByHost(host);
    if (!school) return null;
    return this.publicFor(school.id, school.slug, school.name);
  }

  /** Branding for a slug, used by the login page when the host says nothing. */
  async getPublicForSlug(slug: string): Promise<(PublicBranding & { schoolSlug: string }) | null> {
    const school = await this.tenancy.findActiveSchoolBySlug(slug);
    if (!school) return null;
    return this.publicFor(school.id, school.slug, school.name);
  }

  /**
   * Streams a school's logo. Public — it appears on the login page.
   *
   * The school is resolved from the slug in the URL and the key rebuilt
   * from that school's id, so the only thing a caller controls is which
   * *file within one school* they name, and `brandingKeyFor` refuses
   * anything that is not a name this service generated.
   */
  async openLogo(slug: string, name: string): Promise<{ stream: NodeJS.ReadableStream }> {
    const school = await this.tenancy.findActiveSchoolBySlug(slug);
    if (!school) throw new NotFoundException("File not found");

    const key = brandingKeyFor(school.id, name);
    if (!key) throw new NotFoundException("File not found");

    // The stored key still has to match the one this school actually
    // records. Without this, any well-formed UUID would be probeable
    // against the disk — and a deleted logo would go on being served.
    const client = await this.tenancy.getClientForSchool(school.id);
    const row = await this.read(client);
    if (row.logoKey !== key) throw new NotFoundException("File not found");

    return { stream: await this.storage.readStream(key) };
  }

  private async publicFor(schoolId: string, slug: string, name: string) {
    const client = await this.tenancy.getClientForSchool(schoolId);
    const row = await this.read(client);
    return {
      ...toPublicBranding({
        schoolName: name,
        branding: row,
        logoUrl: this.logoUrlFor(slug, row.logoKey),
      }),
      schoolSlug: slug,
    };
  }

  /**
   * Reads the singleton, or the defaults.
   *
   * "No row" is a normal state, not a missing-setup error: every school
   * provisioned before this model existed has none, and one that never
   * opens the branding page never will. Compare CurriculumSettings, which
   * throws — that one is seeded at provisioning and its absence really does
   * mean something went wrong.
   */
  private async read(client: TenantPrismaClient): Promise<BrandingRow> {
    const row = await client.brandingSettings.findFirst();
    if (!row) return EMPTY;
    return {
      id: row.id,
      displayName: row.displayName,
      tagline: row.tagline,
      logoKey: row.logoKey,
      primaryColor: row.primaryColor,
      accentColor: row.accentColor,
    };
  }

  private async writeSingleton(
    client: TenantPrismaClient,
    data: Record<string, unknown>,
  ): Promise<void> {
    const existing = await client.brandingSettings.findFirst({ select: { id: true } });
    if (existing) {
      await client.brandingSettings.update({ where: { id: existing.id }, data });
      return;
    }
    await client.brandingSettings.create({ data });
  }

  private logoUrlFor(slug: string, logoKey: string | null): string | null {
    if (!logoKey) return null;
    return `/v1/branding/logo/${slug}/${storedNameOf(logoKey)}`;
  }
}

/**
 * An admin who clears the display-name box means "use the registered name",
 * not "the school is called empty string". Storing `""` would defeat the
 * fallback in toPublicBranding.
 */
function emptyToNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
