import { Module } from "@nestjs/common";
import { GradingModule } from "@/grading/grading.module";
import { TimetableModule } from "@/timetable/timetable.module";
import { SchoolProfileModule } from "@/school-profile/school-profile.module";
import { PdfController } from "./pdf.controller";
import { PdfService } from "./pdf.service";

/**
 * Imports the modules whose services already enforce who may see what,
 * rather than reaching into their tables directly.
 */
@Module({
  imports: [GradingModule, TimetableModule, SchoolProfileModule],
  controllers: [PdfController],
  providers: [PdfService],
})
export class PdfModule {}
