import { Module } from "@nestjs/common";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import { DataExchangeController } from "./data-exchange.controller";
import { DataExchangeService } from "./data-exchange.service";

@Module({
  controllers: [DataExchangeController],
  providers: [DataExchangeService, TenantSecretsService],
  exports: [DataExchangeService],
})
export class DataExchangeModule {}
