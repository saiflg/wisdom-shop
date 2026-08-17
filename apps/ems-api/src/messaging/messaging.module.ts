import { Module } from "@nestjs/common";
import { SettingsModule } from "@/settings/settings.module";
import { MessagingController } from "./messaging.controller";
import { MessagingService } from "./messaging.service";
import { AnnouncementsService } from "./announcements.service";

/**
 * Exported so attendance, fees and grading can notify without importing each
 * other — the modules that produce events stay unaware of how a message
 * reaches a family.
 */
@Module({
  imports: [SettingsModule],
  controllers: [MessagingController],
  providers: [MessagingService, AnnouncementsService],
  exports: [MessagingService],
})
export class MessagingModule {}
