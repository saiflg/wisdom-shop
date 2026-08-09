import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createReadStream, type ReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { EnvConfig } from "../config/env.validation";

/**
 * File storage for ems-api, backed by the local filesystem.
 *
 * Ported from the shop's own StorageService, and the same single-node story:
 * with more than one API replica each gets its own directory and a logo
 * uploaded to one is missing from the others. Moving to S3 or R2 means a
 * second driver behind these four methods.
 *
 * **One root, many schools.** Isolation here is a property of the *keys*
 * (see storage.ts), not of the directory tree — there is no separate root
 * per tenant the way there is a separate database per tenant. The
 * containment check below is what stops a key from leaving the root at all;
 * the school-id prefix in the key is what stops one school from reaching
 * another inside it.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.root = resolve(this.config.get("EMS_STORAGE_ROOT", { infer: true }));
  }

  /**
   * Resolves a key to an absolute path, refusing anything that escapes the
   * storage root.
   *
   * Keys are generated server-side, so this should never fire — which is
   * exactly why it is here. It is the backstop for the day someone adds a
   * route that passes a key through from a request.
   */
  private pathFor(key: string): string {
    const full = resolve(join(this.root, key));
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new NotFoundException("File not found");
    }
    return full;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  /** Byte size, or null when the file is missing. */
  async sizeOf(key: string): Promise<number | null> {
    try {
      const info = await stat(this.pathFor(key));
      return info.isFile() ? info.size : null;
    } catch {
      return null;
    }
  }

  async readStream(key: string): Promise<ReadStream> {
    const path = this.pathFor(key);
    const size = await this.sizeOf(key);
    if (size === null) {
      // The row exists but the bytes do not — a restored database against an
      // empty disk, most likely. Say so plainly in the log; the caller gets a
      // 404 either way.
      this.logger.error(`Storage key "${key}" is recorded but missing on disk`);
      throw new NotFoundException("File not found");
    }
    return createReadStream(path);
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.pathFor(key));
    } catch {
      // Already gone is the desired end state.
    }
  }
}
