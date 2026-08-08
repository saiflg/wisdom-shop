import { Module } from "@nestjs/common";
import { AiModule } from "@/ai/ai.module";
import { CurriculumSettingsModule } from "@/curriculum-settings/curriculum-settings.module";
import { AiTeacherController } from "./ai-teacher.controller";
import { AiTeacherService } from "./ai-teacher.service";

@Module({
  imports: [AiModule, CurriculumSettingsModule],
  controllers: [AiTeacherController],
  providers: [AiTeacherService],
  exports: [AiTeacherService],
})
export class AiTeacherModule {}
