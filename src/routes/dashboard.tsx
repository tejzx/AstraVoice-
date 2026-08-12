import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AppShell, Card } from "@/components/AppShell";
import { getDashboard } from "@/lib/receptionist.functions";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | AstraVoice" },
      {
        name: "description",
        content:
          "Live overview of calls handled, appointments booked and escalations raised by the AI voice receptionist.",
      },
      { property: "og:title", content: "Dashboard | AstraVoice" },
      {
        property: "og:description",
        content: "Live overview of calls, appointments and escalations.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const fetchDashboard = useServerFn(getDashboard);
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard({}) });
  const s = data?.stats;

  const metrics = [
    { label: "Total Calls", value: s?.total ?? 0 },
    { label: "Resolved", value: s?.resolved ?? 0 },
    { label: "Appointments", value: s?.appointments ?? 0 },
    { label: "Escalated", value: s?.escalated ?? 0 },
  ];

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Reception Dashboard</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Everything the voice agent handled — grounded answers, real bookings and human escalations.
      </p>
      <Link
        to="/voice-agent"
        className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Start a call
      </Link>

      {data?.error && (
        <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {data.error}
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</p>
            <p className="mt-2 text-3xl font-semibold">{m.value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          {
            t: "Knowledge grounded",
            d: "Answers come only from the company knowledge base — never invented.",
          },
          { t: "Real actions", d: "Validates and creates appointments directly in the database." },
          { t: "Human escalation", d: "Checks staff availability and records callback requests." },
        ].map((f) => (
          <Card key={f.t}>
            <p className="font-medium">{f.t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
