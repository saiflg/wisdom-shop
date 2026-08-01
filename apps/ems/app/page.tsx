const ROADMAP = [
  {
    title: "School administration",
    description: "Schools, classes, teachers, students, enrolment, attendance, and grading.",
  },
  {
    title: "Curriculum engine",
    description: "Manual, AI-generated, or hybrid curricula — schemes of work, lesson plans, and assessments.",
  },
  {
    title: "AI Teacher",
    description: "An interactive classroom where an AI explains lessons, answers questions, and adapts to each student.",
  },
  {
    title: "Multi-tenant workspaces",
    description: "Each school gets its own branding, subdomain, users, and fully isolated data.",
  },
];

export default function ComingSoonPage() {
  const shopUrl = process.env.NEXT_PUBLIC_SHOP_URL ?? "http://localhost:3000";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-block rounded-full bg-brand-gradient px-4 py-1 text-xs font-semibold uppercase tracking-wide text-white">
          In development
        </span>

        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
          Wisdom{" "}
          <span className="bg-brand-gradient bg-clip-text text-transparent">Campus</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600 dark:text-slate-400">
          An AI-powered school management and learning platform — built for schools that need
          more than a gradebook, and students who deserve more than a static lesson.
        </p>

        <a
          href={shopUrl}
          className="mt-8 inline-block rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold transition hover:border-brand-400 dark:border-slate-700"
        >
          Back to Wisdom Shop
        </a>
      </div>

      <div className="mx-auto mt-16 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {ROADMAP.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-slate-200 p-5 text-left dark:border-slate-800"
          >
            <h2 className="font-semibold">{item.title}</h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{item.description}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
