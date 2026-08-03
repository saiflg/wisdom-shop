import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { PaymentProvider } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { TenantSecretsService, maskStored } from "@/common/crypto/tenant-secrets.service";
import { secretUpdateField } from "./secret-update";
import { PAYMENT_PROVIDERS } from "./dto/payment-settings.dto";
import type { UpdatePaymentGatewayDto } from "./dto/payment-settings.dto";

const TEST_TIMEOUT_MS = 15_000;

/**
 * Per-school payment gateway credentials. Same masking rules as the
 * communication gateways: reads return a hint, never the key or its
 * ciphertext.
 *
 * The shop (apps/api) has its own platform-level payment settings; these
 * are deliberately separate. A school collecting its own fees uses its own
 * merchant account, and mixing the two would route school money through the
 * platform's.
 */
@Injectable()
export class PaymentSettingsService {
  private readonly logger = new Logger(PaymentSettingsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly secrets: TenantSecretsService,
  ) {}

  /** All three providers, including ones never configured, so the UI can list them. */
  async list() {
    const client = await this.tenantPrisma.getClient();
    const rows = await client.paymentGatewaySettings.findMany();
    return PAYMENT_PROVIDERS.map((provider) => {
      const row = rows.find((candidate) => candidate.provider === provider);
      return this.view(provider, row ?? null);
    });
  }

  async get(provider: PaymentProvider) {
    const client = await this.tenantPrisma.getClient();
    const row = await client.paymentGatewaySettings.findUnique({ where: { provider } });
    return this.view(provider, row);
  }

  async update(provider: PaymentProvider, dto: UpdatePaymentGatewayDto) {
    const client = await this.tenantPrisma.getClient();
    const data = {
      publicKey: dto.publicKey,
      currency: dto.currency?.toUpperCase(),
      enabled: dto.enabled,
      ...secretUpdateField("secretKeyEncrypted", dto.secretKey, (v) => this.secrets.encrypt(v)),
      ...secretUpdateField("webhookSecretEncrypted", dto.webhookSecret, (v) => this.secrets.encrypt(v)),
    };

    await client.paymentGatewaySettings.upsert({
      where: { provider },
      create: { provider, ...data },
      update: data,
    });

    return this.get(provider);
  }

  /**
   * Verifies the stored credentials against the provider **without moving
   * money** — a "test payment" that actually charged a card would be
   * unacceptable to trigger from a settings screen. Each provider gets a
   * cheap authenticated read that fails on a bad key.
   */
  async test(provider: PaymentProvider): Promise<{ ok: true; provider: PaymentProvider; detail: string }> {
    const client = await this.tenantPrisma.getClient();
    const row = await client.paymentGatewaySettings.findUnique({ where: { provider } });
    const secretKey = this.secrets.tryDecrypt(row?.secretKeyEncrypted);
    if (!secretKey) {
      throw new ServiceUnavailableException(
        `${provider} isn't configured yet — save a secret key before running a test.`,
      );
    }

    const endpoint = this.verificationEndpoint(provider);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${secretKey}` },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (response.status === 401 || response.status === 403) {
        throw new ServiceUnavailableException(`${provider} rejected the secret key. Check that it is correct.`);
      }
      if (!response.ok) {
        throw new ServiceUnavailableException(`${provider} returned HTTP ${response.status} for the credential check.`);
      }
      return { ok: true, provider, detail: "Credentials accepted. No payment was created." };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${provider} credential check failed: ${message}`);
      throw new ServiceUnavailableException(`The ${provider} check failed: ${message}`);
    }
  }

  /** Read-only endpoints that authenticate with the secret key but change nothing. */
  private verificationEndpoint(provider: PaymentProvider): string {
    switch (provider) {
      case "PAYSTACK":
        return "https://api.paystack.co/transaction?perPage=1";
      case "FLUTTERWAVE":
        return "https://api.flutterwave.com/v3/subaccounts?page=1";
      case "STRIPE":
        return "https://api.stripe.com/v1/balance";
    }
  }

  private view(
    provider: PaymentProvider,
    row: {
      publicKey: string | null;
      secretKeyEncrypted: string | null;
      webhookSecretEncrypted: string | null;
      currency: string | null;
      enabled: boolean;
    } | null,
  ) {
    return {
      provider,
      publicKey: row?.publicKey ?? null,
      currency: row?.currency ?? null,
      enabled: row?.enabled ?? false,
      secretKey: maskStored(this.secrets.tryDecrypt(row?.secretKeyEncrypted)),
      webhookSecret: maskStored(this.secrets.tryDecrypt(row?.webhookSecretEncrypted)),
      configured: Boolean(row?.secretKeyEncrypted),
    };
  }
}
