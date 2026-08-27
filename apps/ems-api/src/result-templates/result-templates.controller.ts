import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";
import { ResultTemplatesService } from "./result-templates.service";
import { CreateResultTemplateDto } from "./dto/create-result-template.dto";
import { UpdateResultTemplateDto } from "./dto/update-result-template.dto";
import { ApplyResultTemplateDto } from "./dto/apply-result-template.dto";

/**
 * Administrators only, top to bottom.
 *
 * Nothing here is readable by a student or a parent: a template is how the
 * school decides marks will be weighted, and the nav entry is ADMIN_ONLY for
 * the same reason. That is why this controller carries @Roles at the class
 * level rather than per route — there is no read that should be wider.
 */
@ApiTags("result-templates")
@ApiBearerAuth()
@Controller("result-templates")
@Roles("SCHOOL_ADMIN")
@RequiresModule("GRADING")
export class ResultTemplatesController {
  constructor(private readonly templates: ResultTemplatesService) {}

  @Post()
  @ApiOperation({ summary: "Create a result template" })
  create(@Body() dto: CreateResultTemplateDto) {
    return this.templates.create(dto);
  }

  @Get()
  @ApiOperation({ summary: "List result templates" })
  list() {
    return this.templates.list();
  }

  @Get(":id")
  @ApiOperation({ summary: "A result template and its components" })
  findOne(@Param("id") id: string) {
    return this.templates.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a template, replacing components if given" })
  update(@Param("id") id: string, @Body() dto: UpdateResultTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Post(":id/apply")
  @ApiOperation({ summary: "Create this shape as assessments for a class and term" })
  apply(@Param("id") id: string, @Body() dto: ApplyResultTemplateDto) {
    return this.templates.apply(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a template, keeping assessments it created" })
  remove(@Param("id") id: string) {
    return this.templates.remove(id);
  }
}
