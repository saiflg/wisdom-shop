export type WelfareKind = "MEDICAL" | "HARDSHIP" | "BEREAVEMENT" | "LOAN" | "OTHER";
export type WelfareStatus = "REQUESTED" | "APPROVED" | "PAID" | "DECLINED";

export const WELFARE_KINDS: WelfareKind[] = ["MEDICAL", "HARDSHIP", "BEREAVEMENT", "LOAN", "OTHER"];

export interface Actor {
  isAdmin: boolean;
  /** The person asking for help. */
  isRequester: boolean;
}

export interface WelfareRequestLike {
  kind: WelfareKind;
  status: WelfareStatus;
  amountCents: number;
}

/**
 * Whether a welfare request may move from one state to another.
 *
 * The same segregation of duties as expenses — nobody approves money for
 * themselves — and it matters more here, not less. An expense is the school
 * buying diesel; this is a member of staff asking for help with a hospital
 * bill, and the person deciding must not be the person who benefits.
 */
export function checkTransition(from: WelfareStatus, to: WelfareStatus, actor: Actor): string | null {
  if (from === to) return "That request is already in that state";
  if (from === "PAID") return "That request has already been paid";

  switch (to) {
    case "APPROVED":
      if (from !== "REQUESTED" && from !== "DECLINED") return "Only a pending request can be approved";
      if (!actor.isAdmin) return "Only an administrator can approve welfare";
      if (actor.isRequester) return "Welfare cannot be approved by the person who asked for it";
      return null;

    case "DECLINED":
      if (from !== "REQUESTED" && from !== "APPROVED") return "Only a pending request can be declined";
      if (!actor.isAdmin) return "Only an administrator can decide a welfare request";
      if (actor.isRequester) return "Welfare cannot be decided by the person who asked for it";
      return null;

    case "PAID":
      if (from !== "APPROVED") return "Money cannot be paid out on a request nobody approved";
      if (!actor.isAdmin) return "Only an administrator can record a payment";
      return null;

    case "REQUESTED":
      if (from !== "DECLINED") return "Only a declined request can be asked again";
      if (!actor.isRequester && !actor.isAdmin) return "Only the person who asked can raise it again";
      return null;

    default:
      return "That is not a state a welfare request can be in";
  }
}

export function availableTransitions(from: WelfareStatus, actor: Actor): WelfareStatus[] {
  const all: WelfareStatus[] = ["REQUESTED", "APPROVED", "PAID", "DECLINED"];
  return all.filter((to) => checkTransition(from, to, actor) === null);
}

/**
 * Who may read a welfare request.
 *
 * Narrower than expenses on purpose. An expense is school business and any
 * member of staff can see it; a welfare request says something private about
 * the person who made it — that they could not pay a hospital bill, that
 * there was a death in the family. Only the person who asked and the
 * administrators who have to decide.
 *
 * A medical request is not more private than the others here, and is not
 * treated as a separate class: singling it out would be its own disclosure,
 * because everybody would learn what the hidden category was.
 */
export function canRead(actor: Actor): boolean {
  return actor.isRequester || actor.isAdmin;
}

export interface WelfareSummary {
  /** Approved and paid together. */
  committedCents: number;
  paidCents: number;
  outstandingCents: number;
  /** Asked for and not yet decided. Not a commitment. */
  pendingCents: number;
  byKind: { kind: WelfareKind; amountCents: number; count: number }[];
}

/**
 * What welfare adds up to.
 *
 * `byKind` counts committed money only, and reports counts alongside amounts
 * because a school looking at this is usually deciding whether its welfare
 * provision is enough — and one large medical bill and twelve small ones are
 * the same figure and a very different picture.
 */
export function summariseWelfare(requests: WelfareRequestLike[]): WelfareSummary {
  let committedCents = 0;
  let paidCents = 0;
  let pendingCents = 0;
  const byKind = new Map<WelfareKind, { amountCents: number; count: number }>();

  for (const request of requests) {
    const amount = Math.max(0, request.amountCents);

    if (request.status === "REQUESTED") {
      pendingCents += amount;
      continue;
    }
    if (request.status === "DECLINED") continue;

    committedCents += amount;
    if (request.status === "PAID") paidCents += amount;

    const current = byKind.get(request.kind) ?? { amountCents: 0, count: 0 };
    byKind.set(request.kind, { amountCents: current.amountCents + amount, count: current.count + 1 });
  }

  return {
    committedCents,
    paidCents,
    outstandingCents: committedCents - paidCents,
    pendingCents,
    byKind: [...byKind.entries()]
      .map(([kind, totals]) => ({ kind, ...totals }))
      .sort((a, b) => b.amountCents - a.amountCents || a.kind.localeCompare(b.kind)),
  };
}

/** Why this amount cannot be asked for, or null. */
export function validateAmount(amountCents: number): string | null {
  if (!Number.isFinite(amountCents)) return "That amount is not a number";
  if (!Number.isInteger(amountCents)) return "Amounts must be in whole minor units";
  if (amountCents <= 0) return "The amount must be above zero";
  if (amountCents > 100_000_000) return "That amount is larger than this screen will accept";
  return null;
}
