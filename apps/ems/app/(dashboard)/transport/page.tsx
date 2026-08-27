"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useCanAuthor } from "@/lib/use-can-author";
import { useStudents } from "@/lib/use-students";
import {
  DIRECTION_LABEL,
  formatMinute,
  parseMinute,
  useAddRoute,
  useAddVehicle,
  useAssign,
  useRoutes,
  useSetStops,
  useUnassign,
  useVehicles,
  type Route,
  type TransportDirection,
} from "@/lib/use-transport";

/**
 * Buses, the runs they do, and who is on them.
 *
 * The two numbers that matter are the morning and afternoon counts, and they
 * are separate on purpose: a bus with thirty seats doing two runs carries
 * thirty children each time, not thirty in total. Showing one combined figure
 * would refuse half a school a seat that exists.
 */
export default function TransportPage() {
  const isStaff = useCanAuthor();
  const { data: routes, isLoading } = useRoutes();

  if (!isStaff) return <FamilyView />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transport</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Routes, stops and who rides. Morning and afternoon are counted separately — a bus doing both runs
          carries its seats twice.
        </p>
      </div>

      <Setup />

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {routes?.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">No routes yet.</p>
      )}

      <div className="space-y-3">
        {routes?.map((route) => (
          <RouteCard key={route.id} route={route} />
        ))}
      </div>
    </div>
  );
}

function Setup() {
  const { data: vehicles } = useVehicles();
  const addVehicle = useAddVehicle();
  const addRoute = useAddRoute();
  const [vehicle, setVehicle] = useState({ label: "", seats: "30", driverName: "" });
  const [route, setRoute] = useState({ name: "", vehicleId: "" });
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setNote(null);
          try {
            await addVehicle.mutateAsync({
              label: vehicle.label.trim(),
              seats: Number(vehicle.seats) || 0,
              driverName: vehicle.driverName.trim() || undefined,
            });
            setVehicle({ label: "", seats: "30", driverName: "" });
          } catch (err) {
            setNote(err instanceof ApiError ? err.message : "Could not add that bus");
          }
        }}
        className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add a bus</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={vehicle.label}
            onChange={(event) => setVehicle({ ...vehicle, label: event.target.value })}
            required
            placeholder="Bus 1"
            aria-label="Bus name"
            className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <label className="text-xs text-slate-500">
            Seats {/* per run, not per day */}
            <input
              type="number"
              min={0}
              value={vehicle.seats}
              onChange={(event) => setVehicle({ ...vehicle, seats: event.target.value })}
              aria-label="Seats per run"
              className="mt-1 block w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <input
            value={vehicle.driverName}
            onChange={(event) => setVehicle({ ...vehicle, driverName: event.target.value })}
            placeholder="Driver"
            aria-label="Driver name"
            className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            disabled={addVehicle.isPending || !vehicle.label.trim()}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </form>

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setNote(null);
          try {
            await addRoute.mutateAsync({
              name: route.name.trim(),
              vehicleId: route.vehicleId || undefined,
            });
            setRoute({ name: "", vehicleId: "" });
          } catch (err) {
            setNote(err instanceof ApiError ? err.message : "Could not add that route");
          }
        }}
        className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add a route</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={route.name}
            onChange={(event) => setRoute({ ...route, name: event.target.value })}
            required
            placeholder="Ikeja run"
            aria-label="Route name"
            className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <select
            value={route.vehicleId}
            onChange={(event) => setRoute({ ...route, vehicleId: event.target.value })}
            aria-label="Bus"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">No bus yet</option>
            {vehicles?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} ({v.seats} seats)
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={addRoute.isPending || !route.name.trim()}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {note && <p className="mt-2 text-xs text-red-600">{note}</p>}
      </form>
    </div>
  );
}

