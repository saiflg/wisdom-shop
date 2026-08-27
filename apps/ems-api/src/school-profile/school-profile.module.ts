import { Module } from "@nestjs/common";
import { SchoolProfileController } from "./school-profile.controller";
import { SchoolProfileService } from "./school-profile.service";

@Module({
  controllers: [SchoolProfileController],
  providers: [SchoolProfileService],
  exports: [SchoolProfileService],
})
export class SchoolProfileModule {}
