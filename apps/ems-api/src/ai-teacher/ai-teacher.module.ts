import { Module } from "@nestjs/common";
import { AiModule } from "@/ai/ai.module";
import { CurriculumSettingsModule } from "@/curriculum-settings/curriculum-settings.module";
import { AccessibilityModule } from "@/accessibility/accessibility.module";
import { AiTeacherController, LessonResourcesController } from "./ai-teacher.controller";
import { AiTeacherService } from "./ai-teacher.service";
import { LessonResourcesService } from "./lesson-resources.service";

@Module({
  imports: [AiModule, CurriculumSettingsModule, AccessibilityModule],
  controllers: [AiTeacherController, LessonResourcesController],
  providers: [AiTeacherService, LessonResourcesService],
  exports: [AiTeacherService],
})
export class AiTeacherModule {}
