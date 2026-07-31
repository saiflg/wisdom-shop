import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createReadStream, type ReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { EnvConfig } from "../config/env.validation";

/**
 * File storage, currently backed by the local filesystem.
 *
 * This is an interface with one implementation on purpose. Moving to S3 or R2
 * means writing a second driver behind these four methods; nothing that calls
 * them needs to know. What must not happen is callers building paths
 * themselves, because then the containment check below stops being the only
 * way in.
 *
 * **Local disk is a single-node story.** With more than one API replica each
 * gets its own directory and a file uploaded to one is missing from the
 * others. That is fine for a single container and is called out in
 * docs/DEPLOYMENT.md rather than left to be discovered.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.root = resolve(this.config.get("STORAGE_ROOT", { infer: true }));
  }

  /**
   * Resolves a key to an absolute path, refusing anything that escapes the
   * storage root.
   *
   * Keys are generated server-side, so this should never fire — which is
   * exactly why it is here. It is the backstop for the day someone adds a
   * route that passes a key through from a request, and it costs one string
   * comparison.
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

  /**
   * Opens a read stream. Streamed rather than buffered so a large download
   * does not sit in the API's memory in its entirety.
   */
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
