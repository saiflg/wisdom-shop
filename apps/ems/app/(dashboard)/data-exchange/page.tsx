"use client";

import { useTranslation } from "@/lib/i18n/i18n-provider";
import { DataExchangeBar } from "@/components/data-exchange-bar";
import { useDataEntities } from "@/lib/use-data-exchange";

/**
 * Everything in one place, for the setup-day case.
 *
 * The bar that matters day to day lives next to the records themselves —
 * beside "New student" on the students page and so on. This page exists for
 * the other case: a school loading its whole roster at once, before anyone
 * has visited any of those pages.
 *
 * It renders the same component rather than its own copy. Two
 * implementations of "preview before writing" is how one of them quietly
 * loses the preview.
 */
export default function DataExchangePage() {
  const { t } = useTranslation();
  const { data: entities } = useDataEntities();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("data.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t("data.intro")}</p>
      </div>

      {entities?.map((entity) => (
        <section key={entity.name} className="space-y-2">
          <div>
            <h2 className="text-lg font-semibold">{entity.label}</h2>
            <p className="text-sm text-slate-500">
              {entity.columns.map((column, index) => (
                <span key={column}>
                  {index > 0 && ", "}
                  <span
                    className={
                      entity.requiredColumns.includes(column)
                        ? "font-medium text-slate-700 dark:text-slate-300"
                        : undefined
                    }
                  >
                    {column}
                  </span>
                </span>
              ))}
            </p>
            {entity.name === "staff" && <p className="text-xs text-amber-600">{t("data.bankNote")}</p>}
          </div>
          <DataExchangeBar entity={entity.name} />
        </section>
      ))}
    </div>
  );
}
