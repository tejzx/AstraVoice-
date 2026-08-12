import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card } from "@/components/AppShell";
import { listFaq, upsertFaq, deleteFaq } from "@/lib/receptionist.functions";

export const Route = createFileRoute("/knowledge-base")({
  head: () => ({
    meta: [
      { title: "Knowledge Base | AI Receptionist" },
      { name: "description", content: "Manage the approved company answers the AI receptionist is allowed to use." },
      { property: "og:title", content: "Knowledge Base | AI Receptionist" },
      { property: "og:description", content: "Edit the demo FAQ entries that ground the AI receptionist's answers." },
    ],
  }),
  component: KnowledgeBase,
});

const blank = { id: "", category: "", question: "", answer: "" };

function KnowledgeBase() {
  const fetchFaq = useServerFn(listFaq);
  const save = useServerFn(upsertFaq);
  const remove = useServerFn(deleteFaq);
  const qc = useQueryClient();
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["faq"], queryFn: () => fetchFaq({}) });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = form.id ? form : { category: form.category, question: form.question, answer: form.answer };
      return save({ data: payload as any });
    },
    onSuccess: (res) => {
      if (!res.ok) return setError(res.error ?? "Could not save.");
      setError(null);
      setForm(blank);
      void qc.invalidateQueries({ queryKey: ["faq"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["faq"] }),
  });

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Knowledge Base</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Demo records for this prototype. The agent may only answer using these approved entries.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {data?.map((f) => (
            <div key={f.id} className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{f.category}</p>
              <p className="mt-1 text-sm font-medium">{f.question}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.answer}</p>
              <div className="mt-2 flex gap-3 text-xs">
                <button className="text-primary hover:underline" onClick={() => setForm({ ...f })}>
                  Edit
                </button>
                <button
                  className="text-destructive hover:underline"
                  onClick={() => deleteMutation.mutate(f.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </Card>

        <Card className="space-y-3">
          <p className="font-medium">{form.id ? "Edit entry" : "Add entry"}</p>
          {(["category", "question"] as const).map((field) => (
            <input
              key={field}
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              placeholder={field[0]!.toUpperCase() + field.slice(1)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          ))}
          <textarea
            value={form.answer}
            onChange={(e) => setForm({ ...form, answer: e.target.value })}
            placeholder="Answer"
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Save
            </button>
            {form.id && (
              <button onClick={() => setForm(blank)} className="rounded-md border border-input px-4 py-2 text-sm">
                Cancel
              </button>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
