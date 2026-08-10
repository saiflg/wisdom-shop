import { Global, Module } from "@nestjs/common";
import { ProvisioningModule } from "@/provisioning/provisioning.module";
import { SchoolsController } from "./schools.controller";
import { SchoolContextController } from "./school-context.controller";
import { SchoolsService } from "./schools.service";
import { SchoolModulesService } from "./school-modules.service";

/**
 * Global because ModuleGuard is registered as an APP_GUARD and every module's
 * routes are checked by it. The alternative is importing this module into all
 * fifteen feature modules for one service, which is the shape @Global exists
 * for.
 */
@Global()
@Module({
  imports: [ProvisioningModule],
  controllers: [SchoolsController, SchoolContextController],
  providers: [SchoolsService, SchoolModulesService],
  exports: [SchoolModulesService],
})
export class SchoolsModule {}
