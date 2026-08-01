import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PlatformAuthController } from "./platform-auth.controller";
import { PlatformAuthService } from "./platform-auth.service";
import { PlatformAccessTokenStrategy } from "./strategies/platform-access-token.strategy";
import { PlatformRefreshTokenStrategy } from "./strategies/platform-refresh-token.strategy";

@Module({
  imports: [JwtModule.register({})],
  controllers: [PlatformAuthController],
  providers: [PlatformAuthService, PlatformAccessTokenStrategy, PlatformRefreshTokenStrategy],
  exports: [PlatformAuthService],
})
export class PlatformAuthModule {}
