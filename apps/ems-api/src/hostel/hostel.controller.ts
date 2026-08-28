import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { HostelService } from "./hostel.service";
import { CreateBlockDto } from "./dto/create-block.dto";
import { CreateRoomDto } from "./dto/create-room.dto";
import { AllocateDto } from "./dto/allocate.dto";
import { ReleaseDto } from "./dto/release.dto";

@ApiTags("hostel")
@ApiBearerAuth()
@Controller("hostel")
export class HostelController {
  constructor(private readonly hostel: HostelService) {}

  @Get("blocks")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Boarding houses, rooms, and who is in a bed tonight",
    description: "A room holding more children than it has beds is reported as overfull rather than hidden.",
  })
  blocks() {
    return this.hostel.blocks();
  }

  @Post("blocks")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Add a boarding house" })
  addBlock(@Body() dto: CreateBlockDto) {
    return this.hostel.addBlock(dto);
  }

  @Post("rooms")
  @Roles("SCHOOL_ADMIN")
  @ApiOperation({ summary: "Add a room" })
  addRoom(@Body() dto: CreateRoomDto) {
    return this.hostel.addRoom(dto);
  }

  @Post("allocations")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Give a child a bed",
    description:
      "Refused if they already have an open bed elsewhere — that is a child nobody can find at night, and " +
      "it is checked before capacity.",
  })
  allocate(@Body() dto: AllocateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.hostel.allocate(dto, user);
  }

  @Post("allocations/:id/release")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Give a bed up",
    description: "Releasing one that is already released is not an error; it comes back marked as such.",
  })
  release(@Param("id") id: string, @Body() dto: ReleaseDto) {
    return this.hostel.release(id, dto);
  }

  // Widened to families: where their child sleeps is theirs to know. The
  // service 404s for anybody else's child.
  @Get("students/:studentProfileId")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiOperation({
    summary: "Where a child has slept, most recent first",
    description: "A family asking after another child gets a 404, not a 403.",
  })
  forStudent(@Param("studentProfileId") studentProfileId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.hostel.forStudent(studentProfileId, user);
  }
}
