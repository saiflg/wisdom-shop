export interface LoanLike {
  dueOn: Date;
  returnedOn: Date | null;
}

/**
 * Midnight UTC, so a loan issued at four in the afternoon is due on a day
 * rather than at a moment.
 *
 * The same convention leave and staff attendance use. A library that
 * compared raw timestamps would make a book issued at 4pm and due "in seven
 * days" overdue at 00:01 on the seventh day for one child and not for
 * another, depending only on when the librarian happened to scan it.
 */
export function dayOf(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** When a book borrowed today should come back. */
export function dueDateFor(borrowedOn: Date, loanDays: number): Date {
  const due = dayOf(borrowedOn);
  due.setUTCDate(due.getUTCDate() + Math.max(1, Math.floor(loanDays)));
  return due;
}

/**
 * Is this loan overdue as at `today`?
 *
 * A book due today is NOT overdue. The child has until the end of the day
 * they were given, and a library that says otherwise charges a fine for
 * being on time — the kind of small unfairness that is never reported
 * because a ten-year-old assumes the computer is right.
 */
export function isOverdue(loan: LoanLike, today: Date): boolean {
  if (loan.returnedOn) return false;
  return dayOf(today).getTime() > dayOf(loan.dueOn).getTime();
}

/** Whole days past the due date; zero when it is not overdue yet. */
export function daysOverdue(loan: LoanLike, today: Date): number {
  if (!isOverdue(loan, today)) return 0;
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((dayOf(today).getTime() - dayOf(loan.dueOn).getTime()) / millisecondsPerDay);
}

/**
 * How many copies of a book can still go out.
 *
 * Clamped at zero rather than trusted. If the loan rows and the copy count
 * ever disagree — a copy withdrawn while it was out, a count edited down —
 * the honest answer is "none available", not a negative number that would
 * read as a shortage nobody can act on.
 */
export function availableCopies(copies: number, outstandingLoans: number): number {
  return Math.max(0, Math.max(0, copies) - Math.max(0, outstandingLoans));
}

export interface BorrowCheck {
  availableCopies: number;
  /** Whether this borrower already has a copy of this same book out. */
  alreadyHasThisBook: boolean;
  /** Books this borrower currently has out. */
  currentLoans: number;
  maxPerBorrower: number;
  /** Books this borrower has out that are past their due date. */
  overdueLoans: number;
}

/**
 * Why this person cannot take this book, or null when they can.
 *
 * Ordered from the most concrete reason to the most general, because the
 * first sentence a librarian reads should be the one that tells them what to
 * do about it. "No copies available" is a different conversation from "this
 * child has three books overdue".
 */
export function borrowProblem(check: BorrowCheck): string | null {
  if (check.availableCopies <= 0) return "Every copy of that book is out";
  if (check.alreadyHasThisBook) return "They already have a copy of that book";
  if (check.overdueLoans > 0) {
    return check.overdueLoans === 1
      ? "They have a book overdue. It has to come back first."
      : `They have ${check.overdueLoans} books overdue. Those have to come back first.`;
  }
  if (check.currentLoans >= check.maxPerBorrower) {
    return `They already have ${check.currentLoans} books out, which is the limit`;
  }
  return null;
}

export interface LibrarySummary {
  titles: number;
  copies: number;
  onLoan: number;
  available: number;
  overdue: number;
}

export interface BookLike {
  copies: number;
  outstandingLoans: number;
  overdueLoans: number;
}

/**
 * What the shelves add up to.
 *
 * `titles` and `copies` are kept apart for the same reason merits and points
 * are on the behaviour screen: forty copies of one book and forty different
 * books are the same number and a very different library.
 */
export function summariseLibrary(books: BookLike[]): LibrarySummary {
  let copies = 0;
  let onLoan = 0;
  let overdue = 0;

  for (const book of books) {
    const owned = Math.max(0, book.copies);
    const out = Math.min(owned, Math.max(0, book.outstandingLoans));
    copies += owned;
    onLoan += out;
    overdue += Math.max(0, book.overdueLoans);
  }

  return { titles: books.length, copies, onLoan, available: copies - onLoan, overdue };
}
