import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class PlatformRefreshGuard extends AuthGuard("jwt-platform-refresh") {}
