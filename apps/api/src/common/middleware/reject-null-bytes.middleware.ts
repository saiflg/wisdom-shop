import { BadRequestException, Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

/**
 * Rejects request URLs containing a NUL byte.
 *
 * Postgres cannot store `0x00` in a text column and errors at the driver, so
 * `GET /v1/products/%00` produced a 500 with a Prisma stack trace in the logs.
 * Nothing leaked to the caller — the response was the generic "Internal server
 * error" — but a malformed path is the client's mistake, not the server's, and
 * answering it with a 500 both misreports the fault and lets anyone fill the
 * error log at will.
 *
 * Checked at the edge rather than per-parameter: every route with a string
 * path parameter has the same problem, and a validator on each one is a rule
 * that only holds until somebody adds the next route.
 */
@Injectable()
export class RejectNullBytesMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    // req.url is still percent-encoded here, so cover both the raw byte and
    // its encoded form rather than relying on decode order.
    if (req.url.includes("\0") || /%00/i.test(req.url)) {
      throw new BadRequestException("Request URL contains an invalid character");
    }
    next();
  }
}
