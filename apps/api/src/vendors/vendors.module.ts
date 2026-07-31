import { Module } from "@nestjs/common";
import { VendorsService } from "./vendors.service";
import {
  AdminVendorsController,
  VendorEarningsController,
  VendorProductsController,
  VendorsController,
} from "./vendors.controller";
import { ProductsModule } from "../catalog/products/products.module";

@Module({
  imports: [ProductsModule],
  controllers: [
    VendorsController,
    VendorProductsController,
    VendorEarningsController,
    AdminVendorsController,
  ],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
