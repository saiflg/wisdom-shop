/**
 * Turns a school's curriculum plus a conversation so far into one prompt.
 *
 * Kept pure and separate from the service because this text is the whole
 * product: it is what makes the AI Teacher a *school's* tutor rather than a
 * general chatbot with a school logo on it. It is also where the rules that
 * protect a child live, so it deserves tests that read like requirements.
 */

export interface TutorContext {
  subjectName: string;
  gradeLevel: string | null;
  topic: string;
  /** Objectives from the anchored scheme-of-work week, when the session has one. */
  objectives?: string[];
  country?: string | null;
  curriculumStandard?: string | null;
}

export interface TranscriptTurn {
  role: "STUDENT" | "TUTOR";
  content: string;
}

/**
 * How much of the conversation is replayed to the provider.
 *
 * Not unbounded: every replayed turn is billed again on every question, so a
 * long session would get quadratically expensive as well as eventually
 * overflowing the model's context.
 */
export const MAX_TRANSCRIPT_TURNS = 16;

/**
 * Keeps the conversation within budget while preserving the opening.
 *
 * The first turn is kept deliberately. It states what the student came to
 * learn, and dropping it is exactly how a tutor forty questions in ends up
 * cheerfully discussing something else entirely.
 */
export function trimTranscript(turns: TranscriptTurn[], max: number = MAX_TRANSCRIPT_TURNS): TranscriptTurn[] {
  if (max <= 0) return [];
  if (turns.length <= max) return [...turns];
  if (max === 1) return [turns[0]];

  return [turns[0], ...turns.slice(-(max - 1))];
}

function describeLearner(context: TutorContext): string {
  const grade = context.gradeLevel?.trim();
  return grade ? `a ${grade} student` : "a school student";
}

export function buildTutorPrompt(
  context: TutorContext,
  transcript: TranscriptTurn[],
  question: string,
): string {
  const lines: string[] = [];

  lines.push(
    `You are a patient, encouraging teacher helping ${describeLearner(context)} with ${context.subjectName}.`,
  );

  const standard = context.curriculumStandard?.trim();
  const country = context.country?.trim();
  if (standard && country) lines.push(`Follow the ${standard} curriculum as taught in ${country}.`);
  else if (standard) lines.push(`Follow the ${standard} curriculum.`);
  else if (country) lines.push(`Follow the curriculum as taught in ${country}.`);

  lines.push(`Today's topic: ${context.topic.trim()}`);

  const objectives = (context.objectives ?? []).map((o) => o.trim()).filter(Boolean);
  if (objectives.length > 0) {
    lines.push("The class is working towards these objectives:");
    for (const objective of objectives) lines.push(`- ${objective}`);
  }

  lines.push("");
  lines.push("How to teach:");
  lines.push("- Explain in small steps, in plain language, and check understanding as you go.");
  lines.push("- Use examples a student this age would recognise.");
  lines.push(
    "- If the student asks for an answer to homework or a test, guide them to work it out themselves instead of handing it over.",
  );
  lines.push("- End with one short question that checks whether the explanation landed.");
  lines.push("- Keep each reply short enough to read on a phone.");
  lines.push("");
  lines.push("Rules you must not break:");
  lines.push(
    `- Stay on ${context.subjectName}. If asked about something unrelated, say kindly that this is a ${context.subjectName} lesson and offer to come back to the topic.`,
  );
  lines.push(
    "- Never ask for or repeat personal details: full name, address, phone number, email, passwords, or anything about the student's family.",
  );
  lines.push(
    "- If the student says anything suggesting they are unsafe, being hurt, or in distress, do not counsel them: tell them warmly to speak to their teacher or another trusted adult straight away, and say nothing else on the subject.",
  );
  lines.push("- Never claim to be a human being.");

  const trimmed = trimTranscript(transcript);
  if (trimmed.length > 0) {
    lines.push("");
    lines.push("The lesson so far:");
    for (const turn of trimmed) {
      lines.push(`${turn.role === "STUDENT" ? "Student" : "Teacher"}: ${turn.content}`);
    }
  }

  lines.push("");
  lines.push(`The student now asks: ${question.trim()}`);
  lines.push("");
  lines.push("Reply as the teacher, in prose. Do not prefix your reply with a name or label.");

  return lines.join("\n");
}
