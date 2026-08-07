"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const INPUT =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

const PILL = "rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:opacity-50";
const OUTLINE = `${PILL} border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800`;

export default function DataExchangePage() {
  const { t } = useTranslation();
  const { data: entities } = useDataEntities();

  const [entityName, setEntityName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const downloadTemplate = useDownloadTemplate();
  const exportData = useExportData();
  const previewImport = usePreviewImport();
  const commitImport = useCommitImport();

  const entity = useMemo(
    () => entities?.find((candidate) => candidate.name === entityName),
    [entities, entityName],
  );

  useEffect(() => {
    if (!entityName && entities?.length) setEntityName(entities[0]?.name ?? "");
  }, [entities, entityName]);

  // Changing entity mid-flow must not leave a preview from the previous one
  // on screen — committing that would import the wrong file against the wrong
  // records.
  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const runDownload = async (kind: "template" | "export", format: SheetFormat) => {
    setError(null);
    try {
      const mutation = kind === "template" ? downloadTemplate : exportData;
      await mutation.mutateAsync({ entity: entityName, format });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("data.exportFailed"));
    }
  };

  const runPreview = async (chosen: File) => {
    setError(null);
    setResult(null);
    setPreview(null);
    try {
      setPreview(await previewImport.mutateAsync({ entity: entityName, file: chosen }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("data.checkFailed"));
    }
  };

  const runCommit = async () => {
    if (!file) return;
    setError(null);
    try {
      setResult(await commitImport.mutateAsync({ entity: entityName, file }));
      setPreview(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("data.commitFailed"));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("data.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t("data.intro")}</p>
      </div>

      <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <label htmlFor="entity" className="block text-sm font-medium">
          {t("data.whatKind")}
        </label>
        <select
          id="entity"
          value={entityName}
          onChange={(event) => {
            setEntityName(event.target.value);
            reset();
          }}
          className={clsx(INPUT, "max-w-sm")}
        >
          {entities?.map((candidate) => (
            <option key={candidate.name} value={candidate.name}>
              {candidate.label}
            </option>
          ))}
        </select>

        {entity && (
          <div className="mt-4 space-y-2 text-sm">
            <p className="text-slate-500">
              <span className="font-medium text-slate-700 dark:text-slate-300">{t("data.columns")}: </span>
              {entity.columns.map((column, index) => (
                <span key={column}>
                  {index > 0 && ", "}
                  <span
                    className={clsx(
                      entity.requiredColumns.includes(column) && "font-medium text-slate-700 dark:text-slate-300",
                    )}
                  >
                    {column}
                  </span>
                  {entity.requiredColumns.includes(column) && (
                    <span className="text-xs text-slate-400"> ({t("data.required")})</span>
                  )}
                </span>
              ))}
            </p>
            {entity.keyColumn && (
              <p className="text-xs text-slate-500">
                <span className="font-medium">{t("data.matchedOn")}: {entity.keyColumn}.</span>{" "}
                {t("data.matchedOnHint")}
              </p>
            )}
            {entity.name === "staff" && <p className="text-xs text-amber-600">{t("data.bankNote")}</p>}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => runDownload("template", "xlsx")} className={OUTLINE}>
            {t("data.template")} (.xlsx)
          </button>
          <button type="button" onClick={() => runDownload("template", "csv")} className={OUTLINE}>
            {t("data.template")} (.csv)
          </button>
          <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <button
            type="button"
            onClick={() => runDownload("export", "xlsx")}
            disabled={exportData.isPending}
            className={clsx(PILL, "bg-brand-gradient text-white hover:opacity-90")}
          >
            {exportData.isPending ? t("data.exporting") : `${t("data.export")} (.xlsx)`}
          </button>
          <button type="button" onClick={() => runDownload("export", "csv")} className={OUTLINE}>
            {t("data.export")} (.csv)
          </button>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div>
          <label htmlFor="file" className="block text-sm font-medium">
            {t("data.upload")}
          </label>
          <input
            id="file"
            ref={fileInput}
            type="file"
            accept=".xlsx,.csv"
            onChange={(event) => {
              const chosen = event.target.files?.[0] ?? null;
              setFile(chosen);
              if (chosen) void runPreview(chosen);
            }}
            className="mt-1.5 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold dark:file:bg-slate-800"
          />
          <p className="mt-1 text-xs text-slate-500">{t("data.uploadHint")}</p>
        </div>

        {previewImport.isPending && <p className="text-sm text-slate-500">{t("data.checking")}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {preview && <PreviewPanel preview={preview} onCommit={runCommit} committing={commitImport.isPending} />}
        {result && <ResultPanel result={result} onReset={reset} />}
      </section>
    </div>
  );
}

function PreviewPanel({
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
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
      <div>
        <p className="font-semibold">{t("data.previewTitle")}</p>
        {/* Said plainly, because the whole point of this screen is that
            looking at it changes nothing. */}
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
                {/* The spreadsheet's own row number — the person fixing this
                    is looking at the spreadsheet, not at our records. */}
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
          className={clsx(PILL, "bg-brand-gradient text-white hover:opacity-90")}
        >
          {committing ? t("data.committing") : t("data.commit")}
        </button>
      )}
    </div>
  );
}

function ResultPanel({ result, onReset }: { result: ImportResult; onReset: () => void }) {
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

      <button type="button" onClick={onReset} className={OUTLINE}>
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
