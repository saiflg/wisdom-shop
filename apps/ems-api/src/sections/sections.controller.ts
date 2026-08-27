import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { SectionsService } from "./sections.service";
import { CreateSectionDto } from "./dto/create-section.dto";
import { UpdateSectionDto } from "./dto/update-section.dto";
import { AssignClassesDto } from "./dto/assign-classes.dto";

@ApiTags("sections")
@ApiBearerAuth()
@Controller("sections")
export class SectionsController {
  constructor(private readonly sections: SectionsService) {}

  @Post()
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Create a section of the school" })
  create(@Body() dto: CreateSectionDto) {
    return this.sections.create(dto);
  }

  // Readable by any signed-in member of the school: a timetable screen or a
  // staff list needs to say which part of the school something belongs to.
  @Get()
  @ApiOperation({ summary: "List sections" })
  list() {
    return this.sections.list();
  }

  @Get(":id")
  @ApiOperation({ summary: "A section and the classes in it" })
  findOne(@Param("id") id: string) {
    return this.sections.findOne(id);
  }

  @Patch(":id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Rename a section or change who heads it" })
  update(@Param("id") id: string, @Body() dto: UpdateSectionDto) {
    return this.sections.update(id, dto);
  }

  // PUT, not PATCH: the body is the whole membership, so sending it twice
  // leaves the same state as sending it once.
  @Put(":id/classes")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Set which classes belong to this section" })
  assignClasses(@Param("id") id: string, @Body() dto: AssignClassesDto) {
    return this.sections.assignClasses(id, dto);
  }

  @Delete(":id")
  @Roles("SCHOOL_ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a section, releasing its classes" })
  remove(@Param("id") id: string) {
    return this.sections.remove(id);
  }
}
