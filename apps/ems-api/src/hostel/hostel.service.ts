import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { CreateBlockDto } from "./dto/create-block.dto";
import type { CreateRoomDto } from "./dto/create-room.dto";
import type { AllocateDto } from "./dto/allocate.dto";
import type { ReleaseDto } from "./dto/release.dto";
import {
  allocateProblem,
  bedsFree,
  bedsTaken,
  dayOf,
  nightsStayed,
  releaseProblem,
  summariseOccupancy,
} from "./hostel-rules";

const STAFF_ROLES = ["SCHOOL_ADMIN", "TEACHER"];

@Injectable()
export class HostelService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async addBlock(dto: CreateBlockDto) {
    const client = await this.tenantPrisma.getClient();
    return client.hostelBlock.create({
      data: { name: dto.name.trim(), wardenName: dto.wardenName?.trim() || null },
    });
  }

  async addRoom(dto: CreateRoomDto) {
    const client = await this.tenantPrisma.getClient();
    const block = await client.hostelBlock.findFirst({ where: { id: dto.blockId, deletedAt: null } });
    if (!block) throw new NotFoundException("No boarding house found with that id");

    return client.hostelRoom.create({
      data: { blockId: dto.blockId, name: dto.name.trim(), beds: dto.beds ?? 0 },
    });
  }

  /**
   * The houses, their rooms, and who is in a bed tonight.
   *
   * Only open allocations are loaded for the counts. History is real and kept,
   * but "who is in this room" is a question about now, and pulling every child
   * who has ever slept there would make a room of four look like a room of
   * forty by the end of the year.
   */
  async blocks() {
    const client = await this.tenantPrisma.getClient();
    const today = new Date();

    const blocks = await client.hostelBlock.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        rooms: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          include: {
            allocations: {
              where: { releasedOn: null },
              include: {
                studentProfile: {
                  select: { id: true, user: { select: { firstName: true, lastName: true } } },
                },
              },
            },
          },
        },
      },
    });

    return blocks.map((block) => ({
      ...block,
      rooms: block.rooms.map((room) => ({
        ...room,
        taken: bedsTaken(room.allocations),
        free: bedsFree(room),
        // Reported, not made impossible: beds can be edited down while
        // children are still in the room.
        overfull: bedsTaken(room.allocations) > room.beds,
        allocations: room.allocations.map((allocation) => ({
          ...allocation,
          nights: nightsStayed(allocation.allocatedOn, allocation.releasedOn, today),
        })),
      })),
      occupancy: summariseOccupancy(block.rooms),
    }));
  }

  /**
   * Give a child a bed.
   *
   * The check the service contributes is the one the pure function cannot do
   * for itself: whether this child already has an open bed somewhere else in
   * the school. That is refused before capacity, because two rooms is a child
   * nobody can find at night, and a full room is only an inconvenience.
   */
  async allocate(dto: AllocateDto, actor: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const room = await client.hostelRoom.findFirst({
      where: { id: dto.roomId, deletedAt: null },
      include: { block: { select: { name: true } }, allocations: { where: { releasedOn: null } } },
    });
    if (!room) throw new NotFoundException("No room found with that id");

    const student = await client.studentProfile.findFirst({ where: { id: dto.studentProfileId } });
    if (!student) throw new NotFoundException("No student found with that id");

    const openElsewhere = await client.hostelAllocation.findFirst({
      where: { studentProfileId: dto.studentProfileId, releasedOn: null },
      include: { room: { select: { id: true, name: true, block: { select: { name: true } } } } },
    });

    const problem = allocateProblem({
      bedsFree: bedsFree(room),
      currentRoom: openElsewhere
        ? `${openElsewhere.room.block.name}, ${openElsewhere.room.name}`
        : null,
      sameRoom: openElsewhere?.room.id === dto.roomId,
    });
    if (problem) throw new BadRequestException(problem);

    try {
      return await client.hostelAllocation.create({
        data: {
          roomId: dto.roomId,
          studentProfileId: dto.studentProfileId,
          allocatedOn: dayOf(dto.allocatedOn ? new Date(dto.allocatedOn) : new Date()),
          note: dto.note?.trim() || null,
          allocatedByUserId: actor.id,
          allocatedByName: await this.nameOf(actor.id),
        },
      });
    } catch (error) {
      // Two clerks at the same moment. The partial unique index decides.
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictException("That child already has a bed somewhere");
      }
      throw error;
    }
  }

  /**
   * Give a bed up.
   *
   * Releasing something already released is not an error worth throwing at
   * somebody clearing a dormitory at the end of term — it is the second time
   * down the same list.
   */
  async release(allocationId: string, dto: ReleaseDto) {
    const client = await this.tenantPrisma.getClient();
    const allocation = await client.hostelAllocation.findUnique({ where: { id: allocationId } });
    if (!allocation) throw new NotFoundException("No allocation found with that id");
    if (allocation.releasedOn) return { allocation, alreadyReleased: true };

    const releasedOn = dayOf(dto.releasedOn ? new Date(dto.releasedOn) : new Date());
    const problem = releaseProblem(allocation.allocatedOn, releasedOn);
    if (problem) throw new BadRequestException(problem);

    const updated = await client.hostelAllocation.update({
      where: { id: allocationId },
      data: { releasedOn },
    });
    return { allocation: updated, alreadyReleased: false };
  }

  /**
   * Where a child has slept, most recent first.
   *
   * A family may read their own child's and gets a 404 for anybody else's —
   * the same shape fees, wallets, behaviour and transport use.
   */
  async forStudent(studentProfileId: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const isStaff = viewer.roles.some((role) => STAFF_ROLES.includes(role));

    if (!isStaff) {
      const visible = await this.visibleStudentIds(viewer);
      if (!visible.has(studentProfileId)) throw new NotFoundException("No student found with that id");
    }

    const today = new Date();
    const allocations = await client.hostelAllocation.findMany({
      where: { studentProfileId },
      orderBy: { allocatedOn: "desc" },
      include: { room: { select: { name: true, block: { select: { name: true, wardenName: true } } } } },
    });

    return allocations.map((allocation) => ({
      ...allocation,
      nights: nightsStayed(allocation.allocatedOn, allocation.releasedOn, today),
      current: allocation.releasedOn === null,
    }));
  }

  private async visibleStudentIds(viewer: AuthenticatedUser): Promise<Set<string>> {
    const client = await this.tenantPrisma.getClient();
    if (viewer.roles.includes("GUARDIAN")) {
      const links = await client.guardianLink.findMany({
        where: { guardianUserId: viewer.id },
        select: { studentProfileId: true },
      });
      return new Set(links.map((link) => link.studentProfileId));
    }
    const own = await client.studentProfile.findUnique({
      where: { userId: viewer.id },
      select: { id: true },
    });
    return new Set(own ? [own.id] : []);
  }

  private async nameOf(userId: string): Promise<string> {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown";
  }
}
