import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AddressesService } from "./addresses.service";
import { CreateAddressDto } from "./dto/create-address.dto";
import { UpdateAddressDto } from "./dto/update-address.dto";

@ApiTags("addresses")
@ApiBearerAuth()
@Controller("addresses")
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's saved addresses (default first)" })
  list(@CurrentUser("id") userId: string) {
    return this.addresses.list(userId);
  }

  @Get(":id")
  findOne(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.addresses.findOwned(userId, id);
  }

  @Post()
  @ApiOperation({ summary: "Save a new address; the first one saved becomes the default" })
  create(@CurrentUser("id") userId: string, @Body() dto: CreateAddressDto) {
    return this.addresses.create(userId, dto);
  }

  @Patch(":id")
  update(@CurrentUser("id") userId: string, @Param("id") id: string, @Body() dto: UpdateAddressDto) {
    return this.addresses.update(userId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete an address; past orders keep their shipping details" })
  remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.addresses.remove(userId, id);
  }
}
