import { Module } from "@nestjs/common";
import { ResultTemplatesController } from "./result-templates.controller";
import { ResultTemplatesService } from "./result-templates.service";

@Module({
  controllers: [ResultTemplatesController],
  providers: [ResultTemplatesService],
  exports: [ResultTemplatesService],
})
export class ResultTemplatesModule {}
