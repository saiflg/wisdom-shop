import { Module } from "@nestjs/common";
import { StudentOverviewController } from "./student-overview.controller";
import { StudentOverviewService } from "./student-overview.service";

@Module({
  controllers: [StudentOverviewController],
  providers: [StudentOverviewService],
  exports: [StudentOverviewService],
})
export class StudentOverviewModule {}
