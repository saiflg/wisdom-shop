import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContextValue {
  schoolId: string;
  schoolSlug: string;
  userId: string;
}

/**
 * Carries the current request's tenant identity across `await` boundaries
 * without threading it through every function signature.
 *
 * Populated by TenantContextInterceptor (an APP_INTERCEPTOR, not
 * middleware — interceptors run after guards, so req.user is already set
 * by the JWT strategy by the time this fires). Read by TenantPrismaService
 * to resolve which school's database a request should hit.
 *
 * Deliberately NOT a Nest REQUEST-scoped provider: that would make every
 * controller/service depending on it request-scoped too (Nest's DI-subtree
 * contagion rule), re-instantiating the whole dependency graph per request.
 * AsyncLocalStorage keeps everything a plain singleton.
 */
const storage = new AsyncLocalStorage<TenantContextValue>();

export function runWithTenantContext<T>(context: TenantContextValue, fn: () => T): T {
  return storage.run(context, fn);
}

export function getTenantContext(): TenantContextValue | undefined {
  return storage.getStore();
}
