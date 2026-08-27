import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { CreateVehicleDto } from "./dto/create-vehicle.dto";
import type { CreateRouteDto } from "./dto/create-route.dto";
import type { UpsertStopsDto } from "./dto/upsert-stops.dto";
import type { AssignDto } from "./dto/assign.dto";
import {
  assignProblem,
  orderStops,
  seatsByDirection,
  stopsOutOfOrder,
  validatePickupMinute,
  type TransportDirection,
} from "./transport-rules";

const STAFF_ROLES = ["SCHOOL_ADMIN", "TEACHER"];

/** Do two directions share a run? BOTH shares with everything. */
function clashes(a: TransportDirection, b: TransportDirection): boolean {
  return a === "BOTH" || b === "BOTH" || a === b;
}

@Injectable()
export class TransportService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async addVehicle(dto: CreateVehicleDto) {
    const client = await this.tenantPrisma.getClient();
    return client.transportVehicle.create({
      data: {
        label: dto.label.trim(),
        plateNumber: dto.plateNumber?.trim() || null,
        seats: dto.seats ?? 0,
        driverName: dto.driverName?.trim() || null,
        driverPhone: dto.driverPhone?.trim() || null,
      },
    });
  }

  async vehicles() {
    const client = await this.tenantPrisma.getClient();
    return client.transportVehicle.findMany({ where: { deletedAt: null }, orderBy: { label: "asc" } });
  }

  async addRoute(dto: CreateRouteDto) {
    const client = await this.tenantPrisma.getClient();
    return client.transportRoute.create({
      data: { name: dto.name.trim(), vehicleId: dto.vehicleId ?? null },
    });
  }

  /**
   * The routes, with how full each run is and anything wrong with the stops.
   *
   * `seatsByDirection` is the same function the assignment check uses, so the
   * number on the screen and the number that refuses a child are one thing.
   */
  async routes() {
    const client = await this.tenantPrisma.getClient();
    const routes = await client.transportRoute.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        vehicle: true,
        stops: true,
        assignments: {
          include: {
            studentProfile: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
            stop: { select: { id: true, name: true } },
          },
        },
      },
    });

    return routes.map((route) => ({
      ...route,
      stops: orderStops(route.stops),
      seats: route.vehicle?.seats ?? 0,
      taken: seatsByDirection(route.assignments),
      // Reported, never corrected: only the school knows whether the time is
      // wrong or the order is.
      stopWarnings: stopsOutOfOrder(route.stops),
    }));
  }

  /**
   * Replace a route's stops.
   *
   * Wholesale rather than one at a time, because positions are only
   * meaningful as a set — renumbering one stop without the others is how a
   * route ends up with two third stops.
   */
  async setStops(routeId: string, dto: UpsertStopsDto) {
    const client = await this.tenantPrisma.getClient();
    const route = await client.transportRoute.findFirst({ where: { id: routeId, deletedAt: null } });
    if (!route) throw new NotFoundException("No route found with that id");

    for (const stop of dto.stops) {
      const problem = validatePickupMinute(stop.pickupMinute);
      if (problem) throw new BadRequestException(`${stop.name}: ${problem}`);
    }

    await client.$transaction([
      client.transportStop.deleteMany({ where: { routeId } }),
      client.transportStop.createMany({
        data: dto.stops.map((stop, index) => ({
          routeId,
          name: stop.name.trim(),
          position: stop.position ?? index,
          pickupMinute: stop.pickupMinute ?? null,
        })),
      }),
    ]);

    return this.route(routeId);
  }

  async route(routeId: string) {
    const routes = await this.routes();
    const route = routes.find((candidate) => candidate.id === routeId);
    if (!route) throw new NotFoundException("No route found with that id");
    return route;
  }

  /**
   * Put a child on a route.
   *
   * The decision is `assignProblem`. What this method contributes is the one
   * fact that function cannot work out for itself: whether the child is
   * already on a DIFFERENT route for the same run — which matters more than
   * capacity, because it means somebody is waiting at a gate the child will
   * never reach.
   */
  async assign(dto: AssignDto) {
    const client = await this.tenantPrisma.getClient();

    const route = await client.transportRoute.findFirst({
      where: { id: dto.routeId, deletedAt: null },
      include: { vehicle: true, assignments: true },
    });
    if (!route) throw new NotFoundException("No route found with that id");

    const student = await client.studentProfile.findFirst({ where: { id: dto.studentProfileId } });
    if (!student) throw new NotFoundException("No student found with that id");

    const elsewhere = await client.transportAssignment.findMany({
      where: { studentProfileId: dto.studentProfileId, routeId: { not: dto.routeId } },
      include: { route: { select: { name: true, deletedAt: true } } },
    });
    const clash = elsewhere.find(
      (assignment) => !assignment.route.deletedAt && clashes(assignment.direction, dto.direction),
    );

    const problem = assignProblem({
      seats: route.vehicle?.seats ?? 0,
      existing: route.assignments,
      direction: dto.direction,
      alreadyOnThisRoute: route.assignments.some((a) => a.studentProfileId === dto.studentProfileId),
      clashingRoute: clash?.route.name ?? null,
    });
    if (problem) throw new BadRequestException(problem);

    try {
      return await client.transportAssignment.create({
        data: {
          routeId: dto.routeId,
          studentProfileId: dto.studentProfileId,
          stopId: dto.stopId ?? null,
          direction: dto.direction,
        },
      });
    } catch (error) {
      // A double-click, or two clerks at once. The index decides.
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictException("They are already on this route");
      }
      throw error;
    }
  }

  async unassign(assignmentId: string) {
    const client = await this.tenantPrisma.getClient();
    const assignment = await client.transportAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException("No assignment found with that id");
    await client.transportAssignment.delete({ where: { id: assignmentId } });
  }

  /** One child's transport, for a family to read. */
  async forStudent(studentProfileId: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const isStaff = viewer.roles.some((role) => STAFF_ROLES.includes(role));

    if (!isStaff) {
      const visible = await this.visibleStudentIds(viewer);
      // 404, as everywhere else: 403 would confirm the child exists here.
      if (!visible.has(studentProfileId)) throw new NotFoundException("No student found with that id");
    }

    return client.transportAssignment.findMany({
      where: { studentProfileId, route: { deletedAt: null } },
      include: {
        route: { select: { id: true, name: true, vehicle: { select: { label: true, driverName: true } } } },
        stop: { select: { id: true, name: true, pickupMinute: true } },
      },
    });
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
}
