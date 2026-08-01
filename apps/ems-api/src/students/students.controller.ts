import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { StudentsService } from "./students.service";
import { CreateStudentDto } from "./dto/create-student.dto";
import { UpdateStudentDto } from "./dto/update-student.dto";

@ApiTags("students")
@ApiBearerAuth()
@Controller("students")
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Post()
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Create a student" })
  create(@Body() dto: CreateStudentDto) {
    return this.students.create(dto);
  }

  @Get()
  @ApiOperation({ summary: "List students — a guardian sees only their own linked students" })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.students.list(user);
  }

  @Get(":id")
  @ApiOperation({ summary: "A student's detail" })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.students.findOne(id, user);
  }

  @Patch(":id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Update a student" })
  update(@Param("id") id: string, @Body() dto: UpdateStudentDto) {
    return this.students.update(id, dto);
  }
}
