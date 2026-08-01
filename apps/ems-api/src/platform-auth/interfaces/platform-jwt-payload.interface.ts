import type { PlatformRoleName } from "ems-control-client";

export interface PlatformAccessTokenPayload {
  sub: string;
  roles: PlatformRoleName[];
  type: "platform_access";
}

export interface PlatformRefreshTokenPayload {
  sub: string;
  tokenId: string;
  type: "platform_refresh";
}

export interface AuthenticatedPlatformUser {
  id: string;
  roles: PlatformRoleName[];
}
