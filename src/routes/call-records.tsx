import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AppShell, Card } from "@/components/AppShell";
import { getDashboard } from "@/lib/receptionist.functions";

export const Route = createFileRoute("/call-records")({
  head: () => ({
    meta: [
      { title: "Call Records | AI Receptionist" },
      { name: "description", content: "Structured records of every AI receptionist call: intent, summary, outcome and escalation status." },
      { property: "og:title", content: "Call Records | AI Receptionist" },
      { property: "og:description", content: "Review AI receptionist call logs and outcomes." },
    ],
  }),
  component: CallRecords,
});

function CallRecords() {
  const fetchDashboard = useServerFn(getDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard({}) });
  const calls = data?.calls ?? [];

  const exportCsv = () => {
    const headers = ["Time", "Caller", "Summary", "Outcome", "Escalated"];
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = calls.map((c) => [
      new Date(c.created_at).toLocaleString(),
      c.caller_name ?? "",
      c.summary ?? "",
      c.outcome ?? "",
      c.escalated ? "Yes" : "No",
    ]);
    const csv = [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `call-records-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Call Records</h1>
        <button
          onClick={exportCsv}
          disabled={calls.length === 0}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>
      <Card className="mt-6 overflow-x-auto">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : calls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No calls recorded yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Time", "Caller", "Summary", "Outcome", "Escalated"].map((h) => (
                  <th key={h} className="py-2 pr-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id} className="border-t border-border align-top">
                  <td className="py-2 pr-4 whitespace-nowrap">{new Date(c.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-4">{c.caller_name ?? "—"}</td>
                  <td className="py-2 pr-4 max-w-md">{c.summary ?? "—"}</td>
                  <td className="py-2 pr-4">{c.outcome ?? "—"}</td>
                  <td className="py-2 pr-4">{c.escalated ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AppShell>
  );
}
