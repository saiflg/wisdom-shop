import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { runWithTenantContext } from "./tenant-context";

/**
 * What the school-user JWT strategy attaches to `req.user` — matches
 * `AuthenticatedUser` in auth/interfaces/jwt-payload.interface.ts (`id`,
 * not the JWT payload's own `sub` claim — AccessTokenStrategy.validate()
 * remaps it before Passport ever sets req.user).
 */
interface TenantRequestUser {
  id: string;
  schoolId: string;
  schoolSlug: string;
}

function isTenantRequestUser(user: unknown): user is TenantRequestUser {
  return (
    typeof user === "object" &&
    user !== null &&
    typeof (user as TenantRequestUser).id === "string" &&
    typeof (user as TenantRequestUser).schoolId === "string" &&
    typeof (user as TenantRequestUser).schoolSlug === "string"
  );
}

/**
 * Populates TenantContext from the authenticated user, ahead of the
 * handler. Registered as a global APP_INTERCEPTOR (not middleware) — the
 * interceptor stage runs after guards, so JwtAuthGuard has already set
 * `req.user` by the time this reads it. Platform routes (whose JWT payload
 * has no schoolId) pass through untouched.
 *
 * `next.handle()` is lazy — it only actually invokes the controller when
 * something subscribes to the Observable it returns, not when it's called.
 * `als.run(ctx, fn)` only propagates its context to work *synchronously
 * started inside `fn`* (and that work's own continuations) — so calling
 * `next.handle()` outside a `.run()` callback, then subscribing later,
 * would run the controller with NO tenant context at all. The subscribe
 * call itself must happen inside `.run()`, which is what forces the actual
 * controller invocation (and everything it awaits) to inherit the context.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: unknown }>();

    if (!isTenantRequestUser(req.user)) {
      return next.handle();
    }

    const { id, schoolId, schoolSlug } = req.user;

    return new Observable((subscriber) => {
      runWithTenantContext({ userId: id, schoolId, schoolSlug }, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (error) => subscriber.error(error),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
