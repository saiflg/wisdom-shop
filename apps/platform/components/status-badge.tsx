import clsx from "clsx";
import type { SchoolStatus } from "@/lib/use-schools";

const STYLES: Record<SchoolStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  SUSPENDED: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  PROVISIONING: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function StatusBadge({ status }: { status: SchoolStatus }) {
  return (
    <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-medium", STYLES[status])}>{status}</span>
  );
}
