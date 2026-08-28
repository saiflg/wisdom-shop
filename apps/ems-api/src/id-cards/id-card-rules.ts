/**
 * Printable student ID cards.
 *
 * The reason this is a server-rendered PDF rather than a web page: the card
 * carries a child's photograph, and a page would need that photograph at a
 * URL a browser can fetch. Embedding the bytes in a PDF the school downloads
 * keeps the photograph inside an authenticated response and off any address
 * that could be shared, guessed, cached by a proxy, or left in a history.
 *
 * What goes ON the card is the other half of the same question. A school ID
 * is carried by a child, lost by a child, and found by strangers.
 */

export interface CardStudent {
  name: string;
  studentCode: string | null;
  className: string | null;
  photoKey: string | null;
}

export interface CardFace {
  name: string;
  /** Lines under the name, in order. Never includes anything a stranger could use. */
  lines: string[];
  /** What to do if the card is found, and who to call — the school, never the family. */
  ifFound: string;
  hasPhoto: boolean;
}

export interface SchoolContact {
  name: string;
  phone: string | null;
  address: string | null;
}

/**
 * What is printed on a card.
 *
 * Deliberately thin. A child's home address, their date of birth, their
 * parent's telephone number and any medical detail are all things somebody
 * might reasonably think belong on a school ID, and none of them go on one:
 * the card is carried by a child and will be dropped in a street. It carries
 * enough to identify them TO THE SCHOOL, and the school's own number for
 * whoever finds it.
 */
export function buildCard(student: CardStudent, school: SchoolContact): CardFace {
  const lines: string[] = [];
  if (student.className) lines.push(student.className);
  if (student.studentCode) lines.push(student.studentCode);
  lines.push(school.name);

  const ifFound = school.phone
    ? `If found, please return to ${school.name}, ${school.phone}`
    : `If found, please return to ${school.name}`;

  return {
    name: student.name,
    lines,
    ifFound,
    hasPhoto: student.photoKey !== null,
  };
}

/**
 * Why a card cannot be printed for this child, or null.
 *
 * A missing photograph is NOT a reason to refuse. A card with a name and no
 * picture is still a usable school ID, and refusing to print one would leave
 * the children whose families have not sent a photograph — usually the ones
 * least able to — as the only children without a card.
 */
export function cardProblem(student: CardStudent): string | null {
  if (!student.name.trim()) return "That child has no name recorded";
  return null;
}

/**
 * How many cards fit on a sheet, and where each one goes.
 *
 * Two columns of five on A4, which is the arrangement that survives being cut
 * up with a guillotine. Returned as coordinates rather than drawn here so the
 * layout can be tested without producing a PDF.
 */
export interface CardSlot {
  index: number;
  x: number;
  y: number;
}

export const CARDS_PER_SHEET = 10;

export function slotsFor(count: number, options?: { marginX?: number; marginY?: number }): CardSlot[] {
  const marginX = options?.marginX ?? 40;
  const marginY = options?.marginY ?? 40;
  const cardWidth = 240;
  const cardHeight = 150;
  const gapX = 20;
  const gapY = 12;

  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const onSheet = index % CARDS_PER_SHEET;
    const column = onSheet % 2;
    const row = Math.floor(onSheet / 2);
    return {
      index,
      x: marginX + column * (cardWidth + gapX),
      y: marginY + row * (cardHeight + gapY),
    };
  });
}

/** Which sheet a card lands on, counting from zero. */
export function sheetOf(index: number): number {
  return Math.floor(index / CARDS_PER_SHEET);
}
