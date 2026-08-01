import type { Request } from "express";
import type { AuthenticatedUser, RefreshTokenPayload } from "./jwt-payload.interface";

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

export interface RequestWithRefreshPayload extends Request {
  user: RefreshTokenPayload;
}
