import { Module } from "@nestjs/common";
import { MedicalController } from "./medical.controller";
import { MedicalService } from "./medical.service";

@Module({
  controllers: [MedicalController],
  providers: [MedicalService],
  exports: [MedicalService],
})
export class MedicalModule {}
