import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";
import { ParentMessagesService } from "./parent-messages.service";
import { PostParentMessageDto } from "./dto/parent-messages.dto";

@ApiTags("parent-messages")
@ApiBearerAuth()
@RequiresModule("MESSAGING")
@Controller("parent-messages")
export class ParentMessagesController {
  constructor(private readonly messages: ParentMessagesService) {}

  @Get()
  @ApiOperation({
    summary: "Conversations you are part of, ones awaiting the school first",
    description: "A family sees their own children; staff see the whole school, because whoever is on duty answers.",
  })
  threads(@CurrentUser() user: AuthenticatedUser) {
    return this.messages.threads(user);
  }

  @Get(":studentProfileId")
  @ApiOperation({
    summary: "The conversation about one child",
    description: "A guardian asking about a child who is not theirs gets a 404, never a 403.",
  })
  thread(@Param("studentProfileId") studentProfileId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.messages.thread(studentProfileId, user);
  }

  @Post(":studentProfileId")
  @ApiOperation({ summary: "Write to the school, or reply to a family" })
  post(
    @Param("studentProfileId") studentProfileId: string,
    @Body() dto: PostParentMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messages.post(studentProfileId, dto, user);
  }

  @Delete("messages/:messageId")
  @ApiOperation({
    summary: "Withdraw a message",
    description: "Leaves a marker rather than vanishing, and nobody — including staff — can read the original back.",
  })
  withdraw(@Param("messageId") messageId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.messages.withdraw(messageId, user);
  }
}
