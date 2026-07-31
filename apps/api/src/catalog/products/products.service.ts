import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, Product, ProductStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SearchService } from "../../search/search.service";
import { slugify } from "../../common/utils/slugify";
import type { CreateProductDto } from "./dto/create-product.dto";
import type { UpdateProductDto } from "./dto/update-product.dto";
import { ProductSort, type QueryProductsDto } from "./dto/query-products.dto";

const PRODUCT_INCLUDE = {
  images: { orderBy: { position: "asc" as const } },
  variants: { where: { deletedAt: null } },
  categories: { include: { category: true } },
} satisfies Prisma.ProductInclude;

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
  ) {}

  private async ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
    let candidate = base;
    let suffix = 1;
    for (;;) {
      const existing = await this.prisma.product.findFirst({
        where: { slug: candidate, id: excludeId ? { not: excludeId } : undefined },
      });
      if (!existing) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
  }

  async create(dto: CreateProductDto, vendorId?: string): Promise<Product> {
    const slug = await this.ensureUniqueSlug(dto.slug ? slugify(dto.slug) : slugify(dto.title));

    return this.indexAfter(this.prisma.product.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        type: dto.type,
        priceCents: dto.priceCents,
        currency: dto.currency ?? "USD",
        sku: dto.sku,
        stockQty: dto.stockQty,
        metadata: dto.metadata as Prisma.InputJsonValue,
        vendorId,
        images: dto.images?.length
          ? { create: dto.images.map((img, i) => ({ url: img.url, altText: img.altText, position: img.position ?? i })) }
          : undefined,
        variants: dto.variants?.length
          ? { create: dto.variants.map((v) => ({ name: v.name, priceCents: v.priceCents, sku: v.sku, stockQty: v.stockQty })) }
          : undefined,
        categories: dto.categoryIds?.length
          ? { create: dto.categoryIds.map((categoryId) => ({ categoryId })) }
          : undefined,
      },
      include: PRODUCT_INCLUDE,
    }));
  }

  /**
   * Keeps the search index in step with a write.
   *
   * Awaited rather than fired and forgotten, so a product is searchable the
   * moment the request that created it returns — but the search service
   * itself fails soft, so an unreachable engine never fails the write.
   */
  private async indexAfter(operation: Promise<Product>): Promise<Product> {
    const product = await operation;
    await this.search.indexProduct(product as never);
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundException("Product not found");

    const slug = dto.slug ? await this.ensureUniqueSlug(slugify(dto.slug), id) : undefined;

    return this.indexAfter(this.prisma.$transaction(async (tx) => {
      if (dto.images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (dto.images.length) {
          await tx.productImage.createMany({
            data: dto.images.map((img, i) => ({
              productId: id,
              url: img.url,
              altText: img.altText,
              position: img.position ?? i,
            })),
          });
        }
      }

      if (dto.variants) {
        await tx.productVariant.updateMany({ where: { productId: id }, data: { deletedAt: new Date() } });
        if (dto.variants.length) {
          await tx.productVariant.createMany({
            data: dto.variants.map((v) => ({
              productId: id,
              name: v.name,
              priceCents: v.priceCents,
              sku: v.sku,
              stockQty: v.stockQty,
            })),
          });
        }
      }

      if (dto.categoryIds) {
        await tx.productCategory.deleteMany({ where: { productId: id } });
        if (dto.categoryIds.length) {
          await tx.productCategory.createMany({
            data: dto.categoryIds.map((categoryId) => ({ productId: id, categoryId })),
          });
        }
      }

      return tx.product.update({
        where: { id },
        data: {
          title: dto.title,
          slug,
          description: dto.description,
          type: dto.type,
          status: dto.status,
          priceCents: dto.priceCents,
          currency: dto.currency,
          sku: dto.sku,
          stockQty: dto.stockQty,
          metadata: dto.metadata as Prisma.InputJsonValue,
        },
        include: PRODUCT_INCLUDE,
      });
    }));
  }

  async remove(id: string): Promise<void> {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundException("Product not found");
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    // A deleted product must leave the index, or it keeps appearing in
    // search results that lead to a 404.
    await this.search.removeProduct(id);
  }

  private buildWhere(query: QueryProductsDto, statuses?: ProductStatus[]): Prisma.ProductWhereInput {
    return {
      deletedAt: null,
      // An explicit statuses argument always wins, so a caller-supplied
      // query.status can never widen the public listing beyond PUBLISHED.
      status: statuses ? { in: statuses } : query.status,
      type: query.type,
      priceCents: {
        gte: query.minPrice,
        lte: query.maxPrice,
      },
      title: query.search ? { contains: query.search, mode: "insensitive" } : undefined,
      categories: query.category ? { some: { category: { slug: query.category } } } : undefined,
    };
  }

  private buildOrderBy(sort?: ProductSort): Prisma.ProductOrderByWithRelationInput {
    switch (sort) {
      case ProductSort.PRICE_ASC:
        return { priceCents: "asc" };
      case ProductSort.PRICE_DESC:
        return { priceCents: "desc" };
      case ProductSort.NEWEST:
      default:
        return { createdAt: "desc" };
    }
  }

  private async paginate(
    where: Prisma.ProductWhereInput,
    orderBy: Prisma.ProductOrderByWithRelationInput,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Product>> {
    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: PRODUCT_INCLUDE,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async findPublicList(query: QueryProductsDto): Promise<PaginatedResult<Product>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Search supplies *which products match the phrase*; the database still
    // applies every other filter and does the paging. So typo tolerance and
    // relevance improve, and nothing else about how listings behave changes.
    //
    // A null result means search is unavailable — fall through to database
    // matching rather than showing an empty shop.
    const matchedIds = query.search ? await this.search.searchIds(query.search) : null;

    const where =
      matchedIds !== null
        ? { ...this.buildWhere({ ...query, search: undefined }, ["PUBLISHED"]), id: { in: matchedIds } }
        : this.buildWhere(query, ["PUBLISHED"]);

    return this.paginate(where, this.buildOrderBy(query.sort), page, limit);
  }

  async findAdminList(query: QueryProductsDto): Promise<PaginatedResult<Product>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return this.paginate(this.buildWhere(query), this.buildOrderBy(query.sort), page, limit);
  }

  async findPublicBySlug(slug: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: "PUBLISHED", deletedAt: null },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  /**
   * Vendor-scoped lookups. Every one of these filters by `vendorId` in the
   * WHERE clause rather than fetching-then-comparing, so a vendor asking for
   * another vendor's product gets a plain 404 and learns nothing about
   * whether that id exists.
   */
  async findVendorList(vendorId: string, query: QueryProductsDto): Promise<PaginatedResult<Product>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { ...this.buildWhere(query), vendorId };
    return this.paginate(where, this.buildOrderBy(query.sort), page, limit);
  }

  async findVendorById(vendorId: string, id: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id, vendorId, deletedAt: null },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  /** Throws 404 unless the product exists AND belongs to this vendor. */
  private async assertVendorOwns(vendorId: string, id: string): Promise<void> {
    const owned = await this.prisma.product.findFirst({
      where: { id, vendorId, deletedAt: null },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException("Product not found");
  }

  async updateForVendor(vendorId: string, id: string, dto: UpdateProductDto): Promise<Product> {
    await this.assertVendorOwns(vendorId, id);
    return this.update(id, dto);
  }

  async removeForVendor(vendorId: string, id: string): Promise<void> {
    await this.assertVendorOwns(vendorId, id);
    return this.remove(id);
  }

  async findAdminById(id: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }
}
