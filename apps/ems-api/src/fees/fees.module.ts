import { Module } from "@nestjs/common";
import { MessagingModule } from "@/messaging/messaging.module";
import { FeesController } from "./fees.controller";
import { FeesService } from "./fees.service";

@Module({
  imports: [MessagingModule],
  controllers: [FeesController],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
