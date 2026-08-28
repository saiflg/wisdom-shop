import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { LibraryService } from "./library.service";
import { CreateBookDto } from "./dto/create-book.dto";
import { UpdateBookDto } from "./dto/update-book.dto";
import { BorrowDto } from "./dto/borrow.dto";

@ApiTags("library")
@ApiBearerAuth()
@Controller("library")
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  // Readable by anybody signed in: a catalogue is what a library is for, and
  // a child who cannot see what the school owns cannot ask for it. Only
  // titles, authors and counts — no loan is exposed here.
  @Get("books")
  @ApiQuery({ name: "search", required: false })
  @ApiOperation({ summary: "The catalogue, with what is out and what is late" })
  books(@Query("search") search?: string) {
    return this.library.books(search);
  }

  @Get("limits")
  @ApiOperation({ summary: "How many books one borrower may have, and for how long" })
  limits() {
    return this.library.limits();
  }

  @Post("books")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Add a title" })
  addBook(@Body() dto: CreateBookDto) {
    return this.library.addBook(dto);
  }

  @Patch("books/:id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Edit a title or change how many copies the school owns" })
  updateBook(@Param("id") id: string, @Body() dto: UpdateBookDto) {
    return this.library.updateBook(id, dto);
  }

  @Delete("books/:id")
  @Roles("SCHOOL_ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Withdraw a title",
    description: "Refused while copies are still out — the loan is the only record that a child has one.",
  })
  removeBook(@Param("id") id: string) {
    return this.library.removeBook(id);
  }

  @Post("loans")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Issue a book",
    description:
      "Refused when every copy is out, when they already have that book, when they have something overdue, " +
      "or when they are at their limit — the first reason that applies.",
  })
  borrow(@Body() dto: BorrowDto, @CurrentUser() user: AuthenticatedUser) {
    return this.library.borrow(dto, user);
  }

  @Post("loans/:id/return")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Take a book back",
    description: "Scanning a book that is already in is not an error; it comes back marked as already in.",
  })
  return(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.library.return(id, user);
  }

  // Widened to families, narrowed in the service: a parent must pass their
  // own child's id and gets a 404 for anybody else's.
  @Get("loans")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @ApiQuery({ name: "studentProfileId", required: false })
  @ApiQuery({ name: "includeReturned", required: false })
  @ApiOperation({
    summary: "What is out, or one child's loans",
    description: "A family must name their own child; asking after another gets a 404, not a 403.",
  })
  loans(
    @CurrentUser() user: AuthenticatedUser,
    @Query("studentProfileId") studentProfileId?: string,
    @Query("includeReturned") includeReturned?: string,
  ) {
    return this.library.loans(user, studentProfileId, includeReturned === "true");
  }
}
