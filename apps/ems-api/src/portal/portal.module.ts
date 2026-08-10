import { Module } from "@nestjs/common";
import { AttendanceModule } from "@/attendance/attendance.module";
import { FeesModule } from "@/fees/fees.module";
import { HomeworkModule } from "@/homework/homework.module";
import { TimetableModule } from "@/timetable/timetable.module";
import { AiTeacherModule } from "@/ai-teacher/ai-teacher.module";
import { GradingModule } from "@/grading/grading.module";
import { ExamsModule } from "@/exams/exams.module";
import { PortalController } from "./portal.controller";
import { PortalService } from "./portal.service";

/**
 * Composes the modules that already own each figure rather than querying
 * around them, so the portal cannot drift from what each module considers
 * visible to a family.
 */
@Module({
  imports: [AttendanceModule, FeesModule, HomeworkModule, TimetableModule, AiTeacherModule, GradingModule, ExamsModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
