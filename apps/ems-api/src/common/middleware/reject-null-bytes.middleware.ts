import { BadRequestException, Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

/**
 * Rejects request URLs containing a NUL byte.
 *
 * Postgres cannot store `0x00` in a text column and errors at the driver.
 * Checked at the edge rather than per-parameter, same reasoning as the
 * shop's copy of this middleware (apps/api).
 */
@Injectable()
export class RejectNullBytesMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (req.url.includes("\0") || /%00/i.test(req.url)) {
      throw new BadRequestException("Request URL contains an invalid character");
    }
    next();
  }
}
