"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import {
  useCommitImport,
  useDataEntities,
  useDownloadTemplate,
  useExportData,
  usePreviewImport,
  type ImportPreview,
  type ImportResult,
  type SheetFormat,
} from "@/lib/use-data-exchange";

/**
 * Import and export, offered where the records actually live.
 *
 * This was first built as a single separate page, which was the wrong shape:
 * someone adding students should not have to know a "bulk import" screen
 * exists somewhere else. The bar goes next to the button that adds one at a
 * time, so uploading a hundred is the obvious neighbour of adding one.
 *
 * One component rather than five copies — the preview-before-writing rule is
 * the whole safety story, and five near-identical implementations is how one
 * of them quietly loses it.
 */
export function DataExchangeBar({ entity, children }: { entity: string; children?: React.ReactNode }) {
  const { t } = useTranslation();
  const { data: entities } = useDataEntities();
  const definition = entities?.find((candidate) => candidate.name === entity);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const downloadTemplate = useDownloadTemplate();
  const exportData = useExportData();
  const previewImport = usePreviewImport();
  const commitImport = useCommitImport();

  // Only administrators can import or export, and the entities list is the
  // route that says so — if it did not load, the bar simply is not offered.
  //
  // `children` still renders, though: the page passes its own "add one"
  // button through here so the two live in one toolbar, and a teacher who
  // cannot bulk-import must not lose the ability to add a single student.
  if (!definition) {
    return children ? <div className="flex flex-wrap items-center justify-end gap-2">{children}</div> : null;
  }

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const download = async (kind: "template" | "export", format: SheetFormat) => {
    setError(null);
    try {
      await (kind === "template" ? downloadTemplate : exportData).mutateAsync({ entity, format });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("data.exportFailed"));
    }
  };

  const runPreview = async (chosen: File) => {
    setError(null);
    setResult(null);
    setPreview(null);
    try {
      setPreview(await previewImport.mutateAsync({ entity, file: chosen }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("data.checkFailed"));
    }
  };

  const runCommit = async () => {
    if (!file) return;
    setError(null);
    try {
      setResult(await commitImport.mutateAsync({ entity, file }));
      setPreview(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("data.commitFailed"));
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="me-1 text-sm font-medium text-slate-600 dark:text-slate-400">
          {t("data.barTitle")}
        </span>

        <Menu
          label={t("data.sample")}
          hint={t("data.sampleHint")}
          onPick={(format) => download("template", format)}
        />
        <Menu label={t("data.export")} onPick={(format) => download("export", format)} />

        <button
          type="button"
          onClick={() => {
            setOpen((current) => !current);
            if (open) reset();
          }}
          className={clsx(
            "rounded-full px-4 py-1.5 text-sm font-semibold transition",
            open
              ? "border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              : "bg-brand-gradient text-white hover:opacity-90",
          )}
        >
          {open ? t("data.cancelUpload") : t("data.uploadMany")}
        </button>

        {/* The page's own "add one" button, last and to the right: adding a
            hundred and adding one belong in the same toolbar, and the one
            people reach for most often should be the one that reads as
            primary. */}
        {children && <div className="ms-auto flex flex-wrap items-center gap-2">{children}</div>}
      </div>

      {open && (
        <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
          <p className="text-xs text-slate-500">
            {definition.keyColumn && (
              <>
                <span className="font-medium">
                  {t("data.matchedOn")}: {definition.keyColumn}.
                </span>{" "}
                {t("data.matchedOnHint")}
              </>
            )}
          </p>

          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.csv"
            aria-label={t("data.upload")}
            onChange={(event) => {
              const chosen = event.target.files?.[0] ?? null;
              setFile(chosen);
              if (chosen) void runPreview(chosen);
            }}
            className="block w-full text-sm file:me-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold dark:file:bg-slate-800"
          />
          <p className="text-xs text-slate-500">{t("data.uploadHint")}</p>

          {previewImport.isPending && <p className="text-sm text-slate-500">{t("data.checking")}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {preview && (
            <PreviewPanel preview={preview} onCommit={runCommit} committing={commitImport.isPending} />
          )}
          {result && <ResultPanel result={result} onReset={reset} />}
        </div>
      )}
    </section>
  );
}

/**
 * A format picker rather than two buttons per action.
 *
 * Four buttons in a row above a table is noise; a school picks a format once
 * and rarely thinks about it again.
 */
function Menu({
  label,
  hint,
  onPick,
}: {
  label: string;
  hint?: string;
  onPick: (format: SheetFormat) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        title={hint}
        onClick={() => setOpen((current) => !current)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        {label} ▾
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
          {(["xlsx", "csv"] as const).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(format);
              }}
              className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {format === "xlsx" ? "Excel (.xlsx)" : "CSV (.csv)"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PreviewPanel({
  preview,
  onCommit,
  committing,
}: {
  preview: ImportPreview;
  onCommit: () => void;
  committing: boolean;
}) {
  const { t } = useTranslation();
  const problemRows = preview.rows.filter((row) => row.action === "error");

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
      <div>
        <p className="font-semibold">{t("data.previewTitle")}</p>
        {/* Stated plainly: the whole point of this step is that looking
            changes nothing. */}
        <p className="text-xs text-slate-500">{t("data.previewNothingSaved")}</p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Tally value={preview.toCreate} label={t("data.willCreate")} tone="ok" />
        <Tally value={preview.toUpdate} label={t("data.willUpdate")} tone="info" />
        <Tally value={preview.withErrors} label={t("data.willSkip")} tone="warn" />
      </div>

      {preview.missingColumns.length > 0 && (
        <p className="text-sm text-red-600">
          {t("data.missingColumns")}: {preview.missingColumns.join(", ")}
        </p>
      )}
      {preview.unrecognisedHeaders.length > 0 && (
        <p className="text-sm text-amber-600">
          {t("data.unrecognised")}: {preview.unrecognisedHeaders.join(", ")}
        </p>
      )}

      {problemRows.length > 0 && (
        <div>
          <p className="text-sm font-medium">{t("data.rowsWithProblems")}</p>
          <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto text-sm">
            {problemRows.map((row) => (
              <li key={row.rowNumber} className="flex gap-2">
                {/* The spreadsheet's own row number — that is what the person
                    fixing the file is looking at. */}
                <span className="shrink-0 font-mono text-xs text-slate-500">
                  {t("data.row")} {row.rowNumber}
                </span>
                <span className="text-red-600">{row.problems.join("; ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.canCommit ? (
        <p className="text-sm font-medium text-red-600">{preview.canCommit}</p>
      ) : (
        <button
          type="button"
          onClick={onCommit}
          disabled={committing}
          className="rounded-full bg-brand-gradient px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {committing ? t("data.committing") : t("data.commit")}
        </button>
      )}
    </div>
  );
}

export function ResultPanel({ result, onReset }: { result: ImportResult; onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-900/20">
      <p className="font-semibold text-emerald-700 dark:text-emerald-300">{t("data.done")}</p>
      <p className="text-sm">
        {t("data.doneDetail")
          .replace("{created}", String(result.created))
          .replace("{updated}", String(result.updated))
          .replace("{skipped}", String(result.skipped))}
      </p>

      {result.failures.length > 0 && (
        <div>
          <p className="text-sm font-medium">{t("data.failuresTitle")}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {result.failures.map((failure) => (
              <li key={failure.rowNumber} className="flex gap-2">
                <span className="shrink-0 font-mono text-xs text-slate-500">
                  {t("data.row")} {failure.rowNumber}
                </span>
                <span className="text-red-600">{failure.problem}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onReset}
        className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold dark:border-slate-700"
      >
        {t("data.startOver")}
      </button>
    </div>
  );
}

function Tally({ value, label, tone }: { value: number; label: string; tone: "ok" | "info" | "warn" }) {
  const tones = {
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    info: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  } as const;

  return (
    <span className={clsx("rounded-full px-3 py-1", tones[tone])}>
      <span className="font-semibold tabular-nums">{value}</span> {label}
    </span>
  );
}
