import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { TransportService } from "./transport.service";
import { CreateVehicleDto } from "./dto/create-vehicle.dto";
import { CreateRouteDto } from "./dto/create-route.dto";
import { UpsertStopsDto } from "./dto/upsert-stops.dto";
import { AssignDto } from "./dto/assign.dto";

@ApiTags("transport")
@ApiBearerAuth()
@Controller("transport")
export class TransportController {
  constructor(private readonly transport: TransportService) {}

  @Get("vehicles")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "The buses" })
  vehicles() {
    return this.transport.vehicles();
  }

  @Post("vehicles")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Add a bus" })
  addVehicle(@Body() dto: CreateVehicleDto) {
    return this.transport.addVehicle(dto);
  }

  @Get("routes")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "The routes, with how full each run is",
    description:
      "Morning and afternoon are counted separately: a bus with thirty seats doing two runs carries thirty " +
      "children each time, not thirty in total.",
  })
  routes() {
    return this.transport.routes();
  }

  @Post("routes")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Add a route" })
  addRoute(@Body() dto: CreateRouteDto) {
    return this.transport.addRoute(dto);
  }

  // PUT: the body is the whole run, so sending it twice leaves the same
  // stops. Positions only mean anything as a set.
  @Put("routes/:id/stops")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Set the stops along a route" })
  setStops(@Param("id") id: string, @Body() dto: UpsertStopsDto) {
    return this.transport.setStops(id, dto);
  }

  @Post("assignments")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Put a child on a route",
    description:
      "Refused if they are already on another route for the same run — that is a child nobody is waiting " +
      "for at one of two gates, and it is checked before capacity.",
  })
  assign(@Body() dto: AssignDto) {
    return this.transport.assign(dto);
  }

  @Delete("assignments/:id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Take a child off a route" })
  unassign(@Param("id") id: string) {
    return this.transport.unassign(id);
  }

  // Widened to families: knowing which bus their child is on, and when it
  // reaches their stop, is the whole reason a parent opens this. The service
  // 404s for anybody else's child.
  @Get("students/:studentProfileId")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiOperation({
    summary: "One child's bus, stop and pickup time",
    description: "A family asking after another child gets a 404, not a 403.",
  })
  forStudent(@Param("studentProfileId") studentProfileId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.transport.forStudent(studentProfileId, user);
  }
}
