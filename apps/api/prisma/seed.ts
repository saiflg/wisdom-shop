import { PrismaClient, type ProductType, type RoleName } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

interface DemoProduct {
  title: string;
  slug: string;
  description: string;
  type: ProductType;
  priceCents: number;
  category: string;
  imageUrl: string;
}

interface DemoCategory {
  name: string;
  slug: string;
  parentSlug?: string;
}

const DEMO_CATEGORIES: DemoCategory[] = [
  { name: "Books", slug: "books" },
  { name: "School & University Books", slug: "school-university-books", parentSlug: "books" },
  { name: "Islamic Books", slug: "islamic-books", parentSlug: "books" },
  { name: "Christian Books", slug: "christian-books", parentSlug: "books" },
  { name: "Novels & Story Books", slug: "novels-story-books", parentSlug: "books" },
  { name: "Courses & Lectures", slug: "courses-lectures" },
  { name: "Educational Software", slug: "educational-software" },
  { name: "Educational Equipment", slug: "educational-equipment" },
];

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    title: "Introduction to Algebra",
    slug: "introduction-to-algebra",
    description:
      "A clear, example-driven introduction to algebra for secondary school and early university students, covering equations, functions, and graphing.",
    type: "PHYSICAL",
    priceCents: 1500,
    category: "school-university-books",
    imageUrl: "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800",
  },
  {
    title: "The Noble Quran — English Translation",
    slug: "noble-quran-english-translation",
    description: "A widely used English translation of the Quran with facing-page commentary.",
    type: "PHYSICAL",
    priceCents: 1200,
    category: "islamic-books",
    imageUrl: "https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=800",
  },
  {
    title: "Holy Bible — Study Edition",
    slug: "holy-bible-study-edition",
    description: "A study edition of the Holy Bible with cross-references, maps, and concordance.",
    type: "PHYSICAL",
    priceCents: 1800,
    category: "christian-books",
    imageUrl: "https://images.unsplash.com/photo-1508962914676-134849a727f0?w=800",
  },
  {
    title: "The Adventures of a Curious Mind",
    slug: "adventures-of-a-curious-mind",
    description: "An illustrated story collection for young readers, delivered as an instant-download e-book (PDF/EPUB).",
    type: "DIGITAL",
    priceCents: 499,
    category: "novels-story-books",
    imageUrl: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800",
  },
  {
    title: "Complete Web Development Bootcamp",
    slug: "complete-web-development-bootcamp",
    description: "A self-paced video course covering HTML, CSS, JavaScript, and building full-stack web applications.",
    type: "COURSE",
    priceCents: 4999,
    category: "courses-lectures",
    imageUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800",
  },
  {
    title: "School Management System — Standard License",
    slug: "school-management-system-standard",
    description:
      "A full school management system covering admissions, attendance, results, and a parent portal. Includes a 1-year standard license and onboarding support.",
    type: "SOFTWARE",
    priceCents: 49900,
    category: "educational-software",
    imageUrl: "https://images.unsplash.com/photo-1580894732444-8ecded7900cd?w=800",
  },
  {
    title: "Graphing Scientific Calculator",
    slug: "graphing-scientific-calculator",
    description: "A durable graphing calculator suitable for algebra through calculus coursework.",
    type: "PHYSICAL",
    priceCents: 8999,
    category: "educational-equipment",
    imageUrl: "https://images.unsplash.com/photo-1587145820266-a5951ee6f620?w=800",
  },
];

const ALL_ROLES: RoleName[] = [
  "GUEST",
  "CUSTOMER",
  "VENDOR",
  "AFFILIATE",
  "SUPPORT",
  "EDITOR",
  "MANAGER",
  "ADMIN",
  "SUPER_ADMIN",
  "DEVELOPER",
];

const PERMISSIONS = [
  { key: "products.read", label: "View products" },
  { key: "products.write", label: "Create/edit products" },
  { key: "products.delete", label: "Delete products" },
  { key: "orders.read", label: "View orders" },
  { key: "orders.write", label: "Update order status" },
  { key: "orders.refund", label: "Issue refunds" },
  { key: "vendors.approve", label: "Approve/suspend vendor accounts" },
  { key: "users.read", label: "View customer accounts" },
  { key: "users.write", label: "Edit customer accounts" },
  { key: "users.impersonate", label: "Impersonate a user for support" },
  { key: "coupons.write", label: "Create/edit coupons" },
  { key: "cms.write", label: "Edit CMS content and blog posts" },
  { key: "settings.write", label: "Edit system settings" },
  { key: "audit-logs.read", label: "View audit logs" },
  { key: "api-keys.write", label: "Create/revoke API keys" },
] as const;