function RouteCard({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{route.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {route.vehicle
              ? `${route.vehicle.label} · ${route.seats} seats${route.vehicle.driverName ? ` · ${route.vehicle.driverName}` : ""}`
              : "No bus on this route yet"}
          </p>
          {/* Two figures, never one. */}
          <p className="mt-1 text-xs tabular-nums text-slate-500">
            Morning {route.taken.morning}/{route.seats} · Afternoon {route.taken.afternoon}/{route.seats}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-700"
        >
          {open ? "Close" : "Manage"}
        </button>
      </div>

      {/* Reported, not corrected: only the school knows whether the time is
          wrong or the order is. */}
      {route.stopWarnings.map((warning) => (
        <p
          key={warning}
          className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        >
          {warning}
        </p>
      ))}

      {open && <RouteDetail route={route} />}
    </section>
  );
}

function RouteDetail({ route }: { route: Route }) {
  const { data: students } = useStudents();
  const assign = useAssign();
  const unassign = useUnassign();
  const setStops = useSetStops(route.id);

  const [rows, setRows] = useState(
    route.stops.length > 0
      ? route.stops.map((stop) => ({ name: stop.name, time: formatMinuteInput(stop.pickupMinute) }))
      : [{ name: "", time: "" }],
  );
  const [studentProfileId, setStudentProfileId] = useState("");
  const [direction, setDirection] = useState<TransportDirection>("BOTH");
  const [stopId, setStopId] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const saveStops = async () => {
    setNote(null);
    try {
      await setStops.mutateAsync(
        rows
          .filter((row) => row.name.trim())
          .map((row, index) => {
            const minute = parseMinute(row.time);
            return {
              name: row.name.trim(),
              position: index,
              ...(minute === null ? {} : { pickupMinute: minute }),
            };
          }),
      );
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Could not save those stops");
    }
  };

  const put = async () => {
    setNote(null);
    try {
      await assign.mutateAsync({
        routeId: route.id,
        studentProfileId,
        direction,
        stopId: stopId || undefined,
      });
      setStudentProfileId("");
    } catch (err) {
      // Where "they are already on Route B for that run" and "the morning run
      // is full" surface.
      setNote(err instanceof ApiError ? err.message : "Could not put them on this route");
    }
  };

  return (
    <div className="mt-4 space-y-5 border-t border-slate-200 pt-4 dark:border-slate-800">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stops, in order</p>
        <ul className="mt-2 space-y-2">
          {rows.map((row, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2">
              <span className="w-5 text-xs tabular-nums text-slate-500">{index + 1}.</span>
              <input
                value={row.name}
                onChange={(event) =>
                  setRows(rows.map((r, i) => (i === index ? { ...r, name: event.target.value } : r)))
                }
                placeholder="Stop name"
                aria-label={`Stop ${index + 1} name`}
                className="w-44 rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                value={row.time}
                onChange={(event) =>
                  setRows(rows.map((r, i) => (i === index ? { ...r, time: event.target.value } : r)))
                }
                placeholder="06:30"
                aria-label={`Stop ${index + 1} pickup time`}
                className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => setRows(rows.filter((_, i) => i !== index))}
                className="text-xs text-slate-500 underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setRows([...rows, { name: "", time: "" }])}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-700"
          >
            Add stop
          </button>
          <button
            type="button"
            onClick={saveStops}
            disabled={setStops.isPending}
            className="rounded-lg bg-brand-gradient px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {setStops.isPending ? "Saving…" : "Save stops"}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Leave a time blank if the school has not set one. Blank is not midnight.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Riders</p>
        <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
          {route.assignments.map((assignment) => (
            <li key={assignment.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate text-sm">
                {assignment.studentProfile.user.firstName} {assignment.studentProfile.user.lastName}
                <span className="ml-2 text-xs text-slate-500">
                  {DIRECTION_LABEL[assignment.direction]}
                  {assignment.stop && ` · ${assignment.stop.name}`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => unassign.mutateAsync(assignment.id)}
                disabled={unassign.isPending}
                className="shrink-0 text-xs text-slate-500 underline disabled:opacity-50"
              >
                Take off
              </button>
            </li>
          ))}
          {route.assignments.length === 0 && (
            <li className="py-2 text-sm text-slate-500">Nobody on this route yet.</li>
          )}
        </ul>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <select
            value={studentProfileId}
            onChange={(event) => setStudentProfileId(event.target.value)}
            aria-label="Student"
            className="w-52 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Choose a student…</option>
            {students?.map((student) => (
              <option key={student.id} value={student.id}>
                {student.user.firstName} {student.user.lastName}
              </option>
            ))}
          </select>
          <select
            value={direction}
            onChange={(event) => setDirection(event.target.value as TransportDirection)}
            aria-label="Which runs"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {(Object.keys(DIRECTION_LABEL) as TransportDirection[]).map((value) => (
              <option key={value} value={value}>
                {DIRECTION_LABEL[value]}
              </option>
            ))}
          </select>
          <select
            value={stopId}
            onChange={(event) => setStopId(event.target.value)}
            aria-label="Stop"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">No stop yet</option>
            {route.stops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.name} {formatMinute(stop.pickupMinute)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={put}
            disabled={assign.isPending || !studentProfileId}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {assign.isPending ? "Adding…" : "Add rider"}
          </button>
        </div>
      </div>

      {note && <p className="text-xs text-amber-600">{note}</p>}
    </div>
  );
}

/** A stored minute as something to type back in, or empty when unset. */
function formatMinuteInput(minute: number | null): string {
  if (minute === null) return "";
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** A family reading which bus their child is on. */
function FamilyView() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transport</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Which bus your child rides, where it picks up, and when.
        </p>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Ask the school office to add your child to a route, and their bus and stop will appear here.
      </p>
    </div>
  );
}
