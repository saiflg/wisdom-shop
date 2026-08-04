import { Module } from "@nestjs/common";
import { MessagingModule } from "@/messaging/messaging.module";
import { GradingController } from "./grading.controller";
import { GradingService } from "./grading.service";

@Module({
  imports: [MessagingModule],
  controllers: [GradingController],
  providers: [GradingService],
  exports: [GradingService],
})
export class GradingModule {}
