"use client";

import { useState } from "react";
import clsx from "clsx";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { usePdfDownload } from "@/lib/use-pdf";

/**
 * Opens a generated document.
 *
 * The failure is shown next to the button rather than swallowed: the most
 * likely reason a PDF does not appear is that there is nothing to print yet —
 * results not published, nobody enrolled — and the API says exactly that.
 */
export function PdfButton({
  path,
  filename,
  label,
  variant = "outline",
}: {
  path: string;
  filename: string;
  label?: string;
  variant?: "outline" | "solid";
}) {
  const { t } = useTranslation();
  const download = usePdfDownload();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={download.isPending}
        onClick={async () => {
          setError(null);
          try {
            await download.mutateAsync({ path, filename });
          } catch (err) {
            setError(err instanceof ApiError ? err.message : t("pdf.failed"));
          }
        }}
        className={clsx(
          "rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:opacity-50",
          variant === "solid"
            ? "bg-brand-gradient text-white hover:opacity-90"
            : "border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800",
        )}
      >
        {download.isPending ? t("pdf.preparing") : (label ?? t("pdf.download"))}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
