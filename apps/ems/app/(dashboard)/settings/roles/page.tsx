"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";

type RoleName = "SCHOOL_ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN";

const ROLE_LABEL: Record<RoleName, string> = {
  SCHOOL_ADMIN: "Administrators",
  TEACHER: "Teachers",
  STUDENT: "Students",
  GUARDIAN: "Parents",
};

const ROLES: RoleName[] = ["SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN"];

interface RouteCapability {
  method: string;
  path: string;
  /** Null means no @Roles at all — reachable by everyone signed in. */
  roles: RoleName[] | null;
  module: string | null;
}

interface AreaSummary {
  area: string;
  routes: RouteCapability[];
  reachedBy: RoleName[];
  openRoutes: number;
  modules: string[];
}

interface Capabilities {
  areas: AreaSummary[];
  counts: Record<RoleName, number>;
  totalRoutes: number;
  openRoutes: number;
}

function useCapabilities() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["roles", "capabilities"],
    enabled,
    queryFn: () =>
      apiFetch<Capabilities>("/v1/roles/capabilities", { headers: authHeaders(accessToken) }),
  });
}

/**
 * What each role can actually reach.
 *
 * Read from the running API's own route metadata — the same decorators the
 * guards read — rather than from a list maintained beside them. A
 * hand-written permissions matrix is accurate the day it is written and wrong
 * by the third release, and it fails silently: it goes on reassuring an
 * administrator about restrictions that were removed months ago.
 */
export default function RolesPage() {
  const { data, isLoading } = useCapabilities();
  const [role, setRole] = useState<RoleName | "ALL">("ALL");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Roles</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          What each kind of account can reach. Read from the API itself, so it cannot disagree with what is
          actually enforced.
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}

      {data && (
        <>
          <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex flex-wrap gap-8">
              {ROLES.map((name) => (
                <div key={name}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {ROLE_LABEL[name]}
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{data.counts[name]}</p>
                  <p className="text-xs text-slate-500">of {data.totalRoutes} endpoints</p>
                </div>
              ))}
            </div>

            {/* Surfaced rather than left to be counted. These are reachable by
                every signed-in person, which is a deliberate choice for each
                one — but an administrator should be told the number rather
                than have to add it up. */}
            {data.openRoutes > 0 && (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                {data.openRoutes} endpoint{data.openRoutes === 1 ? " is" : "s are"} open to everyone signed
                in. Each one is a deliberate decision — mostly things a family needs about their own child,
                narrowed inside the service rather than by role.
              </p>
            )}
          </section>

          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Show what one role can reach
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as RoleName | "ALL")}
              className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="ALL">Everything</option>
              {ROLES.map((name) => (
                <option key={name} value={name}>
                  {ROLE_LABEL[name]}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-3">
            {data.areas
              .filter((area) => role === "ALL" || area.reachedBy.includes(role))
              .map((area) => (
                <Area key={area.area} area={area} role={role} />
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function Area({ area, role }: { area: AreaSummary; role: RoleName | "ALL" }) {
  const [open, setOpen] = useState(false);
  const routes =
    role === "ALL"
      ? area.routes
      : area.routes.filter((route) => (route.roles === null ? true : route.roles.includes(role)));

  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{area.area}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {routes.length} endpoint{routes.length === 1 ? "" : "s"} ·{" "}
            {area.reachedBy.map((name) => ROLE_LABEL[name]).join(", ") || "Nobody"}
            {area.modules.length > 0 && ` · needs ${area.modules.join(", ")}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {area.openRoutes > 0 && (
            <span className="rounded-full bg-slate-500 px-2.5 py-1 text-xs font-semibold text-white">
              {area.openRoutes} open to all
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-700"
          >
            {open ? "Close" : "Endpoints"}
          </button>
        </div>
      </div>

      {open && (
        <ul className="mt-3 space-y-1 border-t border-slate-200 pt-3 dark:border-slate-800">
          {routes.map((route) => (
            <li key={`${route.method} ${route.path}`} className="flex flex-wrap items-baseline gap-2 text-xs">
              <span className="w-16 shrink-0 font-mono font-semibold text-slate-500">{route.method}</span>
              <span className="min-w-0 flex-1 truncate font-mono">/{route.path}</span>
              <span className={route.roles === null ? "text-amber-600" : "text-slate-500"}>
                {/* Never rendered as "no access": a route with no @Roles is
                    one everybody can reach. */}
                {route.roles === null
                  ? "everyone signed in"
                  : route.roles.map((name) => ROLE_LABEL[name]).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
