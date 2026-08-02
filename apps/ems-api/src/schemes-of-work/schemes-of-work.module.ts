import { Module } from "@nestjs/common";
import { AiModule } from "@/ai/ai.module";
import { CurriculumSettingsModule } from "@/curriculum-settings/curriculum-settings.module";
import { SchemesOfWorkController } from "./schemes-of-work.controller";
import { SchemesOfWorkService } from "./schemes-of-work.service";

@Module({
  imports: [AiModule, CurriculumSettingsModule],
  controllers: [SchemesOfWorkController],
  providers: [SchemesOfWorkService],
  exports: [SchemesOfWorkService],
})
export class SchemesOfWorkModule {}
