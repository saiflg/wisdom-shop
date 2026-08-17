import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { MessageEvent, MessageStatus } from "ems-tenant-client";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { MessagingService } from "./messaging.service";
import { AnnouncementsService } from "./announcements.service";
import { UpdateTemplateDto } from "./dto/messaging.dto";
import { AnnouncementDto } from "./dto/announcement.dto";
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
