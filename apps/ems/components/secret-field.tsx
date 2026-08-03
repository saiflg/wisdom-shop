"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { useTranslation } from "@/lib/i18n/i18n-provider";

interface SecretFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  /** The masked hint the API returned, or null when nothing is stored. */
  storedMask: string | null;
  error?: string;
  onClear?: () => void;
}

/**
 * Input for a credential the server will only ever show masked.
 *
 * Leaving it blank keeps the stored value — that is the API's contract, and
 * it has to be stated in the UI, because otherwise an admin editing an
 * unrelated field reasonably fears they are about to wipe their gateway.
 * Clearing is therefore a separate, explicit action rather than "empty the
 * box and save".
 */
export const SecretField = forwardRef<HTMLInputElement, SecretFieldProps>(function SecretField(
  { label, storedMask, error, onClear, id, name, ...inputProps },
  ref,
) {
  const { t } = useTranslation();
  const fieldId = id ?? name;
  const errorId = `${fieldId}-error`;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="block text-sm font-medium">
          {label}
        </label>
        {storedMask && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
          >
            {t("settings.clearSecret")}
          </button>
        )}
      </div>
      <input
        ref={ref}
        id={fieldId}
        name={name}
        type="password"
        autoComplete="new-password"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        placeholder={storedMask ?? undefined}
        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
        {...inputProps}
      />
      <p className="mt-1 text-xs text-slate-500">
        {storedMask ? t("settings.secretStored", { mask: storedMask }) : t("settings.secretNotSet")}
      </p>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
});
