import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { TenantSecretsService, maskStored } from "@/common/crypto/tenant-secrets.service";
import { secretUpdateField } from "./secret-update";
import type {
  UpdateEmailGatewayDto,
  UpdatePushGatewayDto,
  UpdateSmsGatewayDto,
  UpdateWhatsAppGatewayDto,
} from "./dto/communication-settings.dto";

/**
 * Per-school communication gateways. Every read goes through a `view`
 * mapper that replaces `*Encrypted` columns with a masked hint — the raw
 * rows must never be returned, since ciphertext is still material an
 * attacker could work on offline.
 *
 * Each gateway row is a lazily-created singleton: a school with no email
 * configured is a normal state, so there is nothing to seed at
 * provisioning time.
 */
@Injectable()
export class CommunicationSettingsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly secrets: TenantSecretsService,
  ) {}

  async getAll() {
    const [email, sms, whatsapp, push] = await Promise.all([
      this.getEmail(),
      this.getSms(),
      this.getWhatsApp(),
      this.getPush(),
    ]);
    return { email, sms, whatsapp, push };
  }

  // ── Email ────────────────────────────────────────────────────────────
  async getEmail() {
    const client = await this.tenantPrisma.getClient();
    const row = await client.emailGatewaySettings.findFirst();
    return {
      host: row?.host ?? null,
      port: row?.port ?? null,
      username: row?.username ?? null,
      encryption: row?.encryption ?? "TLS",
      senderName: row?.senderName ?? null,
      senderEmail: row?.senderEmail ?? null,
      password: maskStored(this.secrets.tryDecrypt(row?.passwordEncrypted)),
      configured: this.isEmailConfigured(row),
    };
  }

  async updateEmail(dto: UpdateEmailGatewayDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.emailGatewaySettings.findFirst();
    const data = {
      host: dto.host,
      port: dto.port,
      username: dto.username,
      encryption: dto.encryption,
      senderName: dto.senderName,
      senderEmail: dto.senderEmail,
      ...secretUpdateField("passwordEncrypted", dto.password, (v) => this.secrets.encrypt(v)),
    };

    if (existing) await client.emailGatewaySettings.update({ where: { id: existing.id }, data });
    else await client.emailGatewaySettings.create({ data });

    return this.getEmail();
  }

  /**
   * Resolves the full plaintext config for actually sending. Returns null
   * when incomplete, so callers surface "not configured" instead of
   * attempting a connection that cannot succeed.
   */
  async resolveEmailConfig() {
    const client = await this.tenantPrisma.getClient();
    const row = await client.emailGatewaySettings.findFirst();
    if (!this.isEmailConfigured(row)) return null;
    return {
      host: row!.host as string,
      port: row!.port as number,
      username: row!.username,
      password: this.secrets.tryDecrypt(row!.passwordEncrypted),
      encryption: row!.encryption,
      senderName: row!.senderName,
      senderEmail: row!.senderEmail as string,
    };
  }

  private isEmailConfigured(row: { host: string | null; port: number | null; senderEmail: string | null } | null) {
    return Boolean(row?.host && row?.port && row?.senderEmail);
  }

  // ── SMS ──────────────────────────────────────────────────────────────
  async getSms() {
    const client = await this.tenantPrisma.getClient();
    const row = await client.smsGatewaySettings.findFirst();
    return {
      providerName: row?.providerName ?? null,
      baseUrl: row?.baseUrl ?? null,
      senderId: row?.senderId ?? null,
      apiKey: maskStored(this.secrets.tryDecrypt(row?.apiKeyEncrypted)),
      apiSecret: maskStored(this.secrets.tryDecrypt(row?.apiSecretEncrypted)),
      configured: Boolean(row?.baseUrl && row?.apiKeyEncrypted),
    };
  }

  async updateSms(dto: UpdateSmsGatewayDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.smsGatewaySettings.findFirst();
    const data = {
      providerName: dto.providerName,
      baseUrl: dto.baseUrl,
      senderId: dto.senderId,
      ...secretUpdateField("apiKeyEncrypted", dto.apiKey, (v) => this.secrets.encrypt(v)),
      ...secretUpdateField("apiSecretEncrypted", dto.apiSecret, (v) => this.secrets.encrypt(v)),
    };

    if (existing) await client.smsGatewaySettings.update({ where: { id: existing.id }, data });
    else await client.smsGatewaySettings.create({ data });

    return this.getSms();
  }

  async resolveSmsConfig() {
    const client = await this.tenantPrisma.getClient();
    const row = await client.smsGatewaySettings.findFirst();
    if (!row?.baseUrl || !row.apiKeyEncrypted) return null;
    return {
      providerName: row.providerName,
      baseUrl: row.baseUrl,
      senderId: row.senderId,
      apiKey: this.secrets.tryDecrypt(row.apiKeyEncrypted),
      apiSecret: this.secrets.tryDecrypt(row.apiSecretEncrypted),
    };
  }

  // ── WhatsApp ─────────────────────────────────────────────────────────
  async getWhatsApp() {
    const client = await this.tenantPrisma.getClient();
    const row = await client.whatsAppGatewaySettings.findFirst();
    return {
      phoneNumberId: row?.phoneNumberId ?? null,
      businessAccountId: row?.businessAccountId ?? null,
      webhookUrl: row?.webhookUrl ?? null,
      accessToken: maskStored(this.secrets.tryDecrypt(row?.accessTokenEncrypted)),
      webhookVerifyToken: maskStored(this.secrets.tryDecrypt(row?.webhookVerifyTokenEncrypted)),
      configured: Boolean(row?.accessTokenEncrypted && row?.phoneNumberId),
    };
  }

  async updateWhatsApp(dto: UpdateWhatsAppGatewayDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.whatsAppGatewaySettings.findFirst();
    const data = {
      phoneNumberId: dto.phoneNumberId,
      businessAccountId: dto.businessAccountId,
      webhookUrl: dto.webhookUrl,
      ...secretUpdateField("accessTokenEncrypted", dto.accessToken, (v) => this.secrets.encrypt(v)),
      ...secretUpdateField("webhookVerifyTokenEncrypted", dto.webhookVerifyToken, (v) => this.secrets.encrypt(v)),
    };

    if (existing) await client.whatsAppGatewaySettings.update({ where: { id: existing.id }, data });
    else await client.whatsAppGatewaySettings.create({ data });

    return this.getWhatsApp();
  }

  async resolveWhatsAppConfig() {
    const client = await this.tenantPrisma.getClient();
    const row = await client.whatsAppGatewaySettings.findFirst();
    if (!row?.accessTokenEncrypted || !row.phoneNumberId) return null;
    return {
      phoneNumberId: row.phoneNumberId,
      accessToken: this.secrets.tryDecrypt(row.accessTokenEncrypted),
    };
  }

  // ── Push ─────────────────────────────────────────────────────────────
  async getPush() {
    const client = await this.tenantPrisma.getClient();
    const row = await client.pushGatewaySettings.findFirst();
    return {
      providerName: row?.providerName ?? null,
      credentials: maskStored(this.secrets.tryDecrypt(row?.credentialsEncrypted)),
      configured: Boolean(row?.credentialsEncrypted),
    };
  }

  async updatePush(dto: UpdatePushGatewayDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.pushGatewaySettings.findFirst();
    const data = {
      providerName: dto.providerName,
      ...secretUpdateField("credentialsEncrypted", dto.credentials, (v) => this.secrets.encrypt(v)),
    };

    if (existing) await client.pushGatewaySettings.update({ where: { id: existing.id }, data });
    else await client.pushGatewaySettings.create({ data });

    return this.getPush();
  }

  /** Shared "you haven't set this up yet" failure for the test endpoints. */
  notConfigured(gateway: string): never {
    throw new ServiceUnavailableException(
      `The ${gateway} gateway isn't configured yet — save its settings before sending a test.`,
    );
  }
}
