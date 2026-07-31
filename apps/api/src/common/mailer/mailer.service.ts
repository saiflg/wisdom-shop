import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Direct-send SMTP mailer. Order/notification-heavy phases should wrap this
 * behind a BullMQ processor for retries; auth flows send low-volume,
 * time-sensitive mail (verification/reset links) where at-least-once
 * best-effort delivery here is acceptable.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>("SMTP_HOST");
    const from = this.config.get<string>("SMTP_FROM") ?? "Wisdom Shop <no-reply@wisdomshop.example>";
    this.from = from;

    if (!host) {
      this.logger.warn(
        "SMTP_HOST not configured — outgoing email will be logged, not sent. Set SMTP_* env vars for real delivery.",
      );
      this.transporter = null;
      return;
    }

    this.transporter = createTransport({
      host,
      port: this.config.get<number>("SMTP_PORT") ?? 587,
      secure: (this.config.get<number>("SMTP_PORT") ?? 587) === 465,
      auth: this.config.get<string>("SMTP_USER")
        ? {
            user: this.config.get<string>("SMTP_USER"),
            pass: this.config.get<string>("SMTP_PASSWORD"),
          }
        : undefined,
    });
  }

  async send(options: SendMailOptions): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[dev email] to=${options.to} subject="${options.subject}"`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
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
}
