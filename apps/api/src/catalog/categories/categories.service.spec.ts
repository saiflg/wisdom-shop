import { ConflictException, NotFoundException } from "@nestjs/common";
import { CategoriesService } from "./categories.service";
import type { PrismaService } from "../../prisma/prisma.service";

function buildPrismaMock() {
  return {
    category: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    productCategory: {
      count: jest.fn(),
    },
  } as unknown as PrismaService;
}

describe("CategoriesService", () => {
  describe("create", () => {
    it("generates a slug from the name when none is given", async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.category.create as jest.Mock).mockResolvedValue({ id: "cat_1" });
      const service = new CategoriesService(prisma);

      await service.create({ name: "School & University Books" });

      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: "school-university-books" }) }),
      );
    });

    it("appends a numeric suffix when the slug is already taken", async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findFirst as jest.Mock)
        .mockResolvedValueOnce({ id: "existing" }) // "books" taken
        .mockResolvedValueOnce(null); // "books-2" free
      (prisma.category.create as jest.Mock).mockResolvedValue({ id: "cat_2" });
      const service = new CategoriesService(prisma);

      await service.create({ name: "Books" });

      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: "books-2" }) }),
      );
    });

    it("rejects a non-existent parentId", async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findFirst as jest.Mock).mockResolvedValue(null); // parent lookup fails
      const service = new CategoriesService(prisma);

      await expect(service.create({ name: "Sub", parentId: "missing" })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("remove", () => {
    it("refuses to delete a category that still has subcategories", async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findFirst as jest.Mock).mockResolvedValue({ id: "cat_1" });
      (prisma.category.count as jest.Mock).mockResolvedValue(2);
      (prisma.productCategory.count as jest.Mock).mockResolvedValue(0);
      const service = new CategoriesService(prisma);

      await expect(service.remove("cat_1")).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it("refuses to delete a category that still has products assigned", async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findFirst as jest.Mock).mockResolvedValue({ id: "cat_1" });
      (prisma.category.count as jest.Mock).mockResolvedValue(0);
      (prisma.productCategory.count as jest.Mock).mockResolvedValue(3);
      const service = new CategoriesService(prisma);

      await expect(service.remove("cat_1")).rejects.toBeInstanceOf(ConflictException);
    });

    it("soft-deletes an empty category", async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findFirst as jest.Mock).mockResolvedValue({ id: "cat_1" });
      (prisma.category.count as jest.Mock).mockResolvedValue(0);
      (prisma.productCategory.count as jest.Mock).mockResolvedValue(0);
      const service = new CategoriesService(prisma);

      await service.remove("cat_1");

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: "cat_1" },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe("findTree", () => {
    it("nests children under their parent", async () => {
      const prisma = buildPrismaMock();
      (prisma.category.findMany as jest.Mock).mockResolvedValue([
        { id: "root", name: "Books", slug: "books", parentId: null },
        { id: "child", name: "Novels", slug: "novels", parentId: "root" },
      ]);
      const service = new CategoriesService(prisma);

      const tree = await service.findTree();

      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe("root");
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].id).toBe("child");
    });
  });
});