// Which permission keys each role gets, beyond what an unauthenticated
// GUEST/CUSTOMER/AFFILIATE has (none of the above — those roles operate
// purely through their own-resource endpoints, not permission-gated ones).
const ROLE_PERMISSIONS: Partial<Record<RoleName, string[]>> = {
  VENDOR: ["products.read", "products.write", "orders.read"],
  SUPPORT: ["users.read", "orders.read", "orders.write", "users.impersonate"],
  EDITOR: ["products.read", "products.write", "cms.write"],
  MANAGER: [
    "products.read",
    "products.write",
    "products.delete",
    "orders.read",
    "orders.write",
    "orders.refund",
    "vendors.approve",
    "coupons.write",
    "cms.write",
  ],
  ADMIN: PERMISSIONS.map((p) => p.key).filter((k) => k !== "api-keys.write"),
  SUPER_ADMIN: PERMISSIONS.map((p) => p.key),
  DEVELOPER: ["api-keys.write", "audit-logs.read", "settings.write"],
};

async function main() {
  console.log("Seeding roles...");
  const roles = new Map<RoleName, string>();
  for (const name of ALL_ROLES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    roles.set(name, role.id);
  }

  console.log("Seeding permissions...");
  const permissionIds = new Map<string, string>();
  for (const permission of PERMISSIONS) {
    const record = await prisma.permission.upsert({
      where: { key: permission.key },
      update: { label: permission.label },
      create: permission,
    });
    permissionIds.set(permission.key, record.id);
  }

  console.log("Linking role permissions...");
  for (const [roleName, keys] of Object.entries(ROLE_PERMISSIONS) as [RoleName, string[]][]) {
    const roleId = roles.get(roleName);
    if (!roleId) continue;
    await prisma.role.update({
      where: { id: roleId },
      data: {
        permissions: {
          set: keys.map((key) => ({ id: permissionIds.get(key)! })),
        },
      },
    });
  }

  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL;
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD;

  if (superAdminEmail && superAdminPassword) {
    console.log(`Seeding super admin (${superAdminEmail})...`);
    const passwordHash = await argon2.hash(superAdminPassword);
    const user = await prisma.user.upsert({
      where: { email: superAdminEmail },
      update: {},
      create: {
        email: superAdminEmail,
        passwordHash,
        firstName: "Super",
        lastName: "Admin",
        emailVerifiedAt: new Date(),
      },
    });

    const superAdminRoleId = roles.get("SUPER_ADMIN")!;
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: superAdminRoleId } },
      update: {},
      create: { userId: user.id, roleId: superAdminRoleId },
    });

    await prisma.cart.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
  } else {
    console.log(
      "SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD not set — skipping super admin creation.",
    );
  }

  console.log("Seeding demo categories...");
  const categoryIds = new Map<string, string>();
  // Two passes: parents first (DEMO_CATEGORIES lists them before their
  // children), so parentSlug lookups below always resolve.
  for (const category of DEMO_CATEGORIES) {
    const record = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, parentId: category.parentSlug ? categoryIds.get(category.parentSlug) : null },
      create: { name: category.name, slug: category.slug, parentId: category.parentSlug ? categoryIds.get(category.parentSlug) : null },
    });
    categoryIds.set(category.slug, record.id);
  }

  console.log("Seeding demo products...");
  for (const product of DEMO_PRODUCTS) {
    const categoryId = categoryIds.get(product.category);
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        title: product.title,
        description: product.description,
        type: product.type,
        priceCents: product.priceCents,
        status: "PUBLISHED",
      },
      create: {
        title: product.title,
        slug: product.slug,
        description: product.description,
        type: product.type,
        priceCents: product.priceCents,
        status: "PUBLISHED",
        images: { create: [{ url: product.imageUrl, altText: product.title, position: 0 }] },
        categories: categoryId ? { create: [{ categoryId }] } : undefined,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
