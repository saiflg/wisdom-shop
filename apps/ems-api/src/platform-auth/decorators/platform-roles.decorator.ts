import { SetMetadata } from "@nestjs/common";
import type { PlatformRoleName } from "ems-control-client";

export const PLATFORM_ROLES_KEY = "platformRoles";

export const PlatformRoles = (...roles: PlatformRoleName[]) => SetMetadata(PLATFORM_ROLES_KEY, roles);
