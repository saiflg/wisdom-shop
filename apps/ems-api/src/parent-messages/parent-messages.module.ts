import { Module } from "@nestjs/common";
import { ParentMessagesController } from "./parent-messages.controller";
import { ParentMessagesService } from "./parent-messages.service";

@Module({
  controllers: [ParentMessagesController],
  providers: [ParentMessagesService],
})
export class ParentMessagesModule {}
