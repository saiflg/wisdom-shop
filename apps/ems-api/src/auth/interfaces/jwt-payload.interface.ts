import type { RoleName } from "ems-tenant-client";

/** Claims embedded in the short-lived school-user access token. */
export interface AccessTokenPayload {
  sub: string;
  schoolId: string;
  schoolSlug: string;
  roles: RoleName[];
  type: "access";
}

/** Claims embedded in the long-lived refresh token (rotated on every use). */
export interface RefreshTokenPayload {
  sub: string;
  schoolId: string;
  schoolSlug: string;
  tokenId: string;
  type: "refresh";
}

export interface AuthenticatedUser {
  id: string;
  schoolId: string;
  schoolSlug: string;
  roles: RoleName[];
}
