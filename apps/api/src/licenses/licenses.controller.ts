import { Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { LicensesService } from "./licenses.service";

@ApiTags("licenses")
@ApiBearerAuth()
@Controller("licenses")
export class LicensesController {
  constructor(private readonly licenses: LicensesService) {}

  @Get()
  @ApiOperation({ summary: "License keys issued to you" })
  list(@CurrentUser("id") userId: string) {
    return this.licenses.listForUser(userId);
  }

  @Get(":key")
  @ApiOperation({ summary: "One of your license keys" })
  findOne(@CurrentUser("id") userId: string, @Param("key") key: string) {
    return this.licenses.findOwned(userId, key);
  }

  @Post(":key/setup-handoff")
  @ApiOperation({
    summary: "Complete Your School Setup — redirect into the EMS onboarding portal",
    description:
      "Returns a redirectUrl carrying a short-lived HMAC-signed token that proves this purchase to the separate onboarding portal, which can verify it without calling back.",
  })
  createHandoff(@CurrentUser("id") userId: string, @Param("key") key: string) {
    return this.licenses.createSetupHandoff(userId, key);
  }
}

@ApiTags("admin/licenses")
@ApiBearerAuth()
@Roles("ADMIN", "SUPER_ADMIN", "MANAGER")
@Controller("admin/licenses")
export class AdminLicensesController {
  constructor(private readonly licenses: LicensesService) {}

  @Patch(":key/revoke")
  @ApiOperation({ summary: "Revoke a license (e.g. after a refund)" })
  revoke(@Param("key") key: string, @CurrentUser("id") actorUserId: string) {
    return this.licenses.revoke(key, actorUserId);
  }
}
