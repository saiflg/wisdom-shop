"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { useAuthStore } from "@/store/auth-store";
import type { Product } from "./catalog";
import type { ProductPayload } from "./product-form";

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Roles the API accepts on /v1/admin/products and /v1/admin/categories. */
const CATALOG_ROLES = ["ADMIN", "SUPER_ADMIN", "MANAGER", "EDITOR"];

export function useCanEditCatalog(): boolean {
  const user = useAuthStore((s) => s.user);
  return user?.roles.some((role) => CATALOG_ROLES.includes(role)) ?? false;
}

/**
 * The admin view is the same shape as the public one — the API returns every
 * scalar either way — plus the timestamps the storefront has no use for.
 * Re-declaring the shared fields here only creates a second definition to
 * keep in step with the first.
 */
export interface AdminProduct extends Product {
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  children?: AdminCategory[];
}

const PRODUCTS_KEY = "admin-catalog-products";
const CATEGORIES_KEY = "admin-catalog-categories";

export function useAdminProducts(query: { search?: string; status?: string; page?: number }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const canEdit = useCanEditCatalog();

  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  params.set("page", String(query.page ?? 1));
  params.set("limit", "20");

  return useQuery({
    queryKey: [PRODUCTS_KEY, query.search ?? "", query.status ?? "", query.page ?? 1],
    enabled: Boolean(accessToken) && canEdit,
    queryFn: () =>
      apiFetch<Paginated<AdminProduct>>(`/v1/admin/products?${params.toString()}`, {
        headers: authHeaders(accessToken),
      }),
  });
}

export function useAdminProduct(id: string | null) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const canEdit = useCanEditCatalog();

  return useQuery({
    queryKey: [PRODUCTS_KEY, "one", id],
    enabled: Boolean(accessToken) && canEdit && Boolean(id),
    queryFn: () =>
      apiFetch<AdminProduct>(`/v1/admin/products/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export function useCreateProduct() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ProductPayload) =>
      apiFetch<AdminProduct>("/v1/admin/products", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: payload,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] }),
  });
}

export function useUpdateProduct() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ProductPayload> }) =>
      apiFetch<AdminProduct>(`/v1/admin/products/${id}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: payload,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] }),
  });
}

export function useDeleteProduct() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/v1/admin/products/${id}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] }),
  });
}

export function useAdminCategories() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const canEdit = useCanEditCatalog();

  return useQuery({
    queryKey: [CATEGORIES_KEY],
    enabled: Boolean(accessToken) && canEdit,
    queryFn: () =>
      apiFetch<AdminCategory[]>("/v1/admin/categories", { headers: authHeaders(accessToken) }),
  });
}

export function useCreateCategory() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string; slug?: string; parentId?: string }) =>
      apiFetch<AdminCategory>("/v1/admin/categories", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CATEGORIES_KEY] }),
  });
}

export function useUpdateCategory() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch<AdminCategory>(`/v1/admin/categories/${id}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: { name },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CATEGORIES_KEY] }),
  });
}

export function useDeleteCategory() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/v1/admin/categories/${id}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      }),
    // Products carry category links, so a deletion changes both lists.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CATEGORIES_KEY] });
      queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
    },
  });
}

/** Flattens the category tree into indented options for a picker. */
export function flattenCategories(
  tree: AdminCategory[] | undefined,
  depth = 0,
): { id: string; label: string }[] {
  if (!tree) return [];
  return tree.flatMap((node) => [
    { id: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenCategories(node.children, depth + 1),
  ]);
}
