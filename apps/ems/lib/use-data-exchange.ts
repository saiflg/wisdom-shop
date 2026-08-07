"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError, apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type SheetFormat = "xlsx" | "csv";

export interface DataEntity {
  name: string;
  label: string;
  columns: string[];
  keyColumn?: string;
  requiredColumns: string[];
}

export type RowAction = "create" | "update" | "error";

export interface RowPlan {
  rowNumber: number;
  action: RowAction;
  key: string | null;
  values: Record<string, string>;
  problems: string[];
}

export interface ImportPreview {
  rows: RowPlan[];
  toCreate: number;
  toUpdate: number;
  withErrors: number;
  unrecognisedHeaders: string[];
  missingColumns: string[];
  canCommit: string | null;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failures: { rowNumber: number; problem: string }[];
}

export function useDataEntities() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["data-exchange", "entities"],
    enabled,
    queryFn: () => apiFetch<DataEntity[]>("/v1/data/entities", { headers: authHeaders(accessToken) }),
  });
}

/**
 * Downloads a file the browser cannot fetch on its own.
 *
 * A plain `<a href>` would send no Authorization header, so the request has
 * to go through fetch and the resulting blob be handed to a temporary link.
 * The object URL is revoked afterwards; leaving them around keeps the whole
 * file in memory for the life of the tab, which for a full student roster is
 * not nothing.
 */
async function downloadFile(path: string, accessToken: string | null, fallbackName: string) {
  const res = await fetch(path, { credentials: "include", headers: authHeaders(accessToken) });

  if (!res.ok) {
    // Errors still come back as JSON even on a download route.
    const data = await res.json().catch(() => undefined);
    const message = (data as { message?: string } | undefined)?.message ?? res.statusText;
    throw new ApiError(res.status, message, data);
  }

  const disposition = res.headers.get("content-disposition") ?? "";
  const named = /filename="([^"]+)"/.exec(disposition)?.[1];
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = named ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function useDownloadTemplate() {
  const accessToken = useAuthQueryState().accessToken;
  return useMutation({
    mutationFn: ({ entity, format }: { entity: string; format: SheetFormat }) =>
      downloadFile(`/v1/data/${entity}/template?format=${format}`, accessToken, `${entity}-template.${format}`),
  });
}

export function useExportData() {
  const accessToken = useAuthQueryState().accessToken;
  return useMutation({
    mutationFn: ({ entity, format }: { entity: string; format: SheetFormat }) =>
      downloadFile(`/v1/data/${entity}/export?format=${format}`, accessToken, `${entity}.${format}`),
  });
}

async function postFile<T>(path: string, file: File, accessToken: string | null): Promise<T> {
  const form = new FormData();
  form.append("file", file);

  // No Content-Type header on purpose: the browser sets it along with the
  // multipart boundary, and overriding it makes the body unparseable.
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(accessToken),
    body: form,
  });

  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const raw = (data as { message?: unknown } | undefined)?.message;
    const message = Array.isArray(raw) ? raw.join(", ") : ((raw as string) ?? res.statusText);
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

/** Asks what a file would do. Writes nothing. */
export function usePreviewImport() {
  const accessToken = useAuthQueryState().accessToken;
  return useMutation({
    mutationFn: ({ entity, file }: { entity: string; file: File }) =>
      postFile<ImportPreview>(`/v1/data/${entity}/preview`, file, accessToken),
  });
}

/** Carries out the import. Separate call, deliberately. */
export function useCommitImport() {
  const accessToken = useAuthQueryState().accessToken;
  return useMutation({
    mutationFn: ({ entity, file }: { entity: string; file: File }) =>
      postFile<ImportResult>(`/v1/data/${entity}/import`, file, accessToken),
  });
}
