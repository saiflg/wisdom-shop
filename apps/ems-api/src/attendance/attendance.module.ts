import { Module } from "@nestjs/common";
import { MessagingModule } from "@/messaging/messaging.module";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { AbsenceNotesController } from "./absence-notes.controller";
import { AbsenceNotesService } from "./absence-notes.service";

@Module({
  imports: [MessagingModule],
  controllers: [AttendanceController, AbsenceNotesController],
  providers: [AttendanceService, AbsenceNotesService],
  exports: [AttendanceService, AbsenceNotesService],
})
export class AttendanceModule {}
