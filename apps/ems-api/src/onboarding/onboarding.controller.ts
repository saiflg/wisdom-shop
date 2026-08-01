import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import type { EnvConfig } from "@/config/env.validation";
import { Public } from "@/auth/decorators/public.decorator";
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from "@/auth/auth.constants";
import type { RequestMeta } from "@/common/auth-types";
import { OnboardingService } from "./onboarding.service";
import { OnboardFromLicenseDto } from "./dto/onboard-from-license.dto";

function requestMeta(req: Request): RequestMeta {
  const userAgentHeader = req.headers["user-agent"];
  return {
    userAgent: Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader,
    ipAddress: req.ip,
  };
}

/**
 * The receiving end of the shop's "Complete Your School Setup" handoff
 * (apps/api/src/licenses/edu-handoff.ts / licenses.controller.ts). Public —
 * gated by the signed token itself, not a session — since the purchaser
 * arrives here with no Wisdom Campus account yet.
 */
@ApiTags("onboarding")
@Public()
@Controller("onboarding")
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Post("from-license")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Verify a shop handoff token and provision (or find) the school it activates",
    description:
      "A license activates at most one school. A repeat call with the same license — the shop mints a fresh token per click — finds the existing school instead of erroring or re-provisioning.",
  })
  async fromLicense(
    @Body() dto: OnboardFromLicenseDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.onboarding.onboardFromLicense(dto, requestMeta(req));

    if (!result.alreadyOnboarded) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
        httpOnly: true,
        secure: this.config.get("NODE_ENV", { infer: true }) === "production",
        sameSite: "strict",
        path: REFRESH_COOKIE_PATH,
        domain: this.config.get("COOKIE_DOMAIN", { infer: true }) || undefined,
        expires: result.refreshTokenExpiresAt,
      });
    }

    return result;
  }
}
