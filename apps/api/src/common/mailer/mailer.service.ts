import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { SettingsService } from "../../settings/settings.service";

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SmtpCheckResult {
  ok: boolean;
  message: string;
}

/**
 * Direct-send SMTP mailer. Order/notification-heavy phases should wrap this
 * behind a BullMQ processor for retries; auth flows send low-volume,
 * time-sensitive mail (verification/reset links) where at-least-once
 * best-effort delivery here is acceptable.
 *
 * The transport is built per configuration rather than once at boot, because
 * SMTP settings are now editable at runtime: a transport captured in the
 * constructor would keep using the old server until the API was restarted,
 * which makes the settings screen quietly useless.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;
  /** The configuration the current transport was built from. */
  private signature: string | null = null;

  constructor(private readonly settings: SettingsService) {}

  private async resolveConfig() {
    const [host, port, user, password, from] = await Promise.all([
      this.settings.get("SMTP_HOST"),
      this.settings.getNumber("SMTP_PORT"),
      this.settings.get("SMTP_USER"),
      this.settings.get("SMTP_PASSWORD"),
      this.settings.get("SMTP_FROM"),
    ]);

    return {
      host,
      port: port ?? 587,
      user,
      password,
      from: from ?? "Wisdom Shop <no-reply@wisdomshop.example>",
    };
  }

  private buildTransport(config: Awaited<ReturnType<typeof this.resolveConfig>>): Transporter | null {
    if (!config.host) return null;

    return createTransport({
      host: config.host,
      port: config.port,
      // Port 465 is implicit TLS; everything else upgrades via STARTTLS.
      secure: config.port === 465,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
    });
  }

  /** Reuses the transport while the settings behind it are unchanged. */
  private async getTransport(): Promise<{
    transporter: Transporter | null;
    from: string;
  }> {
    const config = await this.resolveConfig();
    const signature = JSON.stringify([config.host, config.port, config.user, config.password]);

    if (signature !== this.signature) {
      this.transporter = this.buildTransport(config);
      this.signature = signature;
      if (!this.transporter) {
        this.logger.warn(
          "SMTP host not configured — outgoing email will be logged, not sent. Set it in Admin → Settings → Email, or via SMTP_* environment variables.",
        );
      }
    }

    return { transporter: this.transporter, from: config.from };
  }

  async send(options: SendMailOptions): Promise<void> {
    const { transporter, from } = await this.getTransport();

    if (!transporter) {
      this.logger.log(`[dev email] to=${options.to} subject="${options.subject}"`);
      return;
    }

    try {
      await transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
    } catch (error) {
      // Auth flows must not fail the HTTP request just because mail delivery
      // hiccuped — the token still exists and can be resent/looked up.
      this.logger.error(`Failed to send email to ${options.to}: ${(error as Error).message}`);
    }
  }

  /**
   * Opens a connection and authenticates, without sending anything.
   *
   * Saving SMTP settings that silently do not work is the normal failure here
   * — nothing else surfaces it until a customer fails to receive a password
   * reset. This gives the admin screen a way to find out immediately.
   */
  async verifyConnection(): Promise<SmtpCheckResult> {
    const { transporter } = await this.getTransport();
    if (!transporter) {
      return { ok: false, message: "No SMTP host is configured, so mail is written to the log instead of sent." };
    }

    try {
      await transporter.verify();
      return { ok: true, message: "Connected and authenticated successfully." };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }
}
