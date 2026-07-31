import { Module, type ExecutionContext } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { validateEnv, type EnvConfig } from "./config/env.validation";
import { STRICT_RATE_LIMIT_KEY } from "./auth/decorators/strict-rate-limit.decorator";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { AuditLogModule } from "./common/audit/audit-log.module";
import { MailerModule } from "./common/mailer/mailer.module";
import { EncryptionModule } from "./common/crypto/encryption.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { RolesGuard } from "./auth/guards/roles.guard";
import { CategoriesModule } from "./catalog/categories/categories.module";
import { ProductsModule } from "./catalog/products/products.module";
import { CartModule } from "./cart/cart.module";
import { AddressesModule } from "./addresses/addresses.module";
import { OrdersModule } from "./orders/orders.module";
import { PaymentsModule } from "./payments/payments.module";
import { VendorsModule } from "./vendors/vendors.module";
import { LicensesModule } from "./licenses/licenses.module";
import { UsersModule } from "./users/users.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { SettingsModule } from "./settings/settings.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: [".env"],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => {
        // A named throttler applies to every route by default, so the strict
        // bucket opts *out* of everything that isn't marked. Reflector is a
        // plain metadata reader, safe to construct here.
        const reflector = new Reflector();
        return [
          {
            name: "default",
            ttl: config.get("RATE_LIMIT_TTL_MS", { infer: true }),
            limit: config.get("RATE_LIMIT_LIMIT", { infer: true }),
          },
          {
            name: "auth",
            ttl: config.get("AUTH_RATE_LIMIT_TTL_MS", { infer: true }),
            limit: config.get("AUTH_RATE_LIMIT_LIMIT", { infer: true }),
            skipIf: (context: ExecutionContext) =>
              reflector.getAllAndOverride<boolean>(STRICT_RATE_LIMIT_KEY, [
                context.getHandler(),
                context.getClass(),
              ]) !== true,
          },
        ];
      },
    }),
    PrismaModule,
    AuditLogModule,
    EncryptionModule,
    // Depends on Prisma, AuditLog and Encryption, so it is listed after them;
    // MailerModule and PaymentsModule in turn read their configuration from
    // this one.
    SettingsModule,
    MailerModule,
    HealthModule,
    AuthModule,
    CategoriesModule,
    ProductsModule,
    CartModule,
    AddressesModule,
    OrdersModule,
    PaymentsModule,
    VendorsModule,
    LicensesModule,
    UsersModule,
    AnalyticsModule,
  ],
  providers: [
    // Order matters: throttling first, then auth (populates req.user),
    // then role checks (reads req.user).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
