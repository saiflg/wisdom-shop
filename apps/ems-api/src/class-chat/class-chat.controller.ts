import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";
import { ClassChatService } from "./class-chat.service";
import { LockConversationDto, PostMessageDto, ReportMessageDto } from "./dto/class-chat.dto";

@ApiTags("class-chat")
@ApiBearerAuth()
@RequiresModule("CLASS_CHAT")
@Controller()
export class ClassChatController {
  constructor(private readonly chat: ClassChatService) {}

  @Get("classes/:classId/members")
  @ApiOperation({
    summary: "Who is in this class: students, their teachers, and the school's leadership",
    description: "A student sees only their own class. Names only — a class list is not a contact list.",
  })
  members(@Param("classId") classId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.members(classId, user);
  }

  @Get("classes/:classId/chat")
  @ApiOperation({
    summary: "The class conversation, oldest last",
    description:
      "Students see removed messages as a gap; staff see what they said. Every response carries the notice students are shown about who can read this.",
  })
  conversation(
    @Param("classId") classId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query("before") before?: string,
  ) {
    return this.chat.conversation(classId, user, before);
  }

  @Post("classes/:classId/chat")
  @ApiOperation({ summary: "Say something to the class" })
  post(
    @Param("classId") classId: string,
    @Body() dto: PostMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chat.post(classId, dto, user);
  }

  @Put("classes/:classId/chat/lock")
  @ApiOperation({
    summary: "Pause or resume students posting",
    description: "Teachers of the class and administrators. Teachers can still write while it is paused.",
  })
  lock(
    @Param("classId") classId: string,
    @Body() dto: LockConversationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chat.lock(classId, dto, user);
  }

  @Delete("class-messages/:messageId")
  @ApiOperation({
    summary: "Remove a message",
    description:
      "A soft delete, always. Students may remove their own; staff may remove anybody's; and staff can still read what it said.",
  })
  remove(@Param("messageId") messageId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.remove(messageId, user);
  }

  @Post("class-messages/:messageId/report")
  @ApiOperation({
    summary: "Tell a teacher about a message",
    description: "Never deletes anything — otherwise a group could silence anyone by agreeing to report them.",
  })
  report(
    @Param("messageId") messageId: string,
    @Body() dto: ReportMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chat.report(messageId, dto, user);
  }

  @Get("class-messages/reports")
  @ApiOperation({ summary: "Reported messages, unreviewed first" })
  reports(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.reports(user);
  }
}
