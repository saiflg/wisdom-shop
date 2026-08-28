"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useCanAuthor } from "@/lib/use-can-author";
import { useStudents } from "@/lib/use-students";
import {
  useAddBlock,
  useAddRoom,
  useAllocateBed,
  useHostelBlocks,
  useReleaseBed,
  type HostelBlock,
  type HostelRoom,
} from "@/lib/use-hostel";

/**
 * Boarding houses and who sleeps where.
 *
 * Two things this screen refuses to hide. A child can only have one bed at a
 * time — recorded in two rooms is a child nobody can find at ten at night —
 * and a room holding more children than it has beds is shown as overfull
 * rather than quietly clamped, because somebody in that room has nowhere to
 * sleep and the screen is where that has to surface.
 */
export default function HostelPage() {
  const isStaff = useCanAuthor();
  const { data: blocks, isLoading } = useHostelBlocks();

  if (!isStaff) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Boarding</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Ask the school office about boarding arrangements — where your child sleeps will appear here once
          they have been given a bed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Boarding</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Houses, rooms and beds. A child can only hold one bed at a time, anywhere in the school.
        </p>
      </div>

      <Setup blocks={blocks ?? []} />

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {blocks?.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">No boarding houses yet.</p>
      )}

      <div className="space-y-4">
        {blocks?.map((block) => (
          <BlockCard key={block.id} block={block} />
        ))}
      </div>
    </div>
  );
}

function Setup({ blocks }: { blocks: HostelBlock[] }) {
  const addBlock = useAddBlock();
  const addRoom = useAddRoom();
  const [house, setHouse] = useState({ name: "", wardenName: "" });
  const [room, setRoom] = useState({ blockId: "", name: "", beds: "6" });
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setNote(null);
          try {
            await addBlock.mutateAsync({
              name: house.name.trim(),
              wardenName: house.wardenName.trim() || undefined,
            });
            setHouse({ name: "", wardenName: "" });
          } catch (err) {
            setNote(err instanceof ApiError ? err.message : "Could not add that house");
          }
        }}
        className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add a house</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={house.name}
            onChange={(event) => setHouse({ ...house, name: event.target.value })}
            required
            placeholder="Yellow House"
            aria-label="House name"
            className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            value={house.wardenName}
            onChange={(event) => setHouse({ ...house, wardenName: event.target.value })}
            placeholder="Warden"
            aria-label="Warden name"
            className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            disabled={addBlock.isPending || !house.name.trim()}
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
            await addRoom.mutateAsync({
              blockId: room.blockId,
              name: room.name.trim(),
              beds: Number(room.beds) || 0,
            });
            setRoom({ ...room, name: "" });
          } catch (err) {
            setNote(err instanceof ApiError ? err.message : "Could not add that room");
          }
        }}
        className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add a room</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={room.blockId}
            onChange={(event) => setRoom({ ...room, blockId: event.target.value })}
            required
            aria-label="House"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Choose a house…</option>
            {blocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.name}
              </option>
            ))}
          </select>
          <input
            value={room.name}
            onChange={(event) => setRoom({ ...room, name: event.target.value })}
            required
            placeholder="Room 3"
            aria-label="Room name"
            className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="number"
            min={0}
            value={room.beds}
            onChange={(event) => setRoom({ ...room, beds: event.target.value })}
            aria-label="Beds"
            className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            disabled={addRoom.isPending || !room.blockId || !room.name.trim()}
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

function BlockCard({ block }: { block: HostelBlock }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{block.name}</p>
          <p className="text-xs text-slate-500">
            {block.wardenName ? `Warden ${block.wardenName} · ` : ""}
            {block.occupancy.occupied} of {block.occupancy.beds} beds taken
            {block.occupancy.emptyRooms > 0 &&
              ` · ${block.occupancy.emptyRooms} empty room${block.occupancy.emptyRooms === 1 ? "" : "s"}`}
          </p>
        </div>
        {/* Called out, because somebody in that room has nowhere to sleep. */}
        {block.occupancy.overfullRooms > 0 && (
          <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">
            {block.occupancy.overfullRooms} room{block.occupancy.overfullRooms === 1 ? "" : "s"} overfull
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {block.rooms.map((room) => (
          <RoomRow key={room.id} room={room} />
        ))}
        {block.rooms.length === 0 && <p className="text-sm text-slate-500">No rooms in this house yet.</p>}
      </div>
    </section>
  );
}

function RoomRow({ room }: { room: HostelRoom }) {
  const { data: students } = useStudents();
  const allocate = useAllocateBed();
  const release = useReleaseBed();
  const [open, setOpen] = useState(false);
  const [studentProfileId, setStudentProfileId] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const give = async () => {
    setNote(null);
    try {
      await allocate.mutateAsync({ roomId: room.id, studentProfileId });
      setStudentProfileId("");
    } catch (err) {
      // Where "they already have a bed in Yellow House, Room 3" surfaces.
      setNote(err instanceof ApiError ? err.message : "Could not give them a bed");
    }
  };

  const take = async (allocationId: string, name: string) => {
    setNote(null);
    try {
      const result = await release.mutateAsync(allocationId);
      if (result.alreadyReleased) setNote(`${name} had already been released.`);
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Could not release that bed");
    }
  };

  return (
    <div
      className={`rounded-xl border p-3 ${
        room.overfull ? "border-red-300 dark:border-red-900" : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {room.name}
          <span className="ml-2 text-xs tabular-nums font-normal text-slate-500">
            {room.taken}/{room.beds} beds
          </span>
          {room.overfull && (
            <span className="ml-2 text-xs font-normal text-red-600">
              more children than beds
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-700"
        >
          {open ? "Close" : "Who is in here"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {room.allocations.map((allocation) => {
              const name = `${allocation.studentProfile.user.firstName} ${allocation.studentProfile.user.lastName}`;
              return (
                <li key={allocation.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate text-sm">
                    {name}
                    <span className="ml-2 text-xs text-slate-500">
                      {allocation.nights} night{allocation.nights === 1 ? "" : "s"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => take(allocation.id, name)}
                    disabled={release.isPending}
                    className="shrink-0 text-xs text-slate-500 underline disabled:opacity-50"
                  >
                    Release bed
                  </button>
                </li>
              );
            })}
            {room.allocations.length === 0 && (
              <li className="py-2 text-sm text-slate-500">Nobody in this room.</li>
            )}
          </ul>

          <div className="flex flex-wrap items-end gap-2">
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
            <button
              type="button"
              onClick={give}
              disabled={allocate.isPending || !studentProfileId || room.free === 0}
              className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {allocate.isPending ? "Adding…" : "Give a bed"}
            </button>
            {room.free === 0 && <span className="text-xs text-slate-500">No free beds in this room.</span>}
          </div>

          {note && <p className="text-xs text-amber-600">{note}</p>}
        </div>
      )}
    </div>
  );
}
