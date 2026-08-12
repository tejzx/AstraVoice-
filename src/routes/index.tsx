import { createFileRoute, Link } from "@tanstack/react-router";
import heroImage from "@/assets/hero-reception.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AstraVoice | AI Voice Receptionist" },
      {
        name: "description",
        content:
          "AstraVoice answers every call with an AI voice receptionist that shares verified company information, books appointments and connects callers to the right team.",
      },
      { property: "og:title", content: "AstraVoice | AI Voice Receptionist" },
      {
        property: "og:description",
        content: "An always-on voice receptionist for enquiries, appointments and department handoffs.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    title: "Answers you can trust",
    body: "Office hours, locations, courses, placements and admissions — answered from the approved company knowledge base, never guessed.",
  },
  {
    title: "Appointments booked live",
    body: "Callers pick a department, date and time. Availability, working hours and clashes are validated before anything is confirmed.",
  },
  {
    title: "A human when it matters",
    body: "Anything outside the knowledge base becomes a callback request with the caller's details routed to the right team.",
  },
  {
    title: "Every call on record",
    body: "Each conversation is summarised with its outcome so the team can follow up without listening to a single recording.",
  },
];

const steps = [
  { n: "01", t: "Caller speaks", d: "The receptionist greets them and listens in natural language." },
  { n: "02", t: "It checks the source of truth", d: "Knowledge base, staff directory and calendar are queried in real time." },
  { n: "03", t: "It acts", d: "Books the appointment, confirms details aloud, or raises an escalation." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              R
            </span>
            <span className="text-base font-semibold tracking-tight">AstraVoice</span>
          </div>
          <nav className="hidden items-center gap-1 text-sm md:flex">
            <a href="#capabilities" className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
              Capabilities
            </a>
            <a href="#how-it-works" className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
              How it works
            </a>
            <Link to="/dashboard" className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
              Dashboard
            </Link>
          </nav>
          <Link
            to="/voice-agent"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Talk to reception
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-border">
          <img
            src={heroImage}
            alt="Reception area of a modern technology company office"
            width={1600}
            height={1008}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-foreground/70" />
          <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">
              Front desk, always open
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-primary-foreground md:text-5xl">
              Every call answered in seconds, day or night.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-primary-foreground/80">
              Our AI voice receptionist greets callers, answers questions about courses, offices and hours, schedules
              meetings with the right department, and hands over to a person whenever it should.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/voice-agent"
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Start a call
              </Link>
              <Link
                to="/knowledge-base"
                className="rounded-md border border-primary-foreground/30 px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/10"
              >
                See what it knows
              </Link>
            </div>
            <dl className="mt-12 grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
              {[
                ["24/7", "Availability"],
                ["<2s", "To answer"],
                ["100%", "Calls logged"],
                ["5", "Departments"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="text-2xl font-semibold text-primary-foreground">{v}</dt>
                  <dd className="text-xs uppercase tracking-wide text-primary-foreground/60">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="capabilities" className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">What the receptionist handles</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Built for the questions a real front desk gets every day — and the follow-through those calls need.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="font-medium">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="border-y border-border bg-accent/40">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">How a call works</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {steps.map((s) => (
                <div key={s.n} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <span className="text-xs font-semibold tracking-widest text-primary">{s.n}</span>
                  <h3 className="mt-3 font-medium">{s.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight">Try the front desk yourself</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Ask about our office timings, book a meeting with HR, or request a callback — the receptionist is
              listening right now.
            </p>
            <Link
              to="/voice-agent"
              className="mt-6 inline-flex rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Start a call
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} AstraVoice</p>
          <div className="flex flex-wrap gap-4">
            <Link to="/dashboard" className="hover:text-foreground">Dashboard</Link>
            <Link to="/call-records" className="hover:text-foreground">Call records</Link>
            <Link to="/appointments" className="hover:text-foreground">Appointments</Link>
            <Link to="/knowledge-base" className="hover:text-foreground">Knowledge base</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
