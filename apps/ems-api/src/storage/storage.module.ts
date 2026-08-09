import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";

/**
 * Global because storage is infrastructure, like the Prisma clients: any
 * module that grows an upload should not also have to grow an import here.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
