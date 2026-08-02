import { Module } from "@nestjs/common";
import { CurriculumSettingsController } from "./curriculum-settings.controller";
import { CurriculumSettingsService } from "./curriculum-settings.service";

@Module({
  controllers: [CurriculumSettingsController],
  providers: [CurriculumSettingsService],
  exports: [CurriculumSettingsService],
})
export class CurriculumSettingsModule {}
