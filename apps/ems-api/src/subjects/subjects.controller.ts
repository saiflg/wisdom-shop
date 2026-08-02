import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { SubjectsService } from "./subjects.service";
import { CreateSubjectDto } from "./dto/create-subject.dto";
import { UpdateSubjectDto } from "./dto/update-subject.dto";

@ApiTags("subjects")
@ApiBearerAuth()
@Controller("subjects")
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Post()
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Create a subject" })
  create(@Body() dto: CreateSubjectDto) {
    return this.subjects.create(dto);
  }

  @Get()
  @ApiOperation({ summary: "List subjects" })
  list() {
    return this.subjects.list();
  }

  @Get(":id")
  @ApiOperation({ summary: "A subject's detail" })
  findOne(@Param("id") id: string) {
    return this.subjects.findOne(id);
  }

  @Patch(":id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Update a subject" })
  update(@Param("id") id: string, @Body() dto: UpdateSubjectDto) {
    return this.subjects.update(id, dto);
  }

  @Delete(":id")
  @Roles("SCHOOL_ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a subject" })
  remove(@Param("id") id: string) {
    return this.subjects.remove(id);
  }
}
