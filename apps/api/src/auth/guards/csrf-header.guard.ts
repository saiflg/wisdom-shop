import { Injectable, ForbiddenException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { CSRF_HEADER_NAME } from "../auth.constants";

/** See CSRF_HEADER_NAME for why this is sufficient alongside SameSite=strict. */
@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers[CSRF_HEADER_NAME];
    if (!header) {
      throw new ForbiddenException("Missing CSRF header");
    }
    return true;
  }
}
