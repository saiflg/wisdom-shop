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
import { useTranslation } from "@/lib/i18n/i18n-provider";

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
  const { t } = useTranslation();
  const isStaff = useCanAuthor();
  const { data: blocks, isLoading } = useHostelBlocks();

  if (!isStaff) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("hostel.title")}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t("hostel.familyIntro")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("hostel.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("hostel.intro")}
        </p>
      </div>

      <Setup blocks={blocks ?? []} />

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>}
      {blocks?.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("hostel.noHouses")}</p>
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
  const { t } = useTranslation();
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
            setNote(err instanceof ApiError ? err.message : t("hostel.addHouseFailed"));
          }
        }}
        className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("hostel.addHouse")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={house.name}
            onChange={(event) => setHouse({ ...house, name: event.target.value })}
            required
            placeholder={t("hostel.housePlaceholder")}
            aria-label={t("hostel.houseName")}
            className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            value={house.wardenName}
            onChange={(event) => setHouse({ ...house, wardenName: event.target.value })}
            placeholder={t("hostel.wardenPlaceholder")}
            aria-label={t("hostel.wardenName")}
            className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            disabled={addBlock.isPending || !house.name.trim()}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("hostel.add")}
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
            setNote(err instanceof ApiError ? err.message : t("hostel.addRoomFailed"));
          }
        }}
        className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("hostel.addRoom")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={room.blockId}
            onChange={(event) => setRoom({ ...room, blockId: event.target.value })}
            required
            aria-label={t("hostel.house")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">{t("hostel.chooseHouse")}</option>
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
            placeholder={t("hostel.roomPlaceholder")}
            aria-label={t("hostel.roomName")}
            className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="number"
            min={0}
            value={room.beds}
            onChange={(event) => setRoom({ ...room, beds: event.target.value })}
            aria-label={t("hostel.beds")}
            className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            disabled={addRoom.isPending || !room.blockId || !room.name.trim()}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("hostel.add")}
          </button>
        </div>
        {note && <p className="mt-2 text-xs text-red-600">{note}</p>}
      </form>
    </div>
  );
}

function BlockCard({ block }: { block: HostelBlock }) {
  const { t, tPlural } = useTranslation();
  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{block.name}</p>
          <p className="text-xs text-slate-500">
            {block.wardenName ? `Warden ${block.wardenName} · ` : ""}
            {t("hostel.bedsTakenOf", {
              occupied: block.occupancy.occupied,
              beds: block.occupancy.beds,
            })}
            {block.occupancy.emptyRooms > 0 &&
              ` · ${tPlural("hostel.emptyRooms", block.occupancy.emptyRooms)}`}
          </p>
        </div>
        {/* Called out, because somebody in that room has nowhere to sleep. */}
        {block.occupancy.overfullRooms > 0 && (
          <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">
            {tPlural("hostel.overfullRooms", block.occupancy.overfullRooms)}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {block.rooms.map((room) => (
          <RoomRow key={room.id} room={room} />
        ))}
        {block.rooms.length === 0 && <p className="text-sm text-slate-500">{t("hostel.noRooms")}</p>}
      </div>
    </section>
  );
}

function RoomRow({ room }: { room: HostelRoom }) {
  const { t, tPlural } = useTranslation();
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
      setNote(err instanceof ApiError ? err.message : t("hostel.giveBedFailed"));
    }
  };

  const take = async (allocationId: string, name: string) => {
    setNote(null);
    try {
      const result = await release.mutateAsync(allocationId);
      if (result.alreadyReleased) setNote(t("hostel.alreadyReleased", { name }));
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : t("hostel.releaseBedFailed"));
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
          <span className="ms-2 text-xs tabular-nums font-normal text-slate-500">
            {t("hostel.bedsTaken", { taken: room.taken, beds: room.beds })}
          </span>
          {room.overfull && (
            <span className="ms-2 text-xs font-normal text-red-600">
              {t("hostel.overfull")}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-700"
        >
          {open ? t("shared.close") : t("hostel.whoIsInHere")}
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
                    <span className="ms-2 text-xs text-slate-500">
                      {tPlural("hostel.nights", allocation.nights)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => take(allocation.id, name)}
                    disabled={release.isPending}
                    className="shrink-0 text-xs text-slate-500 underline disabled:opacity-50"
                  >
                    {t("hostel.releaseBed")}
                  </button>
                </li>
              );
            })}
            {room.allocations.length === 0 && (
              <li className="py-2 text-sm text-slate-500">{t("hostel.nobodyInRoom")}</li>
            )}
          </ul>

          <div className="flex flex-wrap items-end gap-2">
            <select
              value={studentProfileId}
              onChange={(event) => setStudentProfileId(event.target.value)}
              aria-label={t("shared.student")}
              className="w-52 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">{t("transport.chooseStudent")}</option>
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
              {allocate.isPending ? t("shared.adding") : t("hostel.giveBed")}
            </button>
            {room.free === 0 && <span className="text-xs text-slate-500">{t("hostel.noFreeBeds")}</span>}
          </div>

          {note && <p className="text-xs text-amber-600">{note}</p>}
        </div>
      )}
    </div>
  );
}
