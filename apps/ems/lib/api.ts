export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * The most useful sentence available about a failure.
 *
 * Deliberately duck-typed rather than `error instanceof ApiError`. That check
 * looks equivalent and is not: it fails whenever the thrown object came from a
 * different copy of this module — which is exactly what happened to the salary
 * editor, where the API said "Demo Admin has no employment record yet. Add
 * their staff details before setting a salary." and the screen said "Couldn't
 * load this salary." An administrator reading that would go looking for a bug
 * instead of filling in the form directly above it.
 *
 * A message is a message whoever built it. The fallback is for the genuinely
 * silent failures, which are rare and are the only ones worth a shrug.
 */
export function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Attach the CSRF header required by cookie-authenticated routes (refresh/logout). */
  csrf?: boolean;
}

const CSRF_HEADER = "x-wisdom-campus-csrf";

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, csrf, headers, ...rest } = options;

  const res = await fetch(path, {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { [CSRF_HEADER]: "1" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => undefined);

  if (!res.ok) {
    const rawMessage = data && typeof data === "object" ? (data as { message?: unknown }).message : undefined;
    const message = Array.isArray(rawMessage) ? rawMessage.join(", ") : (rawMessage as string) || res.statusText;
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}
