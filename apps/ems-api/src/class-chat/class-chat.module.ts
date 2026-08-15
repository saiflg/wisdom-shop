import { Module } from "@nestjs/common";
import { StorageModule } from "@/storage/storage.module";
import { ClassChatController } from "./class-chat.controller";
import { ClassChatService } from "./class-chat.service";
import { ClassAttachmentsService } from "./attachments.service";

@Module({
  imports: [StorageModule],
  controllers: [ClassChatController],
  providers: [ClassChatService, ClassAttachmentsService],
})
export class ClassChatModule {}
