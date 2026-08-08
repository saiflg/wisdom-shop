import { Module } from "@nestjs/common";
import { AccessibilityController } from "./accessibility.controller";
import { AccessibilityService } from "./accessibility.service";

@Module({
  controllers: [AccessibilityController],
  providers: [AccessibilityService],
  exports: [AccessibilityService],
})
export class AccessibilityModule {}
