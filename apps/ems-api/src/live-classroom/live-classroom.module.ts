import { Module } from "@nestjs/common";
import { LiveClassroomController } from "./live-classroom.controller";
import { LiveClassroomService } from "./live-classroom.service";

@Module({
  controllers: [LiveClassroomController],
  providers: [LiveClassroomService],
  exports: [LiveClassroomService],
})
export class LiveClassroomModule {}
