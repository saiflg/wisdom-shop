/** Shared between the tenant (school-user) and platform-operator auth services — not a dependency of one on the other. */
export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}
