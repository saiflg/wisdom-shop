import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import type { EnvConfig } from "@/config/env.validation";
import { AuthService, type RequestMeta } from "./auth.service";
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from "./auth.constants";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";
import { CsrfHeaderGuard } from "./guards/csrf-header.guard";
import { LoginDto } from "./dto/login.dto";
import type { AuthenticatedUser, RefreshTokenPayload } from "./interfaces/jwt-payload.interface";

function requestMeta(req: Request): RequestMeta {
  const userAgentHeader = req.headers["user-agent"];
  return {
    userAgent: Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader,
    ipAddress: req.ip,
  };
}

@ApiTags("auth")
@ApiBearerAuth()
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.config.get("NODE_ENV", { infer: true }) === "production",
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      domain: this.config.get("COOKIE_DOMAIN", { infer: true }) || undefined,
      expires: expiresAt,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: this.config.get("NODE_ENV", { infer: true }) === "production",
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      domain: this.config.get("COOKIE_DOMAIN", { infer: true }) || undefined,
    });
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Log in to a school with schoolSlug + email + password" })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto.schoolSlug, dto.email, dto.password, requestMeta(req));
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user };
  }

  @Public()
  @UseGuards(JwtRefreshGuard, CsrfHeaderGuard)
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate the refresh token and issue a new access token" })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const payload = req.user as RefreshTokenPayload;
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] ?? (req.body as { refreshToken?: string })?.refreshToken;
    const result = await this.authService.refresh(payload, rawToken, requestMeta(req));
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

  @Public()
  @UseGuards(JwtRefreshGuard, CsrfHeaderGuard)
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke the current refresh token and clear the cookie" })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const payload = req.user as RefreshTokenPayload;
    await this.authService.logout(payload.schoolId, payload.tokenId);
    this.clearRefreshCookie(res);
  }

  @Get("me")
  @ApiOperation({ summary: "The current authenticated school user" })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
