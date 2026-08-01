import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedPlatformUser } from "../interfaces/platform-jwt-payload.interface";
import type { RequestWithPlatformUser } from "../interfaces/platform-request.interface";

export const CurrentPlatformUser = createParamDecorator(
  (data: keyof AuthenticatedPlatformUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithPlatformUser>();
    return data ? request.user[data] : request.user;
  },
);
