import { createServerFn } from "@tanstack/react-start";

export type TurnInput = {
  callId: string;
  history: { role: "user" | "assistant"; content: string }[];
  state: {
    appointmentId: string | null;
    escalated: boolean;
    escalationReason: string | null;
    callerName: string | null;
    phone: string | null;
    email: string | null;
  };
};

export const agentTurn = createServerFn({ method: "POST" })
  .inputValidator((d: TurnInput) => d)
  .handler(async ({ data }) => {
    const { runAgentTurn, deriveIntent, detectFastIntent, fastReply } =
      await import("./receptionist.server");

    // Fast conversation layer: greetings, thanks, goodbye, help and small talk are
    // answered deterministically without ever calling Groq or the knowledge base.
    const lastUserMessage =
      [...data.history].reverse().find((m) => m.role === "user")?.content ?? "";
    const fast = detectFastIntent(lastUserMessage);
    if (fast) {
      return {
        ok: true as const,
        reply: fastReply(fast),
        actions: [] as string[],
        state: data.state,
        intent: fast,
      };
    }

    try {
      // One Groq call per turn, not two — intent is derived from whichever
      // tool actually ran, not from a second classifier request.
      const turn = await runAgentTurn(data.history, data.state);
      const intent = deriveIntent(turn.actions, turn.state);
      return {
        ok: true as const,
        reply: turn.reply,
        actions: turn.actions,
        state: turn.state,
        intent,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const rateLimited = message === "RATE_LIMIT";
      const timedOut = message === "TIMEOUT";
      console.error("agentTurn failed", e);
      return {
        ok: false as const,
        reply: rateLimited
          ? "I'm receiving a lot of calls right now. Could you please repeat that in a moment?"
          : timedOut
            ? "I'm sorry, that request took too long to process. Please try again."
            : "I'm having trouble processing that request right now. You can try again, or I can help you connect with a team member.",
        actions: [] as string[],
        state: data.state,
        intent: "UNKNOWN",
      };
    }
  });

export const endCall = createServerFn({ method: "POST" })
  .inputValidator((d: TurnInput & { duration: number }) => d)
  .handler(async ({ data }) => {
    if (data.history.length === 0)
      return { ok: false as const, summary: null, outcome: null, saved: false as const };

    // Always compute a summary locally-safe fallback first, so a Groq or Supabase
    // failure below can never prevent us from telling the user their call ended
    // cleanly (even if it couldn't be persisted).
    let meta: { summary: string; outcome: string; caller_name: string | null } = {
      summary: "Call transcript recorded; automatic summary unavailable.",
      outcome: data.state.appointmentId
        ? "Appointment Scheduled"
        : data.state.escalated
          ? "Escalated"
          : "Resolved",
      caller_name: data.state.callerName,
    };
    // Deterministic — no Groq call needed to know the final intent, the
    // AgentState already tells us whether an appointment or escalation happened.
    let intent = "UNKNOWN";

    try {
      const { summariseCall, deriveIntent } = await import("./receptionist.server");
      meta = await summariseCall(data.history, data.state);
      intent = deriveIntent([], data.state);
    } catch (e) {
      console.error("endCall: summary generation failed, using fallback summary", e);
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("call_records").insert({
        call_id: data.callId,
        caller_name: meta.caller_name,
        phone: data.state.phone,
        email: data.state.email,
        intent,
        transcript: JSON.stringify(data.history),
        summary: meta.summary,
        outcome: meta.outcome,
        appointment_required: Boolean(data.state.appointmentId),
        appointment_id: data.state.appointmentId,
        escalated: data.state.escalated,
        escalation_reason: data.state.escalationReason,
        duration_seconds: data.duration,
      });
      if (error) {
        console.error("call record insert failed", error);
        return {
          ok: true as const,
          summary: meta.summary,
          outcome: meta.outcome,
          saved: false as const,
        };
      }
      return {
        ok: true as const,
        summary: meta.summary,
        outcome: meta.outcome,
        saved: true as const,
      };
    } catch (e) {
      // Supabase unreachable/misconfigured: never claim the call was saved.
      console.error("endCall: could not persist call record", e);
      return {
        ok: true as const,
        summary: meta.summary,
        outcome: meta.outcome,
        saved: false as const,
      };
    }
  });

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [calls, appts] = await Promise.all([
      supabaseAdmin
        .from("call_records")
        .select("id, created_at, caller_name, intent, summary, outcome, escalated, duration_seconds")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("appointments")
        .select(
          "id, caller_name, department, appointment_date, appointment_time, purpose, status, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (calls.error) console.error("getDashboard: call_records query failed", calls.error);
    if (appts.error) console.error("getDashboard: appointments query failed", appts.error);
    const rows = calls.data ?? [];
    return {
      calls: rows,
      appointments: appts.data ?? [],
      stats: {
        total: rows.length,
        resolved: rows.filter((c) => !c.escalated).length,
        appointments: (appts.data ?? []).length,
        escalated: rows.filter((c) => c.escalated).length,
      },
      error: calls.error || appts.error ? "Some data could not be loaded from Supabase." : null,
    };
  } catch (e) {
    console.error("getDashboard failed", e);
    return {
      calls: [],
      appointments: [],
      stats: { total: 0, resolved: 0, appointments: 0, escalated: 0 },
      error: "Could not connect to Supabase. Check your Supabase configuration.",
    };
  }
});

export const listFaq = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("company_faq")
      .select("id, category, question, answer")
      .order("created_at");
    if (error) console.error("listFaq failed", error);
    return data ?? [];
  } catch (e) {
    console.error("listFaq failed", e);
    return [];
  }
});

export const upsertFaq = createServerFn({ method: "POST" })
  .inputValidator((d: { id?: string; category: string; question: string; answer: string }) => d)
  .handler(async ({ data }) => {
    if (!data.category.trim() || !data.question.trim() || !data.answer.trim()) {
      return { ok: false as const, error: "All fields are required." };
    }
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const payload = { category: data.category, question: data.question, answer: data.answer };
      const { error } = data.id
        ? await supabaseAdmin.from("company_faq").update(payload).eq("id", data.id)
        : await supabaseAdmin.from("company_faq").insert(payload);
      if (error) return { ok: false as const, error: "Could not save the entry." };
      return { ok: true as const };
    } catch (e) {
      console.error("upsertFaq failed", e);
      return { ok: false as const, error: "Could not connect to the database right now." };
    }
  });

export const deleteFaq = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("company_faq").delete().eq("id", data.id);
      return { ok: !error };
    } catch (e) {
      console.error("deleteFaq failed", e);
      return { ok: false as const };
    }
  });
