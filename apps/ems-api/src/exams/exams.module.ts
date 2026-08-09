import { Module } from "@nestjs/common";
import { AiModule } from "@/ai/ai.module";
import { CurriculumSettingsModule } from "@/curriculum-settings/curriculum-settings.module";
import { ExamsController } from "./exams.controller";
import { ExamsService } from "./exams.service";
import { ExamQuestionGeneratorService } from "./exam-question-generator.service";

@Module({
  imports: [AiModule, CurriculumSettingsModule],
  controllers: [ExamsController],
  providers: [ExamsService, ExamQuestionGeneratorService],
  exports: [ExamsService],
})
export class ExamsModule {}
