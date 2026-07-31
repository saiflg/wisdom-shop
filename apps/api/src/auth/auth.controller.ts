import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import type { EnvConfig } from "../config/env.validation";
import { AuthService, type RequestMeta } from "./auth.service";
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from "./auth.constants";
import { StrictRateLimit } from "./decorators/strict-rate-limit.decorator";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";
import { TwoFactorChallengeGuard } from "./guards/two-factor-challenge.guard";
import { CsrfHeaderGuard } from "./guards/csrf-header.guard";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { RequestPasswordResetDto, ResetPasswordDto } from "./dto/password-reset.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { DisableTwoFactorDto, TwoFactorCodeDto } from "./dto/two-factor.dto";
import { extractRefreshToken } from "./strategies/refresh-token.strategy";
import type { AuthenticatedUser, RefreshTokenPayload, TwoFactorChallengePayload } from "./interfaces/jwt-payload.interface";

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
  @StrictRateLimit()
  @Post("register")
  @ApiOperation({ summary: "Create an account and start a session" })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user };
  }

  @Public()
  @StrictRateLimit()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Log in with email/password; may return a 2FA challenge instead of tokens" })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto.email, dto.password, requestMeta(req));
    if (result.twoFactorRequired) {
      return { twoFactorRequired: true, challengeToken: result.challengeToken };
    }
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return {
      twoFactorRequired: false,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
  }

  @Public()
  @UseGuards(TwoFactorChallengeGuard)
  @StrictRateLimit()
  @Post("login/2fa")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Complete login using the challengeToken from /auth/login and a TOTP/recovery code" })
  async completeTwoFactorLogin(
    @Body() dto: TwoFactorCodeDto,
    @CurrentUser() challenge: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.completeTwoFactorLogin(
      challenge as TwoFactorChallengePayload,
      dto.code,
      requestMeta(req),
    );
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user };
  }

  @Public()
  @UseGuards(JwtRefreshGuard, CsrfHeaderGuard)
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate the refresh token and issue a new access token" })
  async refresh(
    @CurrentUser() payload: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = extractRefreshToken(req);
    if (!rawToken) {
      throw new ForbiddenException("Missing refresh token");
    }
    const result = await this.authService.refresh(payload as RefreshTokenPayload, rawToken, requestMeta(req));
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

  @Public()
  @UseGuards(JwtRefreshGuard, CsrfHeaderGuard)
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "End the current session (revokes this refresh token only)" })
  async logout(@CurrentUser() payload: unknown, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(payload as RefreshTokenPayload);
    this.clearRefreshCookie(res);
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "End every session for the current user (all devices)" })
  async logoutAll(@CurrentUser("id") userId: string, @Res({ passthrough: true }) res: Response) {
    await this.authService.logoutAllSessions(userId);
    this.clearRefreshCookie(res);
  }

  @Get("me")
  @ApiOperation({ summary: "Get the currently authenticated user" })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Public()
  @Post("verify-email")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Consume an email verification token" })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto.token);
  }

  @StrictRateLimit()
  @Post("resend-verification")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Resend the email verification link to the current user" })
  async resendVerification(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.sendVerificationEmail(user.id, user.email);
  }

  @Public()
  @StrictRateLimit()
  @Post("password-reset/request")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Request a password reset email (always succeeds to avoid leaking account existence)" })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto, @Req() req: Request) {
    await this.authService.requestPasswordReset(dto.email, req.ip);
  }

  @Public()
  @StrictRateLimit()
  @Post("password-reset/confirm")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Set a new password using a reset token" })
  async confirmPasswordReset(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post("change-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Change password while authenticated (revokes all other sessions)" })
  async changePassword(
    @CurrentUser("id") userId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
    this.clearRefreshCookie(res);
  }

  @Post("2fa/setup")
  @ApiOperation({ summary: "Generate a TOTP secret + QR code to enroll an authenticator app" })
  async setupTwoFactor(@CurrentUser("id") userId: string) {
    return this.authService.generateTwoFactorSetup(userId);
  }

  @Post("2fa/enable")
  @ApiOperation({ summary: "Confirm a TOTP code to turn on 2FA; returns one-time recovery codes" })
  async enableTwoFactor(@CurrentUser("id") userId: string, @Body() dto: TwoFactorCodeDto) {
    return this.authService.enableTwoFactor(userId, dto.code);
  }

  @Post("2fa/disable")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Turn off 2FA (requires current password + a valid code)" })
  async disableTwoFactor(@CurrentUser("id") userId: string, @Body() dto: DisableTwoFactorDto) {
    await this.authService.disableTwoFactor(userId, dto.code, dto.password);
  }
}
