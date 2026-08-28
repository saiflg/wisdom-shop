import { Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";

/**
 * DiscoveryModule gives the service the running route table, which is the
 * whole point: the capability matrix is derived from what is enforced rather
 * than from a list maintained beside it.
 */
@Module({
  imports: [DiscoveryModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
