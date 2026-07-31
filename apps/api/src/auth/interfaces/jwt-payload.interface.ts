import type { RoleName } from "@prisma/client";

/** Claims embedded in the short-lived access token. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: RoleName[];
  type: "access";
}

/** Claims embedded in the long-lived refresh token (rotated on every use). */
export interface RefreshTokenPayload {
  sub: string;
  tokenId: string;
  type: "refresh";
}

/** Claims embedded in the short-lived pre-auth token issued mid-2FA-challenge. */
export interface TwoFactorChallengePayload {
  sub: string;
  type: "2fa_challenge";
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: RoleName[];
}
