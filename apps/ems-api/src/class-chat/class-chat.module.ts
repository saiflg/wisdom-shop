import { Module } from "@nestjs/common";
import { ClassChatController } from "./class-chat.controller";
import { ClassChatService } from "./class-chat.service";

@Module({
  controllers: [ClassChatController],
  providers: [ClassChatService],
})
export class ClassChatModule {}
