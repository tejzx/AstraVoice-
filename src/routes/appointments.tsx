import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AppShell, Card } from "@/components/AppShell";
import { getDashboard } from "@/lib/receptionist.functions";

export const Route = createFileRoute("/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments | AI Receptionist" },
      { name: "description", content: "Appointments booked by the AI receptionist, with department, date, time and purpose." },
      { property: "og:title", content: "Appointments | AI Receptionist" },
      { property: "og:description", content: "View appointments created by the AI voice agent." },
    ],
  }),
  component: Appointments,
});

function Appointments() {
  const fetchDashboard = useServerFn(getDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard({}) });

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
      <Card className="mt-6 overflow-x-auto">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data?.appointments.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No appointments yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Caller", "Department", "Date", "Time", "Purpose", "Status"].map((h) => (
                  <th key={h} className="py-2 pr-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.appointments.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="py-2 pr-4">{a.caller_name}</td>
                  <td className="py-2 pr-4">{a.department}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{a.appointment_date}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{String(a.appointment_time).slice(0, 5)}</td>
                  <td className="py-2 pr-4">{a.purpose ?? "—"}</td>
                  <td className="py-2 pr-4">{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AppShell>
  );
}
