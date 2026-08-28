export interface AllocationLike {
  releasedOn: Date | null;
}

export interface RoomLike {
  beds: number;
  allocations: AllocationLike[];
}

/**
 * Midnight UTC, matching leave, staff attendance and the library.
 *
 * A bed is allocated for nights, not moments. Comparing raw timestamps would
 * make a child moved in at 4pm occupy a bed for a different length of time
 * than one moved in at 9am on the same day.
 */
export function dayOf(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** Beds with somebody in them right now. */
export function bedsTaken(allocations: AllocationLike[]): number {
  return allocations.filter((allocation) => allocation.releasedOn === null).length;
}

/**
 * Beds still free in a room.
 *
 * Clamped at zero, like the library's copies. If the bed count is edited down
 * while children are in the room, "none free" is the honest answer; a
 * negative would read as a shortage nobody can act on.
 */
export function bedsFree(room: RoomLike): number {
  return Math.max(0, Math.max(0, room.beds) - bedsTaken(room.allocations));
}

export interface AllocateCheck {
  bedsFree: number;
  /** The room this child is already in, if any — anywhere in the school. */
  currentRoom: string | null;
  /** Whether that room is this one. */
  sameRoom: boolean;
}

/**
 * Why this child cannot be given a bed here, or null.
 *
 * The check that comes first is not capacity. A child recorded in two rooms
 * at once is not an overbooked dormitory — it is a child who cannot be found
 * at ten at night, because the list says one place and they are in another.
 * A full room is an inconvenience; two rooms is a missing child.
 */
export function allocateProblem(check: AllocateCheck): string | null {
  if (check.sameRoom) return "They already have a bed in this room";
  if (check.currentRoom) {
    return `They already have a bed in ${check.currentRoom}. Release it first.`;
  }
  if (check.bedsFree <= 0) return "Every bed in that room is taken";
  return null;
}

/**
 * Why this bed cannot be released on this date, or null.
 *
 * A release before the allocation would produce a negative stay, and every
 * report that counts nights would then be quietly wrong for that child.
 */
export function releaseProblem(allocatedOn: Date, releasedOn: Date): string | null {
  if (Number.isNaN(releasedOn.getTime())) return "That is not a date";
  if (dayOf(releasedOn).getTime() < dayOf(allocatedOn).getTime()) {
    return "A bed cannot be given up before it was taken";
  }
  return null;
}

/** Nights slept, both ends counted the way a bursar counts them. */
export function nightsStayed(allocatedOn: Date, releasedOn: Date | null, today: Date): number {
  const start = dayOf(allocatedOn).getTime();
  const end = dayOf(releasedOn ?? today).getTime();
  if (end <= start) return 0;
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

export interface OccupancySummary {
  rooms: number;
  beds: number;
  occupied: number;
  free: number;
  /** Rooms with nobody in them at all — the ones an admin is looking for. */
  emptyRooms: number;
  /** Rooms holding more children than they have beds. */
  overfullRooms: number;
}

/**
 * What a block adds up to.
 *
 * `overfullRooms` is reported rather than being impossible, because the bed
 * count can be edited down after children are already in a room. That is a
 * real situation a school gets into, and silently clamping it would hide the
 * fact that somebody has nowhere to sleep.
 */
export function summariseOccupancy(rooms: RoomLike[]): OccupancySummary {
  let beds = 0;
  let occupied = 0;
  let emptyRooms = 0;
  let overfullRooms = 0;

  for (const room of rooms) {
    const owned = Math.max(0, room.beds);
    const taken = bedsTaken(room.allocations);
    beds += owned;
    occupied += taken;
    if (taken === 0) emptyRooms += 1;
    if (taken > owned) overfullRooms += 1;
  }

  return {
    rooms: rooms.length,
    beds,
    occupied,
    free: Math.max(0, beds - occupied),
    emptyRooms,
    overfullRooms,
  };
}
