import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { ClassesService } from "./classes.service";
import { CreateClassDto } from "./dto/create-class.dto";
import { UpdateClassDto } from "./dto/update-class.dto";

@ApiTags("classes")
@ApiBearerAuth()
@Controller("classes")
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Post()
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Create a class" })
  create(@Body() dto: CreateClassDto) {
    return this.classes.create(dto);
  }

  @Get()
  @ApiOperation({ summary: "List classes" })
  list() {
    return this.classes.list();
  }

  @Get(":id")
  @ApiOperation({ summary: "A class and its active enrollments" })
  findOne(@Param("id") id: string) {
    return this.classes.findOne(id);
  }

  @Patch(":id")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Update a class" })
  update(@Param("id") id: string, @Body() dto: UpdateClassDto) {
    return this.classes.update(id, dto);
  }

  @Delete(":id")
  @Roles("SCHOOL_ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a class" })
  remove(@Param("id") id: string) {
    return this.classes.remove(id);
  }
}
