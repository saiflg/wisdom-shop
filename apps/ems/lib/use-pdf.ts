"use client";

import { useMutation } from "@tanstack/react-query";
import { ApiError } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

/**
 * Opens a generated PDF.
 *
 * These routes need an Authorization header, so a plain `<a href>` cannot
 * fetch them — the request goes through fetch and the blob is opened in a
 * new tab. Opening rather than downloading matches the API, which serves
 * these `inline`: a parent checking a report card on a phone wants to see it,
 * not find it later in a downloads folder.
 *
 * The object URL is revoked on a timer rather than immediately, because
 * revoking it before the new tab has read it leaves the reader staring at a
 * blank page. A minute is far longer than any browser needs and still frees
 * the memory rather than holding a document for the life of the tab.
 */
export function usePdfDownload() {
  const accessToken = useAuthQueryState().accessToken;

  return useMutation({
    mutationFn: async ({ path, filename }: { path: string; filename: string }) => {
      const res = await fetch(path, { credentials: "include", headers: authHeaders(accessToken) });

      if (!res.ok) {
        // Errors come back as JSON even on a document route.
        const data = await res.json().catch(() => undefined);
        const message = (data as { message?: string } | undefined)?.message ?? res.statusText;
        throw new ApiError(res.status, message, data);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank");

      // Popup blockers are common; fall back to a download so the click is
      // never silently ignored.
      if (!opened) {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  });
}
