import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Category } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { slugify } from "../../common/utils/slugify";
import type { CreateCategoryDto } from "./dto/create-category.dto";
import type { UpdateCategoryDto } from "./dto/update-category.dto";

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
    let candidate = base;
    let suffix = 1;
    for (;;) {
      const existing = await this.prisma.category.findFirst({
        where: { slug: candidate, id: excludeId ? { not: excludeId } : undefined },
      });
      if (!existing) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, deletedAt: null },
      });
      if (!parent) throw new NotFoundException("Parent category not found");
    }

    const slug = await this.ensureUniqueSlug(dto.slug ? slugify(dto.slug) : slugify(dto.name));

    return this.prisma.category.create({
      data: { name: dto.name, slug, parentId: dto.parentId },
    });
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!category) throw new NotFoundException("Category not found");

    if (dto.parentId) {
      if (dto.parentId === id) throw new ConflictException("A category cannot be its own parent");
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, deletedAt: null },
      });
      if (!parent) throw new NotFoundException("Parent category not found");
    }

    const slug = dto.slug ? await this.ensureUniqueSlug(slugify(dto.slug), id) : undefined;

    return this.prisma.category.update({
      where: { id },
      data: { name: dto.name, slug, parentId: dto.parentId },
    });
  }

  async remove(id: string): Promise<void> {
    const category = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!category) throw new NotFoundException("Category not found");

    const [childCount, productCount] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id, deletedAt: null } }),
      this.prisma.productCategory.count({ where: { categoryId: id, product: { deletedAt: null } } }),
    ]);
    if (childCount > 0) {
      throw new ConflictException("Cannot delete a category that still has subcategories");
    }
    if (productCount > 0) {
      throw new ConflictException("Cannot delete a category that still has products assigned to it");
    }

    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async findTree(): Promise<CategoryNode[]> {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });

    const byId = new Map<string, CategoryNode>(categories.map((c) => [c.id, { ...c, children: [] }]));
    const roots: CategoryNode[] = [];

    for (const category of byId.values()) {
      if (category.parentId) {
        const parent = byId.get(category.parentId);
        if (parent) {
          parent.children.push(category);
          continue;
        }
      }
      roots.push(category);
    }

    return roots;
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({ where: { slug, deletedAt: null } });
    if (!category) throw new NotFoundException("Category not found");
    return category;
  }

  async findById(id: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!category) throw new NotFoundException("Category not found");
    return category;
  }
}
