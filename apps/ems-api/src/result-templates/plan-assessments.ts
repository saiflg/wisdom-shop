import { validateWeights } from "@/grading/grading-math";

export interface TemplateComponent {
  name: string;
  maxScoreHundredths: number;
  weightPercent: number;
}

export interface PlannedAssessment {
  subjectId: string;
  classId: string;
  academicYear: string;
  term: string;
  name: string;
  maxScoreHundredths: number;
  weightPercent: number;
}

export interface PlanInput {
  components: TemplateComponent[];
  subjectIds: string[];
  classId: string;
  academicYear: string;
  term: string;
}

/**
 * What applying a template would write, as data, before anything is written.
 *
 * Kept as a pure function for two reasons. The obvious one is that it can be
 * tested without a database. The one that matters more is that a school
 * applying a template to twelve subjects is about to create forty-eight rows
 * that decide what every child in that class scores this term, and the shape
 * of those rows should be inspectable — by a test, and by the screen that
 * shows "this will create 48 assessments" before an admin presses the button.
 *
 * Returns the rows in a stable order: subject by subject, and within a
 * subject the components in the order the school listed them.
 */
export function planAssessments(input: PlanInput): PlannedAssessment[] {
  const planned: PlannedAssessment[] = [];
  for (const subjectId of input.subjectIds) {
    for (const component of input.components) {
      planned.push({
        subjectId,
        classId: input.classId,
        academicYear: input.academicYear,
        term: input.term,
        name: component.name,
        maxScoreHundredths: component.maxScoreHundredths,
        weightPercent: component.weightPercent,
      });
    }
  }
  return planned;
}

/**
 * Why this template cannot be applied, or null when it can.
 *
 * The weight rule is not restated here: it is `validateWeights` from
 * grading-math, the same function that decides whether a subject's real
 * assessments may be published. A template that passed a laxer check here
 * would create assessments that could never be published, and the admin
 * would find out a term later — which is the exact failure this whole
 * feature exists to prevent.
 */
export function validateTemplate(components: TemplateComponent[]): string | null {
  if (components.length === 0) return "A template needs at least one component";

  const weightProblem = validateWeights(components.map((component) => component.weightPercent));
  if (weightProblem) return weightProblem;

  for (const component of components) {
    if (!component.name.trim()) return "Every component needs a name";
    if (!Number.isInteger(component.maxScoreHundredths) || component.maxScoreHundredths <= 0) {
      return `"${component.name}" needs a maximum score above zero`;
    }
  }

  // Assessments are unique by name within a subject, class and term, so two
  // components sharing a name would create one row and drop the other
  // without saying so. The database enforces this too; saying it here means
  // an admin gets the name back rather than a constraint code.
  const names = components.map((component) => component.name.trim().toLowerCase());
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate) return `Two components are both called "${duplicate}"`;

  return null;
}
