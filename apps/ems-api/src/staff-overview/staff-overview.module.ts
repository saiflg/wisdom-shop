import { Module } from "@nestjs/common";
import { StaffOverviewController } from "./staff-overview.controller";
import { StaffOverviewService } from "./staff-overview.service";

@Module({
  controllers: [StaffOverviewController],
  providers: [StaffOverviewService],
  exports: [StaffOverviewService],
})
export class StaffOverviewModule {}
