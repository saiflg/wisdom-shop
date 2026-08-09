"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { useSubjects } from "@/lib/use-subjects";
import {
  QUESTION_TYPE_LABELS,
  marksLabel,
  useCreateQuestion,
  useDeleteQuestion,
  useGenerateQuestions,
  useQuestionBank,
  type QuestionType,
} from "@/lib/use-exams";
import { FormField } from "@/components/form-field";

const INPUT =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

const questionSchema = z.object({
  subjectId: z.string().min(1, "Choose a subject"),
  topic: z.string().optional(),
  type: z.string().min(1),
  prompt: z.string().min(1, "Write the question"),
  // Marks are typed as text and converted at submit, for the same reason as
  // the AI Teacher's week number: an untouched number input submits "",
  // which z.coerce.number() turns into 0, which then fails .min(1).
  marks: z.string().optional(),
});
type QuestionValues = z.infer<typeof questionSchema>;

const CHOICE_TYPES: QuestionType[] = ["SINGLE_CHOICE", "MULTI_CHOICE", "TRUE_FALSE"];

export default function QuestionBankPage() {
  const { data: subjects } = useSubjects();
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const { data: questions, isLoading, error } = useQuestionBank(subjectFilter || undefined);

  const create = useCreateQuestion();
  const remove = useDeleteQuestion();
  const generate = useGenerateQuestions();

  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Option rows are local state rather than form fields: they are added and
  // removed dynamically, and react-hook-form arrays would buy nothing here.
  const [options, setOptions] = useState([
    { key: "A", text: "" },
    { key: "B", text: "" },
  ]);
  const [correct, setCorrect] = useState<string[]>([]);
  const [accepted, setAccepted] = useState("");

  const form = useForm<QuestionValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: { type: "SINGLE_CHOICE" },
  });
  const type = form.watch("type") as QuestionType;

  const resetOptions = () => {
    setOptions([
      { key: "A", text: "" },
      { key: "B", text: "" },
    ]);
    setCorrect([]);
    setAccepted("");
  };

  const onCreate = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync({
        subjectId: values.subjectId,
        topic: values.topic || undefined,
        type: values.type as QuestionType,
        prompt: values.prompt,
        ...(CHOICE_TYPES.includes(values.type as QuestionType)
          ? { options: options.filter((option) => option.text.trim() !== ""), answer: correct }
          : {}),
        ...(values.type === "SHORT_ANSWER"
          ? { answer: accepted.split(",").map((entry) => entry.trim()).filter(Boolean) }
          : {}),
        ...(values.marks ? { marksHundredths: Math.round(Number(values.marks) * 100) } : {}),
      });
      form.reset({ type: values.type, subjectId: values.subjectId });
      resetOptions();
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't save that question.");
    }
  });

  const [genTopic, setGenTopic] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<{ created: number; rejected: string[] } | null>(null);

  const onGenerate = async () => {
    setGenError(null);
    setGenResult(null);
    if (!subjectFilter) {
      setGenError("Choose a subject first, so the questions land somewhere.");
      return;
    }
    try {
      const result = await generate.mutateAsync({ subjectId: subjectFilter, topic: genTopic, count: 5 });
      setGenResult({ created: result.created.length, rejected: result.rejected });
    } catch (err) {
      setGenError(err instanceof ApiError ? err.message : "Couldn't generate questions.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Question bank</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Questions you can put on any paper. A paper takes its own copy, so editing a question here
            never changes an exam somebody has already sat.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {open ? "Cancel" : "Add a question"}
        </button>
      </div>

      {open && (
        <form onSubmit={onCreate} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Subject
              <select className={INPUT} {...form.register("subjectId")}>
                <option value="">Choose…</option>
                {subjects?.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.subjectId && (
                <span className="mt-1 block text-xs text-red-600">
                  {form.formState.errors.subjectId.message}
                </span>
              )}
            </label>

            <label className="text-sm font-medium">
              Type
              <select className={INPUT} {...form.register("type")}>
                {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((value) => (
                  <option key={value} value={value}>
                    {QUESTION_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <FormField label="Topic" placeholder="Fractions" {...form.register("topic")} />
            <FormField label="Marks" placeholder="2" {...form.register("marks")} />
          </div>

          <label className="mt-4 block text-sm font-medium">
            The question
            <textarea rows={3} className={INPUT} {...form.register("prompt")} />
            {form.formState.errors.prompt && (
              <span className="mt-1 block text-xs text-red-600">{form.formState.errors.prompt.message}</span>
            )}
          </label>

          {CHOICE_TYPES.includes(type) && (
            <fieldset className="mt-4">
              <legend className="text-sm font-medium">Options — tick the correct one</legend>
              <div className="mt-2 space-y-2">
                {options.map((option, index) => (
                  <div key={option.key} className="flex items-center gap-3">
                    <input
                      type={type === "MULTI_CHOICE" ? "checkbox" : "radio"}
                      name="correct"
                      checked={correct.includes(option.key)}
                      onChange={(event) =>
                        setCorrect((current) => {
                          if (type === "MULTI_CHOICE") {
                            return event.target.checked
                              ? [...current, option.key]
                              : current.filter((key) => key !== option.key);
                          }
                          return [option.key];
                        })
                      }
                      aria-label={`Option ${option.key} is correct`}
                      className="h-4 w-4"
                    />
                    <span className="w-5 text-sm font-semibold">{option.key}</span>
                    <input
                      value={option.text}
                      onChange={(event) => {
                        const text = event.target.value;
                        // Functional update: two options edited before a
                        // re-render would otherwise both close over the same
                        // stale array and the second would undo the first.
                        setOptions((current) =>
                          current.map((entry, i) => (i === index ? { ...entry, text } : entry)),
                        );
                      }}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setOptions((current) => [
                    ...current,
                    { key: String.fromCharCode(65 + current.length), text: "" },
                  ])
                }
                className="mt-2 text-xs font-semibold text-brand-600 hover:underline"
              >
                Add an option
              </button>
            </fieldset>
          )}

          {type === "SHORT_ANSWER" && (
            <label className="mt-4 block text-sm font-medium">
              Accepted answers, separated by commas
              <input value={accepted} onChange={(event) => setAccepted(event.target.value)} className={INPUT} />
              <span className="mt-1 block text-xs text-slate-500">
                List every spelling a marker should accept — &ldquo;3, three&rdquo;. Anything else is marked
                zero and flagged for you to look at, rather than quietly standing.
              </span>
            </label>
          )}

          {type === "ESSAY" && (
            <p className="mt-4 text-xs text-slate-500">
              Essays are never marked by the machine. You will mark these yourself, and the paper is not
              finished until you have.
            </p>
          )}

          {formError && (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={create.isPending}
            className="mt-4 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {create.isPending ? "Saving…" : "Save question"}
          </button>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Draft with AI</h2>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            Subject
            <select
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
              className={INPUT}
            >
              <option value="">All subjects</option>
              {subjects?.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Topic
            <input
              value={genTopic}
              onChange={(event) => setGenTopic(event.target.value)}
              placeholder="Fractions"
              className={INPUT}
            />
          </label>
          <button
            type="button"
            onClick={onGenerate}
            disabled={generate.isPending || genTopic.trim().length < 2}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60 dark:border-slate-700"
          >
            {generate.isPending ? "Writing…" : "Draft 5 questions"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Generated questions land here for you to read and edit. They are never put on a paper
          automatically — a wrong answer key would mark a whole class wrong.
        </p>
        {genError && (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {genError}
          </p>
        )}
        {genResult && (
          <div className="mt-2 text-sm">
            <p className="font-medium">Added {genResult.created} questions.</p>
            {genResult.rejected.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">
                {genResult.rejected.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error instanceof ApiError ? error.message : "Couldn't load the question bank."}
        </p>
      )}

      {questions && questions.length === 0 && (
        <p className="text-sm text-slate-500">No questions yet. Add one, or draft some with AI.</p>
      )}

      <ul className="space-y-3">
        {questions?.map((question) => (
          <li key={question.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{question.prompt}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {QUESTION_TYPE_LABELS[question.type]} · {marksLabel(question.marksHundredths)}
                  {question.subject ? ` · ${question.subject.name}` : ""}
                  {question.topic ? ` · ${question.topic}` : ""}
                  {question.source === "AI_GENERATED" ? " · drafted by AI" : ""}
                </p>
                {question.options?.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-sm">
                    {question.options.map((option) => (
                      <li
                        key={option.key}
                        className={
                          question.answer?.includes(option.key)
                            ? "font-semibold text-emerald-700 dark:text-emerald-400"
                            : "text-slate-600 dark:text-slate-400"
                        }
                      >
                        {option.key}. {option.text}
                        {question.answer?.includes(option.key) ? " ✓" : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {question.type === "SHORT_ANSWER" && (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Accepts: {question.answer?.join(", ")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove.mutate(question.id)}
                className="shrink-0 text-xs font-semibold text-red-600 hover:underline"
              >
                Retire
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
