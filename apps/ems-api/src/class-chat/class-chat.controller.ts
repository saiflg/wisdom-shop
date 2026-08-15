import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";
import { ClassChatService } from "./class-chat.service";
import { ClassAttachmentsService, type UploadedAttachment } from "./attachments.service";
import { MAX_BYTES } from "./attachments";
import { LockConversationDto, PostMessageDto, ReportMessageDto } from "./dto/class-chat.dto";

/**
 * Multer's own cap, set to the largest of ours.
 *
 * A blunt first gate so a 500MB upload is cut off at the socket rather than
 * buffered into memory and then refused. The per-kind caps in attachments.ts
 * are what actually decide; this only stops the obvious abuse earlier.
 */
const MAX_UPLOAD_BYTES = Math.max(...Object.values(MAX_BYTES));

@ApiTags("class-chat")
@ApiBearerAuth()
@RequiresModule("CLASS_CHAT")
@Controller()
export class ClassChatController {
  constructor(
    private readonly chat: ClassChatService,
    private readonly attachments: ClassAttachmentsService,
  ) {}

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

  @Get("class-chat/attachments/:id")
  @ApiOperation({
    summary: "Download a file shared in a class chat",
    description:
      "The only address these bytes ever have. Authorisation is re-checked against the message: somebody who " +
      "may not read the conversation gets a 404, and a removed message's attachment stops being fetchable.",
  })
  async attachment(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const file = await this.attachments.read(id, user, (message) => this.chat.canReadMessage(message, user));

    res.setHeader("Content-Type", file.contentType);
    // A PDF is a scripting host; it is served as a download rather than
    // framed inline from our own origin. Images and audio render inline.
    res.setHeader(
      "Content-Disposition",
      `${file.disposition}; filename="${encodeURIComponent(file.displayName)}"`,
    );
    // Never let a browser second-guess the type we validated at upload.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    // Private: this is one child's file, and a shared cache must not keep it.
    res.setHeader("Cache-Control", "private, max-age=300");

    // Piped rather than returned. Returning the stream with passthrough
    // serialises the ReadStream to JSON, which publishes the server's
    // absolute filesystem path — the same trap the photo route documents.
    file.stream.pipe(res);
  }

  @Post("classes/:classId/chat/file")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiOperation({
    summary: "Say something to the class, with a photo, voice note or PDF",
    description:
      "One request rather than an upload followed by a reference: two steps would mean trusting a client's " +
      "account of the file's type and size, and the allowlist exists precisely so none of that is trusted. " +
      "The caption may be empty when a file is attached.",
  })
  postWithFile(
    @Param("classId") classId: string,
    @Body() dto: PostMessageDto,
    @UploadedFile() file: UploadedAttachment | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chat.post(classId, dto, user, file);
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
