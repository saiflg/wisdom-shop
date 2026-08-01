import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { TeachersService } from "./teachers.service";
import { CreateTeacherDto } from "./dto/create-teacher.dto";

@ApiTags("teachers")
@ApiBearerAuth()
@Controller("teachers")
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Post()
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Create a teacher account" })
  create(@Body() dto: CreateTeacherDto) {
    return this.teachers.create(dto);
  }

  @Get()
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "List teachers" })
  list() {
    return this.teachers.list();
  }

  @Get(":id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "A teacher's detail, including homeroom classes" })
  findOne(@Param("id") id: string) {
    return this.teachers.findOne(id);
  }
}
