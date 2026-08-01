import { Global, Module } from "@nestjs/common";
import { TenancyService } from "./tenancy.service";
import { TenantPrismaService } from "./tenant-prisma.service";

@Global()
@Module({
  providers: [TenancyService, TenantPrismaService],
  exports: [TenancyService, TenantPrismaService],
})
export class TenancyModule {}
