import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import type { MessageChannel, MessageEvent, MessageStatus } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { getTenantContext } from "@/tenancy/tenant-context";
import { CommunicationSettingsService } from "@/settings/communication-settings.service";
import { buildDedupeKey, renderTemplate, validateTemplate, type RenderContext } from "./render-template";
import { resolveRecipients, type GuardianLinkInput } from "./resolve-recipients";

const UNIQUE_VIOLATION = "P2002";
const SEND_TIMEOUT_MS = 15_000;

export interface NotifyInput {
  event: MessageEvent;
  studentProfileId: string;
  /** Parts identifying the thing this is about — never a timestamp. */
  dedupeParts: (string | number)[];
  context: Omit<RenderContext, "guardianName" | "schoolName">;
  channels?: MessageChannel[];
}

export interface NotifyOutcome {
  queued: number;
  skipped: number;
  duplicates: number;
}

const DEFAULT_CHANNELS: MessageChannel[] = ["EMAIL", "SMS"];

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly communication: CommunicationSettingsService,
  ) {}

  /**
   * Queues and sends the notifications for one event about one student.
   *
   * Never throws at the caller. Marking a register, raising invoices and
   * publishing results are the school's real work; a mail server being down
   * must not roll any of that back. Failures land in the outbox where they
   * can be seen and retried.
   */
  async notify(input: NotifyInput): Promise<NotifyOutcome> {
    try {
      return await this.dispatch(input);
    } catch (error) {
      this.logger.error(`Notification for ${input.event} failed entirely: ${String(error)}`);
      return { queued: 0, skipped: 0, duplicates: 0 };
    }
  }

  /**
   * Send one already-composed message to one address.
   *
   * The announcement path needs this: its text is typed by a person rather
   * than rendered from a template, and its recipients are a crowd rather than
   * one child's guardians. Everything after composing is identical, so it
   * reuses `record` and `deliver` rather than growing a second delivery path
   * that would drift from this one and be discovered when a school says
   * nothing arrived.
   *
   * Returns "duplicate" when the outbox's unique index refuses a second copy
   * to the same address — which is how pressing send twice stays harmless.
   */
  async sendComposed(args: {
    channel: MessageChannel;
    recipientUserId: string | null;
    recipientName: string;
    recipientAddress: string;
    subject: string | null;
    body: string;
    dedupeKey: string;
    announcementId?: string;
  }): Promise<"sent" | "duplicate"> {
    const client = await this.tenantPrisma.getClient();

    let created: { id: string };
    try {
      created = await client.message.create({
        data: {
          event: "MANUAL",
          channel: args.channel,
          recipientUserId: args.recipientUserId,
          recipientName: args.recipientName,
          recipientAddress: args.recipientAddress,
          subject: args.subject,
          body: args.body,
          status: "QUEUED",
          dedupeKey: args.dedupeKey,
          ...(args.announcementId ? { announcementId: args.announcementId } : {}),
        },
        select: { id: true },
      });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) return "duplicate";
      throw error;
    }

    // Never throws — failures are recorded on the row and shown in the outbox.
    await this.deliver(created);
    return "sent";
  }

  private async dispatch(input: NotifyInput): Promise<NotifyOutcome> {
    const client = await this.tenantPrisma.getClient();
    const outcome: NotifyOutcome = { queued: 0, skipped: 0, duplicates: 0 };

    const student = await client.studentProfile.findUnique({
      where: { id: input.studentProfileId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!student) return outcome;

    // Only this student's links are ever loaded; resolveRecipients filters
    // again on the same rule, so a mistake here would have to happen twice.
    const links = await client.guardianLink.findMany({
      where: { studentProfileId: input.studentProfileId },
      include: { guardianUser: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
    });

    const linkInputs: GuardianLinkInput[] = links.map((link) => ({
      guardianUserId: link.guardianUserId,
      studentProfileId: link.studentProfileId,
      guardianName: `${link.guardianUser.firstName} ${link.guardianUser.lastName}`,
      email: link.guardianUser.email,
      phone: link.guardianUser.phone,
      notifyByEmail: link.notifyByEmail,
      notifyBySms: link.notifyBySms,
    }));

    const schoolName = getTenantContext()?.schoolSlug ?? "Your school";
    const dedupeKey = buildDedupeKey(input.event, input.dedupeParts);
    const channels = input.channels ?? DEFAULT_CHANNELS;

    for (const channel of channels) {
      const template = await client.messageTemplate.findUnique({
        where: { event_channel: { event: input.event, channel } },
      });
      if (!template || !template.enabled) continue;

      const { recipients, skipped } = resolveRecipients(linkInputs, input.studentProfileId, channel);

      for (const skip of skipped) {
        const created = await this.record({
          input,
          channel,
          templateId: template.id,
          recipientUserId: skip.userId,
          recipientName: skip.name,
          // No address by definition — the dedupe index needs something
          // stable and distinct per recipient, and the user id is both.
          recipientAddress: `unavailable:${skip.userId}`,
          subject: null,
          body: "",
          status: "SKIPPED",
          statusReason: skip.reason,
          dedupeKey,
        });
        if (created === "duplicate") outcome.duplicates += 1;
        else outcome.skipped += 1;
      }

      for (const recipient of recipients) {
        const context: RenderContext = {
          ...input.context,
          schoolName,
          guardianName: recipient.name,
          studentName: `${student.user.firstName} ${student.user.lastName}`,
        };

        const body = renderTemplate(template.body, context);
        const subject = template.subject ? renderTemplate(template.subject, context) : null;

        // Fails closed: a template naming something this event cannot supply
        // produces a visible SKIPPED row explaining exactly what was missing,
        // never a message reading "Dear ,".
        if (!body.ok || (subject && !subject.ok)) {
          const problem = !body.ok ? body.problem : subject && !subject.ok ? subject.problem : "";
          const created = await this.record({
            input,
            channel,
            templateId: template.id,
            recipientUserId: recipient.userId,
            recipientName: recipient.name,
            recipientAddress: recipient.address,
            subject: null,
            body: "",
            status: "SKIPPED",
            statusReason: `Message not sent — ${problem}`,
            dedupeKey,
          });
          if (created === "duplicate") outcome.duplicates += 1;
          else outcome.skipped += 1;
          continue;
        }

        const created = await this.record({
          input,
          channel,
          templateId: template.id,
          recipientUserId: recipient.userId,
          recipientName: recipient.name,
          recipientAddress: recipient.address,
          subject: subject?.ok ? subject.text : null,
          body: body.text,
          status: "QUEUED",
          statusReason: null,
          dedupeKey,
        });

        if (created === "duplicate") {
          outcome.duplicates += 1;
          continue;
        }

        outcome.queued += 1;
        await this.deliver(created);
      }
    }

    return outcome;
  }

  /**
   * Writes the outbox row, letting the unique index decide whether this is a
   * repeat. Catching P2002 rather than checking first is what makes
   * send-once safe under concurrency — two teachers saving the same register
   * at once both reach here, and exactly one wins.
   */
  private async record(args: {
    input: NotifyInput;
    channel: MessageChannel;
    templateId: string;
    recipientUserId: string;
    recipientName: string;
    recipientAddress: string;
    subject: string | null;
    body: string;
    status: MessageStatus;
    statusReason: string | null;
    dedupeKey: string;
  }): Promise<{ id: string } | "duplicate"> {
    const client = await this.tenantPrisma.getClient();
    try {
      return await client.message.create({
        data: {
          event: args.input.event,
          channel: args.channel,
          templateId: args.templateId,
          recipientUserId: args.recipientUserId,
          recipientName: args.recipientName,
          recipientAddress: args.recipientAddress,
          studentProfileId: args.input.studentProfileId,
          subject: args.subject,
          body: args.body,
          status: args.status,
          statusReason: args.statusReason,
          dedupeKey: args.dedupeKey,
        },
        select: { id: true },
      });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) return "duplicate";
      throw error;
    }
  }

  /** Attempts delivery and records the outcome. Never throws. */
  private async deliver(message: { id: string }): Promise<void> {
    const client = await this.tenantPrisma.getClient();
    const row = await client.message.findUnique({ where: { id: message.id } });
    if (!row) return;

    try {
      const reference =
        row.channel === "EMAIL"
          ? await this.sendEmail(row.recipientAddress, row.subject, row.body)
          : await this.sendSms(row.recipientAddress, row.body);

      await client.message.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerReference: reference,
          attempts: { increment: 1 },
          statusReason: null,
        },
      });
    } catch (error) {
      const notConfigured = error instanceof GatewayNotConfigured;
      await client.message.update({
        where: { id: row.id },
        data: {
          // "Nowhere to send" is not a failure the school should be chasing.
          status: notConfigured ? "SKIPPED" : "FAILED",
          statusReason: notConfigured ? error.message : this.readableError(error),
          attempts: { increment: 1 },
        },
      });
    }
  }

  /**
   * Sends, or falls back to the log when no gateway is configured.
   *
   * The console fallback mirrors the shop's MailerService: a school that has
   * not set up SMTP yet still gets a complete, inspectable outbox instead of
   * a wall of errors, and nothing pretends to have been delivered.
   */
  private async sendEmail(to: string, subject: string | null, body: string): Promise<string | null> {
    const config = await this.communication.resolveEmailConfig().catch(() => null);
    if (!config?.host) {
      this.logger.log(`[no email gateway] would send to ${to}: ${subject ?? "(no subject)"}`);
      throw new GatewayNotConfigured("No email gateway is configured for this school");
    }

    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.encryption === "SSL",
      ignoreTLS: config.encryption === "NONE",
      auth: config.username && config.password ? { user: config.username, pass: config.password } : undefined,
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
    });

    try {
      const info = await transport.sendMail({
        from: config.senderName ? `"${config.senderName}" <${config.senderEmail}>` : config.senderEmail,
        to,
        subject: subject ?? "",
        text: body,
      });
      return info.messageId ?? null;
    } finally {
      transport.close();
    }
  }

  private async sendSms(to: string, body: string): Promise<string | null> {
    const config = await this.communication.resolveSmsConfig().catch(() => null);
    if (!config?.baseUrl) {
      this.logger.log(`[no sms gateway] would send to ${to}: ${body}`);
      throw new GatewayNotConfigured("No SMS gateway is configured for this school");
    }

    const response = await fetch(config.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ to, from: config.senderId, message: body }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`SMS provider returned ${response.status}`);
    return null;
  }

  private readableError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 300);
  }

  // ------------------------------------------------------------------ reads

  async listTemplates() {
    const client = await this.tenantPrisma.getClient();
    return client.messageTemplate.findMany({ orderBy: [{ event: "asc" }, { channel: "asc" }] });
  }

  /**
   * Edits a template, rejecting placeholders its event cannot supply.
   *
   * Validated here rather than left to fail at send time: rendering fails
   * closed, so an unchecked typo would not be a cosmetic bug but a
   * notification that silently never goes out, discovered by the family who
   * did not get it.
   */
  async updateTemplate(id: string, data: { subject?: string; body?: string; enabled?: boolean }) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.messageTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("No message template found with that id");

    for (const text of [data.body, data.subject]) {
      if (text === undefined) continue;
      const problem = validateTemplate(text, existing.event);
      if (problem) throw new BadRequestException(problem);
    }

    return client.messageTemplate.update({ where: { id }, data });
  }

  /** The outbox. Staff only — enforced by the controller's role guard. */
  async listMessages(filter: { status?: MessageStatus; event?: MessageEvent; take?: number }) {
    const client = await this.tenantPrisma.getClient();
    return client.message.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.event ? { event: filter.event } : {}),
      },
      include: {
        studentProfile: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(filter.take ?? 100, 200),
    });
  }

  /** Retries one failed message. Already-sent messages are left alone. */
  async retry(id: string) {
    const client = await this.tenantPrisma.getClient();
    const row = await client.message.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("No message found with that id");
    if (row.status === "SENT") return row;

    await this.deliver({ id });
    return client.message.findUnique({ where: { id } });
  }
}

/** Distinguishes "nowhere to send" from "sending went wrong". */
class GatewayNotConfigured extends Error {}
