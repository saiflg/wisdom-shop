import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { MessageEvent, MessageStatus } from "ems-tenant-client";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { MessagingService } from "./messaging.service";
import { AnnouncementsService } from "./announcements.service";
import { UpdateTemplateDto } from "./dto/messaging.dto";
import { AnnouncementDto, AnnouncementDraftDto } from "./dto/announcement.dto";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";

@ApiTags("messaging")
@ApiBearerAuth()
@RequiresModule("MESSAGING")
@Controller("messaging")
export class MessagingController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly announcements: AnnouncementsService,
  ) {}

  @Get("announcements")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "What the school has announced, most recent first" })
  listAnnouncements() {
    return this.announcements.list();
  }

  @Post("announcements/preview")
  @HttpCode(HttpStatus.OK)
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "How many people this would reach, and who would be missed",
    description:
      "Sends nothing. An announcement cannot be recalled and text messages cost money per head, so the count " +
      "comes before the button rather than after it.",
  })
  previewAnnouncement(@Body() dto: AnnouncementDto) {
    return this.announcements.preview(dto);
  }

  @Post("announcements")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Send an announcement",
    description:
      "Every send carries one dedupe key, so the outbox's unique index makes a second press harmless rather " +
      "than sending the school a second copy.",
  })
  sendAnnouncement(@Body() dto: AnnouncementDto, @CurrentUser() user: AuthenticatedUser) {
    return this.announcements.send(dto, user);
  }

  /*
   * Drafts.
   *
   * This is what the "Newsletters" menu item was asking for. A second sender
   * beside announcements would have been the same list with one extra button;
   * what was actually missing was writing something now and sending it later.
   */

  @Post("announcements/drafts")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Save an announcement without sending it",
    description: "A draft only needs a title — the rest can be finished another day.",
  })
  saveDraft(@Body() dto: AnnouncementDraftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.announcements.saveDraft(dto, user);
  }

  @Patch("announcements/drafts/:id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Edit a draft",
    description: "Refused once it has been sent: the school's record must match what families received.",
  })
  updateDraft(@Param("id") id: string, @Body() dto: AnnouncementDraftDto) {
    return this.announcements.updateDraft(id, dto);
  }

  @Post("announcements/drafts/:id/send")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Send a draft",
    description: "Goes through the same send path as any announcement, so the audience rules cannot drift.",
  })
  sendDraft(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.announcements.sendDraft(id, user);
  }

  @Delete("announcements/drafts/:id")
  @Roles("SCHOOL_ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Discard a draft. A sent announcement cannot be deleted." })
  discardDraft(@Param("id") id: string) {
    return this.announcements.discardDraft(id);
  }

  @Get("announcements/:id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "One announcement, and how each individual send went" })
  announcement(@Param("id") id: string) {
    return this.announcements.detail(id);
  }

  @Get("templates")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "This school's message templates" })
  listTemplates() {
    return this.messaging.listTemplates();
  }

  @Patch("templates/:id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Edit a template",
    description:
      "Placeholders are checked against what the event can supply, so a typo is rejected here rather than " +
      "becoming a notification that silently never sends.",
  })
  updateTemplate(@Param("id") id: string, @Body() dto: UpdateTemplateDto) {
    return this.messaging.updateTemplate(id, dto);
  }

  @Get("health")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({
    summary: "Are this school's messages actually arriving?",
    description:
      "Read from the recent outbox rather than by testing a connection: what matters is whether real messages " +
      "to real families got through. A gateway that is simply not set up is reported as such, not as a fault.",
  })
  health() {
    return this.messaging.gatewayHealth();
  }

  @Get("outbox")
  @Roles("SCHOOL_ADMIN")
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "event", required: false })
  @ApiOperation({
    summary: "What the school has sent, and what it hasn't",
    description: "Staff only — the outbox spans every family, so it is never readable by a guardian.",
  })
  outbox(
    @Query("status") status?: MessageStatus,
    @Query("event") event?: MessageEvent,
    @Query("take") take?: string,
  ) {
    return this.messaging.listMessages({ status, event, take: take ? Number(take) : undefined });
  }

  @Post("outbox/:id/retry")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Retry a failed message. Already-sent messages are left alone." })
  retry(@Param("id") id: string) {
    return this.messaging.retry(id);
  }
}
