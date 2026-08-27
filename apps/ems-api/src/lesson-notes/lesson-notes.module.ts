import { Module } from "@nestjs/common";
import { LessonNotesController } from "./lesson-notes.controller";
import { LessonNotesService } from "./lesson-notes.service";

@Module({
  controllers: [LessonNotesController],
  providers: [LessonNotesService],
  exports: [LessonNotesService],
})
export class LessonNotesModule {}
