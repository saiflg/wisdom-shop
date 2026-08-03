import { Global, Module } from "@nestjs/common";
import { TenantSecretsService } from "./tenant-secrets.service";

/**
 * Global: both the communication and payment gateway modules need it, and
 * it holds no request state — one instance is correct and avoids
 * re-deriving the key per module.
 */
@Global()
@Module({
  providers: [TenantSecretsService],
  exports: [TenantSecretsService],
})
export class TenantSecretsModule {}
