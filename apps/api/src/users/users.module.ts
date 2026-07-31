import { Module } from "@nestjs/common";
import { UsersService } from "./users.service";
import { AdminUsersController } from "./users.controller";

@Module({
  controllers: [AdminUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
