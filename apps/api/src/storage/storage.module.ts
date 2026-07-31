import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { UploadsController } from "./uploads.controller";

/**
 * Global so any module can persist a file without importing this one; the
 * containment check lives in the service, so a wider reach is not a wider
 * attack surface.
 */
@Global()
@Module({
  controllers: [UploadsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
