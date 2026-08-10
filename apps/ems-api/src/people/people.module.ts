import { Module } from "@nestjs/common";
import { StorageModule } from "@/storage/storage.module";
import { PeopleController } from "./people.controller";
import { PeopleService } from "./people.service";

@Module({
  imports: [StorageModule],
  controllers: [PeopleController],
  providers: [PeopleService],
})
export class PeopleModule {}
