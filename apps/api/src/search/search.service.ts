import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import {
  INDEX_SETTINGS,
  PRIMARY_KEY,
  isIndexable,
  PRODUCTS_INDEX,
  toSearchDocument,
  type IndexableProduct,
} from "./search-document";
import type { EnvConfig } from "../config/env.validation";

/**
 * Product search, backed by Meilisearch.
 *
 * **Search is an enhancement, never a dependency.** Every method here fails
 * soft: if Meilisearch is unreachable, misconfigured, or simply not running,
 * indexing is skipped and `searchIds` returns null so the caller falls back
 * to database matching. A shop that cannot sell anything because its search
 * engine is down is a worse outcome than a shop with unranked results.
 *
 * Talks to the HTTP API directly rather than via the SDK — the surface used
 * here is four endpoints, and this avoids a dependency for it.
 */
@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly host?: string;
  private readonly apiKey?: string;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    this.host = this.config.get("MEILI_HOST", { infer: true })?.replace(/\/$/, "");
    this.apiKey = this.config.get("MEILI_MASTER_KEY", { infer: true });
  }

  get enabled(): boolean {
    return Boolean(this.host && this.apiKey);
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn(
        "MEILI_HOST/MEILI_MASTER_KEY not set — product search falls back to database matching.",
      );
      return;
    }
    await this.ensureIndex();
    // Settings are idempotent, so applying them on every boot keeps a fresh
    // Meilisearch volume configured without a separate provisioning step.
    await this.request("PUT", `/indexes/${PRODUCTS_INDEX}/settings`, INDEX_SETTINGS);
  }

  /**
   * Creates the index with an **explicit primary key**.
   *
   * Meilisearch otherwise infers it from field names, and refuses when more
   * than one field ends in "id" — this document has both `id` and
   * `vendorId`, so inference is ambiguous and *every document write is
   * rejected*. The index still exists and searches still succeed, they just
   * return nothing, so the failure looks like an empty catalogue rather than
   * a broken integration. Declaring the key removes the guesswork.
   *
   * Already-exists is the expected response on every boot after the first.
   */
  private async ensureIndex(): Promise<void> {
    await this.request("POST", "/indexes", { uid: PRODUCTS_INDEX, primaryKey: PRIMARY_KEY });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T | null> {
    if (!this.enabled) return null;

    try {
      const res = await fetch(`${this.host}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        // Without this a hung search engine would hold a request open for as
        // long as the client is willing to wait.
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        this.logger.warn(`Meilisearch ${method} ${path} returned ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (error) {
      // Unreachable, timed out, DNS failure — all the same to the caller.
      this.logger.warn(`Meilisearch ${method} ${path} failed: ${(error as Error).message}`);
      return null;
    }
  }

  /** Adds or updates one product; removes it if it is no longer published. */
  async indexProduct(product: IndexableProduct): Promise<void> {
    if (!this.enabled) return;

    if (!isIndexable(product)) {
      await this.removeProduct(product.id);
      return;
    }
    await this.request(
      "PUT",
      `/indexes/${PRODUCTS_INDEX}/documents?primaryKey=${PRIMARY_KEY}`,
      [toSearchDocument(product)],
    );
  }

  async removeProduct(productId: string): Promise<void> {
    if (!this.enabled) return;
    await this.request("DELETE", `/indexes/${PRODUCTS_INDEX}/documents/${productId}`);
  }

  /** Rebuilds the whole index from the database. */
  async reindexAll(): Promise<{ indexed: number; enabled: boolean }> {
    if (!this.enabled) return { indexed: 0, enabled: false };

    await this.ensureIndex();

    const products = await this.prisma.product.findMany({
      where: { status: "PUBLISHED", deletedAt: null },
      include: { categories: { include: { category: true } } },
    });

    await this.request("PUT", `/indexes/${PRODUCTS_INDEX}/settings`, INDEX_SETTINGS);
    // Replaces the whole set rather than deleting first: a delete-then-add
    // leaves the shop with no search results in between.
    await this.request(
      "PUT",
      `/indexes/${PRODUCTS_INDEX}/documents?primaryKey=${PRIMARY_KEY}`,
      products.map((product) => toSearchDocument(product)),
    );

    return { indexed: products.length, enabled: true };
  }

  /**
   * Matching product ids, best match first — or null when search is
   * unavailable and the caller should fall back to the database.
   *
   * Deliberately returns *ids only*. The database still applies category,
   * type and price filters and does the paging, so search changes which
   * products match a phrase and nothing else about how listings behave.
   * The cap keeps that id list bounded; at this catalogue size it is not a
   * real limit, and a larger one would need Meilisearch to own paging too.
   */
  async searchIds(query: string, limit = 500): Promise<string[] | null> {
    if (!this.enabled) return null;

    const result = await this.request<{ hits: { id: string }[] }>(
      "POST",
      `/indexes/${PRODUCTS_INDEX}/search`,
      { q: query, limit, attributesToRetrieve: ["id"] },
    );

    if (!result) return null;
    return result.hits.map((hit) => hit.id);
  }
}
