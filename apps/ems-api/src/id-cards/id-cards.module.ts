import { Module } from "@nestjs/common";
import { StorageModule } from "@/storage/storage.module";
import { SchoolProfileModule } from "@/school-profile/school-profile.module";
import { IdCardsController } from "./id-cards.controller";
import { IdCardsService } from "./id-cards.service";

@Module({
  imports: [StorageModule, SchoolProfileModule],
  controllers: [IdCardsController],
  providers: [IdCardsService],
  exports: [IdCardsService],
})
export class IdCardsModule {}
