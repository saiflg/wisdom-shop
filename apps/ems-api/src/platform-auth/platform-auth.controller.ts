import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from "@nestjs/common";
import { LoginThrottlerGuard } from "@/auth/guards/login-throttler.guard";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import type { EnvConfig } from "@/config/env.validation";
import { Public } from "@/auth/decorators/public.decorator";
import { CsrfHeaderGuard } from "@/auth/guards/csrf-header.guard";
import { PlatformAuthService } from "./platform-auth.service";
import {
  PLATFORM_REFRESH_COOKIE_NAME,
  PLATFORM_REFRESH_COOKIE_PATH,
} from "./strategies/platform-refresh-token.strategy";
import { PlatformRefreshGuard } from "./guards/platform-refresh.guard";
import { PlatformJwtAuthGuard } from "./guards/platform-jwt-auth.guard";
import { CurrentPlatformUser } from "./decorators/current-platform-user.decorator";
import { PlatformLoginDto } from "./dto/platform-login.dto";
import type { AuthenticatedPlatformUser, PlatformRefreshTokenPayload } from "./interfaces/platform-jwt-payload.interface";
import type { RequestMeta } from "@/common/auth-types";

function requestMeta(req: Request): RequestMeta {
  const userAgentHeader = req.headers["user-agent"];
  return {
    userAgent: Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader,
    ipAddress: req.ip,
  };
}

/**
 * Every route here is @Public() (opted out of the tenant JwtAuthGuard,
 * which is the global APP_GUARD) but carries its own PlatformJwtAuthGuard
 * where needed — the same two-guard-stacks shape the shop uses for its one
 * exception (@Public() + @UseGuards(TwoFactorChallengeGuard)).
 */
@ApiTags("platform-auth")
@ApiBearerAuth()
@Public()
@Controller("platform/auth")
export class PlatformAuthController {
  constructor(
    private readonly platformAuth: PlatformAuthService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(PLATFORM_REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.config.get("NODE_ENV", { infer: true }) === "production",
      sameSite: "strict",
      path: PLATFORM_REFRESH_COOKIE_PATH,
      domain: this.config.get("COOKIE_DOMAIN", { infer: true }) || undefined,
      expires: expiresAt,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(PLATFORM_REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: this.config.get("NODE_ENV", { infer: true }) === "production",
      sameSite: "strict",
      path: PLATFORM_REFRESH_COOKIE_PATH,
      domain: this.config.get("COOKIE_DOMAIN", { infer: true }) || undefined,
    });
  }

  // The most valuable password on the server: a platform operator can read
  // every school. Same ten-per-quarter-hour ceiling, counted per account.
  @UseGuards(LoginThrottlerGuard)
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Platform operator login" })
  async login(@Body() dto: PlatformLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.platformAuth.login(dto.email, dto.password, requestMeta(req));
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user };
  }

  @UseGuards(PlatformRefreshGuard, CsrfHeaderGuard)
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const payload = req.user as PlatformRefreshTokenPayload;
    const rawToken =
      req.cookies?.[PLATFORM_REFRESH_COOKIE_NAME] ?? (req.body as { refreshToken?: string })?.refreshToken;
    const result = await this.platformAuth.refresh(payload, rawToken, requestMeta(req));
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

  @UseGuards(PlatformRefreshGuard, CsrfHeaderGuard)
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const payload = req.user as PlatformRefreshTokenPayload;
    await this.platformAuth.logout(payload.tokenId);
    this.clearRefreshCookie(res);
  }

  @UseGuards(PlatformJwtAuthGuard)
  @Get("me")
  me(@CurrentPlatformUser() user: AuthenticatedPlatformUser) {
    return user;
  }
}
