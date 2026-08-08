import { Module } from "@nestjs/common";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";

/**
 * `GeminiService` is gone: the provider is now chosen in the Super Admin
 * console rather than pinned by an environment variable. `AiService` keeps
 * the same `generateJson` signature, so the curriculum, lesson-plan and quiz
 * services needed only an import change.
 */
@Module({
  controllers: [AiController],
  providers: [AiService, TenantSecretsService],
  exports: [AiService],
})
export class AiModule {}
