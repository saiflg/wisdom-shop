import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class ApplyMigrationsDto {
  /**
   * Omit to migrate every school that is behind.
   *
   * Naming one is for the case where a single school failed and is being
   * retried — not the normal path. The normal path is all of them, because a
   * fleet where some schools are current and some are not is the state this
   * exists to end.
   */
  @ApiPropertyOptional({ description: "Migrate only this school. Omit for every school that is behind." })
  @IsOptional()
  @IsString()
  schoolId?: string;
}
