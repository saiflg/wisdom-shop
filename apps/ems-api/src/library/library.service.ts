import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { CreateBookDto } from "./dto/create-book.dto";
import type { UpdateBookDto } from "./dto/update-book.dto";
import type { BorrowDto } from "./dto/borrow.dto";
import {
  availableCopies,
  borrowProblem,
  dayOf,
  daysOverdue,
  dueDateFor,
  isOverdue,
  summariseLibrary,
} from "./library-rules";

/**
 * How many books one child may have at once, and for how long.
 *
 * Constants rather than settings for now, and said out loud on the screen so
 * a librarian is not guessing. A school that wants different numbers is a
 * settings screen this does not have yet, and inventing an unused settings
 * table would be worse than two named constants.
 */
const MAX_PER_BORROWER = 3;
const LOAN_DAYS = 14;

const STAFF_ROLES = ["SCHOOL_ADMIN", "TEACHER"];

@Injectable()
export class LibraryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async addBook(dto: CreateBookDto) {
    const client = await this.tenantPrisma.getClient();
    return client.libraryBook.create({
      data: {
        title: dto.title.trim(),
        author: dto.author?.trim() || null,
        isbn: dto.isbn?.trim() || null,
        category: dto.category?.trim() || null,
        copies: dto.copies ?? 1,
      },
    });
  }

  /** The shelves, with what is out and what is late. */
  async books(search?: string) {
    const client = await this.tenantPrisma.getClient();
    const today = new Date();

    const books = await client.libraryBook.findMany({
      where: {
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" as const } },
                { author: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { title: "asc" },
      include: { loans: { where: { returnedOn: null }, select: { dueOn: true, returnedOn: true } } },
    });

    const rows = books.map((book) => {
      const outstandingLoans = book.loans.length;
      const overdueLoans = book.loans.filter((loan) => isOverdue(loan, today)).length;
      const { loans: _loans, ...rest } = book;
      return {
        ...rest,
        outstandingLoans,
        overdueLoans,
        availableCopies: availableCopies(book.copies, outstandingLoans),
      };
    });

    return { books: rows, summary: summariseLibrary(rows) };
  }

  async updateBook(id: string, dto: UpdateBookDto) {
    const client = await this.tenantPrisma.getClient();
    const book = await client.libraryBook.findFirst({ where: { id, deletedAt: null } });
    if (!book) throw new NotFoundException("No book found with that id");

    return client.libraryBook.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        author: dto.author?.trim(),
        isbn: dto.isbn?.trim(),
        category: dto.category?.trim(),
        copies: dto.copies,
      },
    });
  }

  /**
   * Issue a book.
   *
   * Everything that decides is in library-rules; this reads the counts it
   * needs and reports the first reason the loan cannot happen. The partial
   * unique index behind it catches the case two librarians scanning the same
   * child at the same moment would otherwise create.
   */
  async borrow(dto: BorrowDto, actor: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const today = new Date();

    const book = await client.libraryBook.findFirst({ where: { id: dto.bookId, deletedAt: null } });
    if (!book) throw new NotFoundException("No book found with that id");

    const student = await client.studentProfile.findFirst({ where: { id: dto.studentProfileId } });
    if (!student) throw new NotFoundException("No student found with that id");

    const [outstandingForBook, theirLoans] = await Promise.all([
      client.libraryLoan.count({ where: { bookId: dto.bookId, returnedOn: null } }),
      client.libraryLoan.findMany({
        where: { studentProfileId: dto.studentProfileId, returnedOn: null },
        select: { bookId: true, dueOn: true, returnedOn: true },
      }),
    ]);

    const problem = borrowProblem({
      availableCopies: availableCopies(book.copies, outstandingForBook),
      alreadyHasThisBook: theirLoans.some((loan) => loan.bookId === dto.bookId),
      currentLoans: theirLoans.length,
      maxPerBorrower: MAX_PER_BORROWER,
      overdueLoans: theirLoans.filter((loan) => isOverdue(loan, today)).length,
    });
    if (problem) throw new BadRequestException(problem);

    const borrowedOn = dayOf(today);
    try {
      return await client.libraryLoan.create({
        data: {
          bookId: dto.bookId,
          studentProfileId: dto.studentProfileId,
          borrowedOn,
          dueOn: dueDateFor(borrowedOn, LOAN_DAYS),
          issuedByUserId: actor.id,
          issuedByName: await this.nameOf(actor.id),
        },
      });
    } catch (error) {
      // Two librarians, one child, one book, same moment. The index decides.
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictException("They already have a copy of that book");
      }
      throw error;
    }
  }

  /**
   * Take a book back.
   *
   * Returning something already returned is not an error worth throwing at a
   * librarian holding a book — it is the second scan of the same barcode. The
   * loan comes back unchanged and the screen says it was already in.
   */
  async return(loanId: string, actor: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const loan = await client.libraryLoan.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException("No loan found with that id");
    if (loan.returnedOn) return { loan, alreadyReturned: true };

    const updated = await client.libraryLoan.update({
      where: { id: loanId },
      data: {
        returnedOn: dayOf(new Date()),
        returnedToUserId: actor.id,
        returnedToName: await this.nameOf(actor.id),
      },
    });
    return { loan: updated, alreadyReturned: false };
  }

  /**
   * What is out, or one child's loans.
   *
   * A family may ask after their own child and gets a 404 for anybody
   * else's, the same shape fees, wallets and behaviour use.
   */
  async loans(viewer: AuthenticatedUser, studentProfileId?: string, includeReturned = false) {
    const client = await this.tenantPrisma.getClient();
    const isStaff = viewer.roles.some((role) => STAFF_ROLES.includes(role));

    if (!isStaff) {
      const own = await this.visibleStudentIds(viewer);
      if (!studentProfileId || !own.has(studentProfileId)) {
        throw new NotFoundException("No student found with that id");
      }
    }

    const today = new Date();
    const loans = await client.libraryLoan.findMany({
      where: {
        ...(studentProfileId ? { studentProfileId } : {}),
        ...(includeReturned ? {} : { returnedOn: null }),
      },
      orderBy: { dueOn: "asc" },
      include: {
        book: { select: { id: true, title: true, author: true } },
        studentProfile: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
      },
    });

    return loans.map((loan) => ({
      ...loan,
      overdue: isOverdue(loan, today),
      daysOverdue: daysOverdue(loan, today),
    }));
  }

  /**
   * Withdraw a title from the shelves.
   *
   * Refused while copies are still out. Soft-deleting a book somebody is
   * holding would drop it off every "what is still out" list while the child
   * still has it, and the loan is the only record that they do.
   */
  async removeBook(id: string) {
    const client = await this.tenantPrisma.getClient();
    const book = await client.libraryBook.findFirst({ where: { id, deletedAt: null } });
    if (!book) throw new NotFoundException("No book found with that id");

    const out = await client.libraryLoan.count({ where: { bookId: id, returnedOn: null } });
    if (out > 0) {
      throw new BadRequestException(
        out === 1
          ? "A copy of that book is still out. It has to come back first."
          : `${out} copies of that book are still out. They have to come back first.`,
      );
    }

    await client.libraryBook.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** The limits, so the screen can state them rather than guessing. */
  limits() {
    return { maxPerBorrower: MAX_PER_BORROWER, loanDays: LOAN_DAYS };
  }

  private async visibleStudentIds(viewer: AuthenticatedUser): Promise<Set<string>> {
    const client = await this.tenantPrisma.getClient();
    if (viewer.roles.includes("GUARDIAN")) {
      const links = await client.guardianLink.findMany({
        where: { guardianUserId: viewer.id },
        select: { studentProfileId: true },
      });
      return new Set(links.map((link) => link.studentProfileId));
    }
    const own = await client.studentProfile.findUnique({
      where: { userId: viewer.id },
      select: { id: true },
    });
    return new Set(own ? [own.id] : []);
  }

  private async nameOf(userId: string): Promise<string> {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown";
  }
}
