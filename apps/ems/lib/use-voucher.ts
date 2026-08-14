"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type VoucherSource =
  | { kind: "SERIAL" }
  | { kind: "PAGE_TOTAL" }
  | { kind: "STAFF"; field: StaffField }
  | { kind: "TOTAL"; of: "GROSS" | "DEDUCTIONS" | "NET" }
  | { kind: "COMPONENT"; label: string };

export type StaffField =
  | "name"
  | "staffNumber"
  | "bankName"
  | "accountNumber"
  | "jobTitle"
  | "qualification"
  | "startDate"
  | "remark";

export interface VoucherColumn {
  key: string;
  label: string;
  source: VoucherSource;
  money?: boolean;
}

export interface VoucherSettings {
  title: string;
  rowsPerPage: number;
  columns: VoucherColumn[];
}

export interface VoucherCell {
  text: string;
  cents: number | null;
}

export interface VoucherPreview {
  heading: { schoolName: string; title: string; period: string };
  columns: VoucherColumn[];
  voucher: {
    pages: { pageNumber: number; rows: { staffProfileId: string; serial: number; cells: VoucherCell[] }[]; subtotalCents: number }[];
    grandTotalCents: number;
    columnTotals: (number | null)[];
    staffCount: number;
  };
}

export function useVoucherSettings() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["payroll", "voucher-settings"],
    enabled,
    queryFn: () =>
      apiFetch<VoucherSettings>("/v1/payroll/voucher-settings", { headers: authHeaders(accessToken) }),
  });
}

export function useSaveVoucherSettings() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: VoucherSettings) =>
      apiFetch<VoucherSettings>("/v1/payroll/voucher-settings", {
        method: "PUT",
        headers: authHeaders(accessToken),
        body: settings,
      }),
    onSuccess: () => {
      // The voucher itself is derived from these, so a stale preview after
      // saving would show the old layout and look like the save failed.
      void queryClient.invalidateQueries({ queryKey: ["payroll"] });
    },
  });
}

export function useVoucher(runId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["payroll", "voucher", runId],
    enabled: enabled && Boolean(runId),
    queryFn: () =>
      apiFetch<VoucherPreview>(`/v1/payroll/runs/${runId}/voucher`, { headers: authHeaders(accessToken) }),
  });
}

/**
 * Download the spreadsheet.
 *
 * Not apiFetch: this returns a binary body, and the response has to reach the
 * browser as a file rather than be parsed as JSON.
 */
export function useDownloadVoucher() {
  const { accessToken } = useAuthQueryState();
  return useMutation({
    mutationFn: async (input: { runId: string; includeAccountNumbers: boolean }) => {
      const res = await fetch(`/v1/payroll/runs/${input.runId}/voucher.xlsx`, {
        method: "POST",
        headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ includeAccountNumbers: input.includeAccountNumbers }),
      });

      if (!res.ok) {
        const problem = await res.json().catch(() => null);
        throw new ApiError(res.status, problem?.message ?? "Couldn't build the voucher.");
      }

      const blob = await res.blob();
      const name =
        res.headers.get("content-disposition")?.match(/filename="(.+?)"/)?.[1] ?? "voucher.xlsx";

      // Anchor-and-revoke rather than window.open: a blob URL left alive holds
      // the whole file in memory for the life of the tab, and this one carries
      // every salary in the school.
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);

      return name;
    },
  });
}
