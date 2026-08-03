import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";
import { CommunicationSettingsService } from "./communication-settings.service";

const TEST_TIMEOUT_MS = 15_000;

/**
 * "Send a test" for each gateway, using the school's own stored
 * credentials. These make real outbound calls on purpose — that is the
 * whole point of a test button — but only ever to an address the admin
 * supplies, and only after the gateway is fully configured.
 *
 * Failures are returned as a readable message rather than a raw provider
 * error, because the usual cause is a typo in the credentials and the admin
 * is the one who has to fix it.
 */
@Injectable()
export class GatewayTestService {
  private readonly logger = new Logger(GatewayTestService.name);

  constructor(private readonly settings: CommunicationSettingsService) {}

  async testEmail(to?: string): Promise<{ ok: true; sentTo: string }> {
    const config = await this.settings.resolveEmailConfig();
    if (!config) this.settings.notConfigured("email");

    const recipient = to ?? config.senderEmail;
    if (!recipient) {
      throw new BadRequestException("Provide a recipient address, or set a sender address in the gateway settings.");
    }

    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      // SSL means implicit TLS on connect (usually port 465); TLS/NONE both
      // start plaintext, with STARTTLS negotiated when offered.
      secure: config.encryption === "SSL",
      ignoreTLS: config.encryption === "NONE",
      auth: config.username && config.password ? { user: config.username, pass: config.password } : undefined,
      connectionTimeout: TEST_TIMEOUT_MS,
      greetingTimeout: TEST_TIMEOUT_MS,
    });

    try {
      await transport.sendMail({
        from: config.senderName ? `"${config.senderName}" <${config.senderEmail}>` : config.senderEmail,
        to: recipient,
        subject: "Wisdom Campus test email",
        text: "This is a test message confirming your school's email gateway is configured correctly.",
      });
      return { ok: true, sentTo: recipient };
    } catch (error) {
      throw this.asReadableFailure("email", error);
    } finally {
      transport.close();
    }
  }

  /**
   * Provider-agnostic by design: the school supplies the base URL and
   * credentials, so this posts a conventional payload rather than
   * implementing one vendor's API. Schools whose vendor expects a different
   * shape will need a per-provider adapter — noted as a follow-up.
   */
  async testSms(to: string): Promise<{ ok: true; sentTo: string }> {
    const config = await this.settings.resolveSmsConfig();
    if (!config) this.settings.notConfigured("SMS");

    try {
      const response = await this.postJson(config.baseUrl, {
        to,
        from: config.senderId ?? undefined,
        message: "Wisdom Campus test message.",
        apiKey: config.apiKey ?? undefined,
        apiSecret: config.apiSecret ?? undefined,
      });
      if (!response.ok) {
        throw new ServiceUnavailableException(
          `The SMS provider rejected the test (HTTP ${response.status}). Check the base URL and credentials.`,
        );
      }
      return { ok: true, sentTo: to };
    } catch (error) {
      throw this.asReadableFailure("SMS", error);
    }
  }

  async testWhatsApp(to: string): Promise<{ ok: true; sentTo: string }> {
    const config = await this.settings.resolveWhatsAppConfig();
    if (!config) this.settings.notConfigured("WhatsApp");

    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(config.phoneNumberId)}/messages`;
    try {
      const response = await this.postJson(
        url,
        {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: "Wisdom Campus test message." },
        },
        { Authorization: `Bearer ${config.accessToken}` },
      );
      if (!response.ok) {
        throw new ServiceUnavailableException(
          `WhatsApp rejected the test (HTTP ${response.status}). Check the access token and phone number ID.`,
        );
      }
      return { ok: true, sentTo: to };
    } catch (error) {
      throw this.asReadableFailure("WhatsApp", error);
    }
  }

  private async postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private asReadableFailure(gateway: string, error: unknown): Error {
    // Already one of ours (not-configured, provider-rejected) — pass through.
    if (error instanceof ServiceUnavailableException || error instanceof BadRequestException) return error;

    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`${gateway} gateway test failed: ${message}`);
    return new ServiceUnavailableException(`The ${gateway} test failed: ${message}`);
  }
}
