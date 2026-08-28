import { Module } from "@nestjs/common";
import { AppraisalsController } from "./appraisals.controller";
import { AppraisalsService } from "./appraisals.service";

@Module({
  controllers: [AppraisalsController],
  providers: [AppraisalsService],
  exports: [AppraisalsService],
})
export class AppraisalsModule {}
