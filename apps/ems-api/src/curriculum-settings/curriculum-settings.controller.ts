import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurriculumSettingsService } from "./curriculum-settings.service";
import { UpdateCurriculumSettingsDto } from "./dto/update-curriculum-settings.dto";

@ApiTags("curriculum-settings")
@ApiBearerAuth()
@Controller("curriculum-settings")
export class CurriculumSettingsController {
  constructor(private readonly curriculumSettings: CurriculumSettingsService) {}

  @Get()
  @ApiOperation({ summary: "Get this school's curriculum mode and settings" })
  get() {
    return this.curriculumSettings.get();
  }

  @Patch()
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Update curriculum mode/country/standard" })
  update(@Body() dto: UpdateCurriculumSettingsDto) {
    return this.curriculumSettings.update(dto);
  }
}
