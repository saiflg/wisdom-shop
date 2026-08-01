import { SetMetadata } from "@nestjs/common";
import type { RoleName } from "ems-tenant-client";

export const ROLES_KEY = "roles";

/** Restricts a tenant route to users holding at least one of the given roles. */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
