import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { MessagingService } from "./messaging.service";
import {
  announcementDedupeKey,
  announcementProblem,
  audienceLabel,
  planAudience,
  sendWarning,
  type Audience,
  type AudienceInput,
  type Channel,
} from "./announcement-audience";

interface AnnouncementInput {
  title: string;
  body: string;
  audience: string;
  classId?: string | null;
  channels: string[];
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly messaging: MessagingService,
  ) {}

  /**
   * Everyone the school could reach, gathered once.
   *
   * Read whole rather than filtered per audience, because the pure planner
   * does the filtering and can then be tested without a database. A school
   * roll is thousands of rows at worst, which is a single query, not a
   * problem.
   */
  private async candidates(): Promise<AudienceInput> {
    const client = await this.tenantPrisma.getClient();

    const [links, staff] = await Promise.all([
      client.guardianLink.findMany({
        where: { studentProfile: { deletedAt: null } },
        include: {
          guardianUser: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          studentProfile: {
            select: { enrollments: { where: { status: "ACTIVE" }, select: { classId: true } } },
          },
        },
      }),
      client.user.findMany({
        where: { deletedAt: null, roles: { hasSome: ["TEACHER", "SCHOOL_ADMIN"] } },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      }),
    ]);

    return {
      guardians: links.map((link) => ({
        userId: link.guardianUser.id,
        name: `${link.guardianUser.firstName} ${link.guardianUser.lastName}`,
        email: link.guardianUser.email,
        phone: link.guardianUser.phone,
        notifyByEmail: link.notifyByEmail,
        notifyBySms: link.notifyBySms,
        classIds: link.studentProfile.enrollments.map((e) => e.classId),
      })),
      staff: staff.map((member) => ({
        userId: member.id,
        name: `${member.firstName} ${member.lastName}`,
        email: member.email,
        phone: member.phone,
      })),
    };
  }

  /**
   * What would happen, without anything happening.
   *
   * An announcement cannot be recalled and text messages cost money per head,
   * so the count comes before the button rather than after it.
   */
  async preview(input: AnnouncementInput) {
    const problem = announcementProblem(input);
    if (problem) throw new BadRequestException(problem);

    const candidates = await this.candidates();
    const plans = (input.channels as Channel[]).map((channel) =>
      planAudience({ ...candidates, classId: input.classId }, input.audience as Audience, channel),
    );

    return {
      audience: audienceLabel(input.audience as Audience),
      // Per channel rather than one total: a person reachable by both gets
      // one email and one text, and adding those to "2 people" would be a lie.
      channels: plans.map((plan) => ({
        channel: plan.channel,
        reach: plan.reach,
        summary: plan.summary,
        warning: sendWarning(plan),
        // A sample, not the roll. An administrator wants to sanity-check who
        // this is going to, not read four hundred names.
        examples: plan.recipients.slice(0, 5).map((r) => r.name),
        skipped: plan.skipped.slice(0, 20),
        skippedCount: plan.skipped.length,
      })),
      totalSends: plans.reduce((sum, plan) => sum + plan.reach, 0),
    };
  }

  /**
   * Send it.
   *
   * The announcement row is written first, so that a crash half way through
   * leaves a record of what was being sent and to whom — rather than four
   * hundred orphan messages and no explanation. Every send carries the same
   * dedupe key, so the outbox's unique index makes a second press harmless.
   */
  async send(input: AnnouncementInput, actor: AuthenticatedUser) {
    const problem = announcementProblem(input);
    if (problem) throw new BadRequestException(problem);

    const client = await this.tenantPrisma.getClient();
    const candidates = await this.candidates();
    const plans = (input.channels as Channel[]).map((channel) =>
      planAudience({ ...candidates, classId: input.classId }, input.audience as Audience, channel),
    );

    const reach = plans.reduce((sum, plan) => sum + plan.reach, 0);
    if (reach === 0) {
      throw new BadRequestException(
        "This would not reach anybody. Check the audience, and that people have an email address or phone number on file.",
      );
    }

    const author = await client.user.findUnique({
      where: { id: actor.id },
      select: { firstName: true, lastName: true },
    });

    const announcement = await client.announcement.create({
      data: {
        title: input.title.trim(),
        body: input.body.trim(),
        audience: input.audience,
        classId: input.audience === "CLASS" ? (input.classId ?? null) : null,
        channels: input.channels,
        sentByUserId: actor.id,
        sentByName: author ? `${author.firstName} ${author.lastName}` : null,
        reached: reach,
        skipped: plans.reduce((sum, plan) => sum + plan.skipped.length, 0),
      },
    });

    const dedupeKey = announcementDedupeKey(announcement.id);
    let sent = 0;
    let duplicates = 0;

    for (const plan of plans) {
      for (const recipient of plan.recipients) {
        // One at a time. Four hundred parallel SMS calls is a rate-limit
        // incident with a provider, and this runs once in a while rather than
        // on a hot path.
        const outcome = await this.messaging.sendComposed({
          channel: recipient.channel,
          recipientUserId: recipient.userId,
          recipientName: recipient.name,
          recipientAddress: recipient.address,
          // An SMS has no subject line; putting the title in the body is how
          // a text message says what it is about.
          subject: recipient.channel === "EMAIL" ? announcement.title : null,
          body:
            recipient.channel === "EMAIL"
              ? announcement.body
              : `${announcement.title}: ${announcement.body}`,
          dedupeKey,
          announcementId: announcement.id,
        });
        if (outcome === "duplicate") duplicates += 1;
        else sent += 1;
      }
    }

    this.logger.log(`Announcement "${announcement.title}": ${sent} sent, ${duplicates} already sent`);

    return { id: announcement.id, title: announcement.title, sent, duplicates, reached: reach };
  }

  /** What the school has announced, most recent first. */
  async list() {
    const client = await this.tenantPrisma.getClient();
    const announcements = await client.announcement.findMany({
      orderBy: { sentAt: "desc" },
      take: 50,
      include: { class: { select: { name: true } } },
    });

    return announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      audience: announcement.audience,
      audienceLabel:
        announcement.audience === "CLASS" && announcement.class
          ? `The parents of ${announcement.class.name}`
          : audienceLabel(announcement.audience as Audience),
      channels: announcement.channels,
      reached: announcement.reached,
      skipped: announcement.skipped,
      sentByName: announcement.sentByName,
      sentAt: announcement.sentAt,
    }));
  }

  /** One announcement and how each send actually went. */
  async detail(id: string) {
    const client = await this.tenantPrisma.getClient();
    const messages = await client.message.findMany({
      where: { announcementId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        channel: true,
        recipientName: true,
        recipientAddress: true,
        status: true,
        statusReason: true,
        sentAt: true,
      },
    });

    const byStatus: Record<string, number> = {};
    for (const message of messages) byStatus[message.status] = (byStatus[message.status] ?? 0) + 1;

    return { id, deliveries: messages, byStatus };
  }
}
