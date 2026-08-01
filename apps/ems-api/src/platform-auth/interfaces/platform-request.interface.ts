import type { Request } from "express";
import type { AuthenticatedPlatformUser, PlatformRefreshTokenPayload } from "./platform-jwt-payload.interface";

export interface RequestWithPlatformUser extends Request {
  user: AuthenticatedPlatformUser;
}

export interface RequestWithPlatformRefreshPayload extends Request {
  user: PlatformRefreshTokenPayload;
}
