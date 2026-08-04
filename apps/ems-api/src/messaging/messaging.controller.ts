import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { MessageEvent, MessageStatus } from "ems-tenant-client";
import { Roles } from "@/auth/decorators/roles.decorator";
import { MessagingService } from "./messaging.service";
import { UpdateTemplateDto } from "./dto/messaging.dto";

@ApiTags("messaging")
@ApiBearerAuth()
@Controller("messaging")
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

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
