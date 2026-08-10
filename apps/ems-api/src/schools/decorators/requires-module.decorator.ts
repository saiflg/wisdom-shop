import { SetMetadata } from "@nestjs/common";
import type { ModuleKey } from "../school-modules";

export const REQUIRES_MODULE_KEY = "requiresModule";

/**
 * Marks a controller or route as belonging to a purchasable module.
 *
 * Entitlement, not permission. `@Roles` decides whether *this person* may do
 * it; this decides whether *this school* bought it. Both are checked, and
 * neither substitutes for the other — a school that has not bought payroll
 * must not reach it even as an administrator, and a school that has bought it
 * must still not let a teacher read colleagues' salaries.
 *
 * Applied at the controller level almost everywhere: a module that is off
 * should be entirely absent, not half-present with its list route working.
 */
export const RequiresModule = (module: ModuleKey) => SetMetadata(REQUIRES_MODULE_KEY, module);
