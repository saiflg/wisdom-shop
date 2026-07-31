"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";
import { useAuthStore } from "@/store/auth-store";

export interface UploadedImage {
  url: string;
  contentType: string;
  sizeBytes: number;
}

export interface ProductFile {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface DownloadableProduct {
  productId: string;
  productTitle: string;
  productSlug: string;
  orderNumber: string;
  purchasedAt: string;
  files: ProductFile[];
}

/**
 * Uploads bypass `apiFetch` deliberately.
 *
 * That helper sets `Content-Type: application/json`, which would stop the
 * browser generating the multipart boundary the server needs to parse the
 * body. The header must be left unset so fetch fills it in.
 */
async function postFile<T>(path: string, file: File, token: string | null): Promise<T> {
  const body = new FormData();
  body.append("file", file);

  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });

  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const raw = data && typeof data === "object" ? (data as { message?: unknown }).message : undefined;
    const message = Array.isArray(raw) ? raw.join(", ") : (raw as string) || res.statusText;
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

export function useUploadImage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  return useMutation({
    mutationFn: (file: File) => postFile<UploadedImage>("/v1/uploads/images", file, accessToken),
  });
}

const PRODUCT_FILES_KEY = "admin-product-files";

export function useProductFiles(productId: string | undefined) {
  const accessToken = useAuthStore((s) => s.accessToken);

  return useQuery({
    queryKey: [PRODUCT_FILES_KEY, productId],
    enabled: Boolean(accessToken) && Boolean(productId),
    queryFn: async (): Promise<ProductFile[]> => {
      const res = await fetch(`/v1/admin/products/${productId}/files`, {
        credentials: "include",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) throw new ApiError(res.status, "Couldn't load files");
      return res.json();
    },
  });
}

export function useAttachProductFile(productId: string | undefined) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) =>
      postFile<ProductFile>(`/v1/admin/products/${productId}/files`, file, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PRODUCT_FILES_KEY, productId] }),
  });
}

export function useRemoveProductFile(productId: string | undefined) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fileId: string) => {
      const res = await fetch(`/v1/admin/products/${productId}/files/${fileId}`, {
        method: "DELETE",
        credentials: "include",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) throw new ApiError(res.status, "Couldn't remove that file");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PRODUCT_FILES_KEY, productId] }),
  });
}

export function useMyDownloads() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);

  return useQuery({
    queryKey: ["my-downloads"],
    enabled: status === "authenticated" && Boolean(accessToken),
    queryFn: async (): Promise<DownloadableProduct[]> => {
      const res = await fetch("/v1/downloads", {
        credentials: "include",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) throw new ApiError(res.status, "Couldn't load your downloads");
      return res.json();
    },
  });
}

/**
 * Fetches the file with the access token attached, then hands the browser a
 * blob to save.
 *
 * A plain `<a href>` cannot carry an Authorization header, and the endpoint
 * requires one — the alternative would be a URL that works without a header,
 * which is exactly the shareable link this feature must not have.
 */
export async function downloadFile(fileId: string, filename: string, token: string | null) {
  const res = await fetch(`/v1/downloads/${fileId}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const data = await res.json().catch(() => undefined);
    const raw = data && typeof data === "object" ? (data as { message?: unknown }).message : undefined;
    throw new ApiError(res.status, (raw as string) || "That download was refused");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Released on the next tick so the click has been handled; leaving it
  // allocated leaks the whole file for the life of the page.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
