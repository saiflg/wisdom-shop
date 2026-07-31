import { Module } from "@nestjs/common";
import { LicensesService } from "./licenses.service";
import { AdminLicensesController, LicensesController } from "./licenses.controller";

@Module({
  controllers: [LicensesController, AdminLicensesController],
  providers: [LicensesService],
  exports: [LicensesService],
})
export class LicensesModule {}
