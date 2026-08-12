// Handles events from Vapi's Server URL webhook (real phone calls), reusing the
// exact same knowledge-base/contacts/appointment logic as the browser demo in
// receptionist.server.ts — this is the one source of truth for both channels.
import { searchFaq, checkContact, insertAppointmentRow } from "./receptionist.server";

type VapiToolCall = {
  id: string;
  name: string;
  parameters: Record<string, any>;
};

type VapiMessage = {
  type: string;
  call?: { id?: string; customer?: { number?: string } };
  toolCallList?: VapiToolCall[];
  endedReason?: string;
  artifact?: {
    transcript?: string;
    messages?: { role: string; message: string }[];
  };
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Upserts a partial call_records row as the call progresses (e.g. as soon as an
// escalation or appointment happens), and again with the final summary at
// end-of-call. Never throws — a failed save should never break the live call.
async function upsertCallRecord(callId: string, patch: Record<string, any>) {
  try {
    const db = await admin();
    const { error } = await db
      .from("call_records")
      .upsert({ call_id: callId, ...patch }, { onConflict: "call_id" });
    if (error) console.error("vapi: upsertCallRecord failed", error);
  } catch (e) {
    console.error("vapi: upsertCallRecord threw", e);
  }
}

// Handles a "tool-calls" webhook event. Returns the exact shape Vapi expects
// back: { results: [{ toolCallId, name, result }] }.
export async function handleVapiToolCalls(message: VapiMessage) {
  const callId = message.call?.id ?? "unknown";
  const calls = message.toolCallList ?? [];
  const results: { name: string; toolCallId: string; result: string }[] = [];

  for (const call of calls) {
    const args = call.parameters ?? {};
    let result: unknown;

    try {
      if (call.name === "search_faq") {
        result = await searchFaq(args["query"]);
      } else if (call.name === "check_contact") {
        result = await checkContact(args["department"]);
      } else if (call.name === "create_appointment") {
        // Vapi's own model is instructed (via the shared system prompt) to only
        // set confirmed:true after reading details back and getting an explicit
        // yes — we don't have transcript-level access here to double check the
        // way the browser/Groq flow does, so this boolean is the trust boundary.
        if (args["confirmed"] !== true) {
          result = {
            success: false,
            reason: "not_confirmed",
            note: "Read the full appointment details back to the caller and wait for an explicit yes before calling this tool again.",
          };
        } else {
          const out = await insertAppointmentRow(args);
          if ((out as any).success) {
            await upsertCallRecord(callId, {
              caller_name: args["caller_name"] ?? null,
              phone: args["phone"] ?? null,
              email: args["email"] ?? null,
              appointment_required: true,
              appointment_id: (out as any).appointment_id,
            });
          }
          result = out;
        }
      } else if (call.name === "create_escalation") {
        await upsertCallRecord(callId, {
          escalated: true,
          escalation_reason: args["reason"] ?? "Caller requested human assistance",
          caller_name: args["caller_name"] ?? null,
          phone: args["phone"] ?? null,
          email: args["email"] ?? null,
        });
        result = {
          success: true,
          note: "Escalation recorded. A team member will follow up.",
          department: args["department"] ?? "General",
        };
      } else {
        result = { error: "unknown tool" };
      }
    } catch (e) {
      console.error(`vapi: tool ${call.name} threw`, e);
      result = {
        error:
          "Tool execution failed. Let the caller know and offer to connect them with a team member.",
      };
    }

    results.push({ name: call.name, toolCallId: call.id, result: JSON.stringify(result) });
  }

  return { results };
}

// Handles the "end-of-call-report" event — finalizes the one call_records row
// for this call with the transcript and duration Vapi provides.
export async function handleVapiEndOfCall(message: VapiMessage) {
  const callId = message.call?.id ?? "unknown";
  const transcriptText = message.artifact?.transcript ?? "";
  const messages = message.artifact?.messages ?? [];

  const summary = summariseFromMessages(messages);

  await upsertCallRecord(callId, {
    intent: "UNKNOWN", // Vapi calls don't go through our Groq intent classifier; left for manual review
    transcript: transcriptText || JSON.stringify(messages),
    summary,
    outcome: message.endedReason === "hangup" ? "Resolved" : (message.endedReason ?? "Resolved"),
    phone: message.call?.customer?.number ?? null,
  });
}

// Lightweight local summary (no extra Groq call needed — Vapi already gives us
// the transcript). Keeps this webhook fast and free of another network hop.
function summariseFromMessages(messages: { role: string; message: string }[]): string {
  if (messages.length === 0) return "Call ended with no recorded conversation.";
  const userLines = messages.filter((m) => m.role === "user").map((m) => m.message);
  if (userLines.length === 0) return "Call ended before the caller said anything.";
  const preview = userLines.slice(0, 2).join(" ").slice(0, 240);
  return `Caller said: ${preview}${preview.length === 240 ? "…" : ""}`;
}
