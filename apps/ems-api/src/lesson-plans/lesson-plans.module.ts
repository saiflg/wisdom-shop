import { Module } from "@nestjs/common";
import { AiModule } from "@/ai/ai.module";
import { CurriculumSettingsModule } from "@/curriculum-settings/curriculum-settings.module";
import { LessonPlansController } from "./lesson-plans.controller";
import { LessonPlansService } from "./lesson-plans.service";

@Module({
  imports: [AiModule, CurriculumSettingsModule],
  controllers: [LessonPlansController],
  providers: [LessonPlansService],
  exports: [LessonPlansService],
})
export class LessonPlansModule {}
