import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/** Opts a route out of the global (tenant) JwtAuthGuard. Used by school-auth's own public routes and by every /v1/platform/* controller. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
