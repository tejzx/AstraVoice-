import { groqChat, REASONING_MODEL, FAST_MODEL } from "./groq.server";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export const INTENTS = [
  "GENERAL_ENQUIRY",
  "COMPANY_INFORMATION",
  "SERVICES",
  "OFFICE_LOCATION",
  "WORKING_HOURS",
  "CONTACT_INFORMATION",
  "CAREER_ENQUIRY",
  "APPOINTMENT_REQUEST",
  "HUMAN_SUPPORT",
  "GREETING",
  "THANKS",
  "GOODBYE",
  "HELP",
  "SMALL_TALK",
  "UNKNOWN",
] as const;

// ---- Fast conversation layer -------------------------------------------------
// Deterministic, regex-based classification for common conversational turns.
// These never touch Groq or the knowledge base, so a "hi" or "thanks" can never
// be misrouted into a DB search and can never trigger the "I don't have that
// information" fallback. Only whole-message matches are accepted (not "contains")
// so a compound message like "hi, where's the office" correctly falls through to
// the full agent instead of being short-circuited.
export type FastIntent = "GREETING" | "THANKS" | "GOODBYE" | "HELP" | "SMALL_TALK";

const FAST_PATTERNS: [FastIntent, RegExp][] = [
  [
    "GREETING",
    /^(hi+|hey+|hello+|yo|good\s?(morning|afternoon|evening|day)|greetings|namaste)[\s!.,]*$/i,
  ],
  [
    "THANKS",
    /^(thanks?( you)?( so much| a lot| a ton)?|thank\s?you|thx|ty|much appreciated|that'?s helpful|appreciate it)[\s!.,]*$/i,
  ],
  [
    "GOODBYE",
    /^((good)?bye+|goodbye|see\s?you( later| soon)?|that'?s all( for now)?|i don'?t need anything else|no(thing)? else|have a (good|great) (day|one)|talk to you later)[\s!.,]*$/i,
  ],
  ["HELP", /^(help|what can you do\??|how can you help( me)?\??|what do you do\??)[\s!.,]*$/i],
  [
    "SMALL_TALK",
    /^(how are you( doing)?\??|are you (a )?(robot|bot|human|ai)\??|who are you\??|what'?s your name\??)[\s!.,]*$/i,
  ],
];

const FAST_REPLIES: Record<FastIntent, string> = {
  GREETING: "Hello! Welcome to AstraVoice. How can I help you today?",
  THANKS: "You're welcome! Is there anything else I can help you with?",
  GOODBYE: "You're welcome. Have a great day!",
  HELP: "I can help with general company information, appointments, enquiries, and connecting you with the appropriate team.",
  SMALL_TALK:
    "I'm AstraVoice, an AI voice receptionist. I can help with enquiries, appointments and connecting you with the right team.",
};

export function detectFastIntent(text: string): FastIntent | null {
  const trimmed = (text || "").trim();
  if (!trimmed || trimmed.split(/\s+/).length > 6) return null;
  for (const [intent, pattern] of FAST_PATTERNS) {
    if (pattern.test(trimmed)) return intent;
  }
  return null;
}

export function fastReply(intent: FastIntent): string {
  return FAST_REPLIES[intent];
}

const SYSTEM_PROMPT = `You are an AI voice receptionist for AstraVoice.

Rules:
- Greet politely, stay professional, friendly, concise and natural.
- This is a VOICE conversation: keep replies to 1-2 short sentences, ask ONE question at a time.
- NEVER invent company information. Company facts must come from the search_faq tool.
- If search_faq returns nothing relevant, say: "I don't currently have that information available. Would you like me to connect you with a member of our team?"
- For appointments: collect name, phone, email, department, date, time and purpose one at a time. Do not re-ask for details already given. Repeat the full details back and get an explicit confirmation BEFORE calling create_appointment. Only say the appointment is booked after the tool returns success.
- Always collect the purpose of an appointment, then read back name, department, date, time and purpose and wait for an explicit yes. Only then call create_appointment with confirmed set to true.
- Dates must be passed to tools as YYYY-MM-DD and times as HH:MM (24-hour).
- If the caller wants a human, briefly ask the reason, use check_contact for the department, then call create_escalation and explain the next step.
- Do not output markdown, emojis, lists or special characters; output plain speech text only.`;

const tools = [
  {
    type: "function",
    function: {
      name: "search_faq",
      description: "Search the approved company knowledge base for factual company information.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "What the caller asked about" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_contact",
      description: "Look up staff and availability for a department (HR, Admissions, Support).",
      parameters: {
        type: "object",
        properties: { department: { type: "string" } },
        required: ["department"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_appointment",
      description: "Create an appointment. Only call after the caller confirms the details.",
      parameters: {
        type: "object",
        properties: {
          caller_name: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          department: { type: "string" },
          appointment_date: { type: "string", description: "YYYY-MM-DD" },
          appointment_time: { type: "string", description: "HH:MM 24-hour" },
          purpose: { type: "string" },
          confirmed: {
            type: "boolean",
            description:
              "True only after you read all details back and the caller explicitly agreed.",
          },
        },
        required: [
          "caller_name",
          "department",
          "appointment_date",
          "appointment_time",
          "purpose",
          "confirmed",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_escalation",
      description: "Record a human hand-off / callback request.",
      parameters: {
        type: "object",
        properties: {
          caller_name: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          department: { type: "string" },
          reason: { type: "string" },
        },
        required: ["reason"],
      },
    },
  },
];

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ---- Deterministic tool implementations -------------------------------------

async function searchFaq(query: string) {
  const db = await admin();
  const { data, error } = await db.from("company_faq").select("category, question, answer");
  if (error) return { error: "Knowledge base unavailable" };
  const words = (query || "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const scored = (data ?? [])
    .map((row) => {
      const hay = `${row.category} ${row.question} ${row.answer}`.toLowerCase();
      const score = words.reduce((n, w) => (hay.includes(w) ? n + 1 : n), 0);
      return { row, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => r.row);
  return scored.length
    ? { results: scored }
    : { results: [], note: "No matching approved information found." };
}

async function checkContact(department: string) {
  const db = await admin();
  const { data, error } = await db
    .from("contacts")
    .select("name, department, role, availability")
    .ilike("department", `%${department ?? ""}%`);
  if (error) return { error: "Contact directory unavailable" };
  if (!data || data.length === 0)
    return { found: false, note: "No contact found for that department." };
  return {
    found: true,
    contacts: data,
    any_available: data.some((c) => c.availability === "Available"),
  };
}

function validateAppointment(a: Record<string, any>) {
  const errors: string[] = [];
  if (!a["caller_name"]) errors.push("caller name is missing");
  if (!a["department"]) errors.push("department is missing");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a["appointment_date"] ?? ""))
    errors.push("date is invalid, use YYYY-MM-DD");
  if (!/^\d{2}:\d{2}$/.test(a["appointment_time"] ?? "")) errors.push("time is invalid, use HH:MM");
  if (errors.length === 0) {
    const d = new Date(`${a["appointment_date"]}T${a["appointment_time"]}:00`);
    if (Number.isNaN(d.getTime())) errors.push("date or time is not a real calendar value");
    const [h, m] = (a["appointment_time"] as string).split(":").map(Number);
    const mins = (h ?? 0) * 60 + (m ?? 0);
    if (mins < 570 || mins > 1110) errors.push("time is outside office hours (9:30 AM to 6:30 PM)");
    if (d.getDay() === 0 || d.getDay() === 6) errors.push("the office is closed on weekends");
  }
  return errors;
}

const AFFIRMATIVE =
  /\b(yes|yeah|yep|correct|confirm|confirmed|book it|go ahead|sure|right|please do|that'?s right|ok|okay)\b/i;

async function createAppointment(a: Record<string, any>, lastUserMessage: string) {
  if (!a["purpose"]) {
    return {
      success: false,
      reason: "missing_purpose",
      note: "Ask the caller the purpose of the appointment first.",
    };
  }
  if (a["confirmed"] !== true || !AFFIRMATIVE.test(lastUserMessage)) {
    return {
      success: false,
      reason: "not_confirmed",
      note: "Read the full appointment details back to the caller and wait for an explicit yes before calling this tool again.",
    };
  }
  const errors = validateAppointment(a);
  if (errors.length) return { success: false, validation_errors: errors };

  const db = await admin();
  const { data: clash } = await db
    .from("appointments")
    .select("id")
    .eq("department", a["department"])
    .eq("appointment_date", a["appointment_date"])
    .eq("appointment_time", `${a["appointment_time"]}:00`)
    .neq("status", "Cancelled");
  if (clash && clash.length > 0) {
    return {
      success: false,
      reason: "slot_taken",
      note: "That slot is already booked. Suggest a different time.",
    };
  }

  const { data, error } = await db
    .from("appointments")
    .insert({
      caller_name: a["caller_name"],
      phone: a["phone"] ?? null,
      email: a["email"] ?? null,
      department: a["department"],
      appointment_date: a["appointment_date"],
      appointment_time: a["appointment_time"],
      purpose: a["purpose"] ?? null,
      status: "Scheduled",
    })
    .select("id")
    .single();
  if (error || !data) return { success: false, reason: "database_error" };
  return { success: true, appointment_id: data.id, status: "Scheduled" };
}

// ---- Agent turn --------------------------------------------------------------

export type AgentState = {
  appointmentId: string | null;
  escalated: boolean;
  escalationReason: string | null;
  callerName: string | null;
  phone: string | null;
  email: string | null;
};

export async function runAgentTurn(history: ChatMessage[], state: AgentState) {
  const messages: any[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\nToday's date is ${new Date().toISOString().slice(0, 10)}.`,
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const lastUserMessage = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const actions: string[] = [];
  const next = { ...state };

  for (let step = 0; step < 6; step++) {
    const res = await groqChat({
      model: REASONING_MODEL,
      messages,
      tools,
      temperature: 0.3,
      max_tokens: 400,
    });
    const msg = res.choices?.[0]?.message;
    if (!msg) break;
    messages.push(msg);

    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) {
      return { reply: (msg.content ?? "").trim(), actions, state: next };
    }

    for (const call of calls) {
      const name = call.function?.name as string;
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }
      let result: unknown;

      if (name === "search_faq") result = await searchFaq(args["query"]);
      else if (name === "check_contact") result = await checkContact(args["department"]);
      else if (name === "create_appointment") {
        const out = await createAppointment(args, lastUserMessage);
        if ((out as any).success) {
          next.appointmentId = (out as any).appointment_id;
          next.callerName = next.callerName ?? args["caller_name"] ?? null;
          next.phone = next.phone ?? args["phone"] ?? null;
          next.email = next.email ?? args["email"] ?? null;
        }
        result = out;
      } else if (name === "create_escalation") {
        next.escalated = true;
        next.escalationReason = args["reason"] ?? "Caller requested human assistance";
        next.callerName = next.callerName ?? args["caller_name"] ?? null;
        next.phone = next.phone ?? args["phone"] ?? null;
        next.email = next.email ?? args["email"] ?? null;
        result = {
          success: true,
          note: "Escalation recorded. A team member will follow up.",
          department: args["department"] ?? "General",
        };
      } else result = { error: "unknown tool" };

      actions.push(name);
      messages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify(result) });
    }
  }

  return {
    reply:
      "I'm sorry, I wasn't able to complete that request right now. I can record your request and arrange for a team member to follow up.",
    actions,
    state: next,
  };
}

export async function detectIntent(history: ChatMessage[]) {
  const convo = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Caller" : "Agent"}: ${m.content}`)
    .join("\n");
  try {
    const res = await groqChat({
      model: FAST_MODEL,
      temperature: 0,
      max_tokens: 12,
      messages: [
        {
          role: "system",
          content: `Classify the caller's current intent. Reply with exactly one of: ${INTENTS.join(", ")}. No other text.`,
        },
        { role: "user", content: convo },
      ],
    });
    const raw = (res.choices?.[0]?.message?.content ?? "").trim().toUpperCase();
    return (INTENTS as readonly string[]).includes(raw) ? raw : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

export async function summariseCall(history: ChatMessage[], state: AgentState) {
  const convo = history
    .map((m) => `${m.role === "user" ? "Caller" : "Agent"}: ${m.content}`)
    .join("\n");
  try {
    const res = await groqChat({
      model: FAST_MODEL,
      temperature: 0.2,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            'Summarise this receptionist call. Reply with JSON only: {"summary": "2 sentences max", "outcome": "Resolved" | "Appointment Scheduled" | "Escalated" | "Unresolved", "caller_name": string|null}',
        },
        { role: "user", content: convo },
      ],
    });
    const text = (res.choices?.[0]?.message?.content ?? "").trim();
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json);
    return {
      summary: String(parsed.summary ?? "").slice(0, 600),
      outcome: state.appointmentId
        ? "Appointment Scheduled"
        : state.escalated
          ? "Escalated"
          : String(parsed.outcome ?? "Resolved"),
      caller_name: state.callerName ?? (parsed.caller_name ? String(parsed.caller_name) : null),
    };
  } catch {
    return {
      summary: "Call transcript recorded; automatic summary unavailable.",
      outcome: state.appointmentId
        ? "Appointment Scheduled"
        : state.escalated
          ? "Escalated"
          : "Resolved",
      caller_name: state.callerName,
    };
  }
}
