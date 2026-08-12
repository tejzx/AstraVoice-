import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell, Card } from "@/components/AppShell";
import { useVoice, type VoiceErrorReason } from "@/lib/useVoice";
import { agentTurn, endCall } from "@/lib/receptionist.functions";

const VOICE_ERROR_MESSAGES: Record<VoiceErrorReason, string> = {
  "permission-denied":
    "Microphone access is unavailable. Please allow microphone permission or type your message below.",
  "no-speech": "Sorry, I didn't hear anything. Please try again.",
  "audio-capture":
    "I couldn't access your microphone. Check that it's connected and try again, or type your message below.",
  network:
    "Voice recognition lost its network connection. Please try again, or type your message below.",
  aborted: "",
  unsupported: "Voice input isn't supported in this browser. You can continue using text input.",
  unknown: "Something went wrong with voice input. Please try again, or type your message below.",
};

export const Route = createFileRoute("/voice-agent")({
  head: () => ({
    meta: [
      { title: "Voice Agent | AI Receptionist" },
      {
        name: "description",
        content:
          "Talk to the AI receptionist: ask company questions, book appointments, or reach a human.",
      },
      { property: "og:title", content: "Voice Agent | AI Receptionist" },
      {
        property: "og:description",
        content: "Live voice conversation with an AI receptionist powered by Groq.",
      },
    ],
  }),
  component: VoiceAgentPage,
});

type Msg = { role: "user" | "assistant"; content: string };
type Status = "READY" | "LISTENING" | "THINKING" | "RESPONDING" | "CALL COMPLETED";

const emptyState = {
  appointmentId: null as string | null,
  escalated: false,
  escalationReason: null as string | null,
  callerName: null as string | null,
  phone: null as string | null,
  email: null as string | null,
};

const GREETING =
  "Thank you for calling AstraVoice. This is the AI receptionist. How can I help you today?";

function VoiceAgentPage() {
  const turn = useServerFn(agentTurn);
  const finish = useServerFn(endCall);
  const { supported, listening, listen, stopListening, speak } = useVoice();

  const [status, setStatus] = useState<Status>("READY");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [intent, setIntent] = useState("—");
  const [duration, setDuration] = useState(0);
  const [inCall, setInCall] = useState(false);
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const stateRef = useRef({ ...emptyState });
  const messagesRef = useRef<Msg[]>([]);
  const callIdRef = useRef("");
  const startedAtRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Guards against overlapping turns (e.g. a voice result arriving while a typed
  // message is already being processed, or a double Send click).
  const busyRef = useRef(false);

  useEffect(() => {
    if (!inCall) return;
    const t = setInterval(
      () => setDuration(Math.floor((Date.now() - startedAtRef.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [inCall]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  const push = (m: Msg) => {
    messagesRef.current = [...messagesRef.current, m];
    setMessages(messagesRef.current);
  };

  const handleUtterance = useCallback(
    async (text: string) => {
      if (busyRef.current) return; // ignore overlapping submissions
      busyRef.current = true;
      setNotice(null);
      push({ role: "user", content: text });
      setStatus("THINKING");
      try {
        const res = await turn({
          data: {
            callId: callIdRef.current,
            history: messagesRef.current,
            state: stateRef.current,
          },
        });
        stateRef.current = res.state;
        setIntent(res.intent);
        push({ role: "assistant", content: res.reply });
        setStatus("RESPONDING");
        await speak(res.reply);
      } catch (e) {
        console.error("agent turn failed", e);
        push({
          role: "assistant",
          content:
            "I'm having trouble processing that request right now. You can try again, or type your message.",
        });
        setStatus("RESPONDING");
      } finally {
        busyRef.current = false;
      }
      startListening();
    },
    [turn, speak],
  );

  const startListening = useCallback(() => {
    if (!supported) {
      setStatus("READY");
      return;
    }
    if (busyRef.current) return;
    setStatus("LISTENING");
    listen(
      (text) => void handleUtterance(text),
      () => {
        setStatus("READY");
        setNotice("Sorry, I didn't hear anything. Please try again.");
      },
      (reason) => {
        setStatus("READY");
        const message = VOICE_ERROR_MESSAGES[reason];
        if (message) setNotice(message);
      },
    );
  }, [supported, listen, handleUtterance]);

  const startCall = async () => {
    callIdRef.current = `CALL-${Date.now()}`;
    startedAtRef.current = Date.now();
    stateRef.current = { ...emptyState };
    messagesRef.current = [];
    setMessages([]);
    setSummary(null);
    setNotice(null);
    setIntent("—");
    setDuration(0);
    setInCall(true);
    push({ role: "assistant", content: GREETING });
    setStatus("RESPONDING");
    await speak(GREETING);
    startListening();
  };

  const hangUp = async () => {
    // Stop all mic/speech activity first and unconditionally, so the call always
    // ends cleanly on the client even if saving the record below fails.
    stopListening();
    window.speechSynthesis?.cancel();
    setInCall(false);
    setStatus("CALL COMPLETED");
    try {
      const res = await finish({
        data: {
          callId: callIdRef.current,
          history: messagesRef.current,
          state: stateRef.current,
          duration: Math.floor((Date.now() - startedAtRef.current) / 1000),
        },
      });
      setSummary(res.summary ?? "No summary available for this call.");
      if (res.ok && !res.saved) {
        setNotice("Your interaction could not be saved to the call history right now.");
      }
    } catch (e) {
      console.error("endCall failed", e);
      setSummary("Call ended. A summary could not be generated right now.");
      setNotice("Your interaction could not be saved to the call history right now.");
    }
  };

  const sendTyped = async () => {
    const text = typed.trim();
    if (!text || !inCall || busyRef.current) return;
    setTyped("");
    stopListening();
    setNotice(null);
    await handleUtterance(text);
  };

  const mm = String(Math.floor(duration / 60)).padStart(2, "0");
  const ss = String(duration % 60).padStart(2, "0");

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Voice Agent</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Speak naturally. The agent understands your request, checks the database and replies out
        loud.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card className="flex min-h-[28rem] flex-col">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Press “Start Call” to begin the conversation.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {status === "THINKING" && (
              <p className="text-xs text-muted-foreground">Agent is thinking…</p>
            )}
          </div>

          {notice && <p className="mt-3 text-xs text-destructive">{notice}</p>}
          {!supported && (
            <p className="mt-3 text-xs text-destructive">
              Speech recognition isn’t supported in this browser. Use Chrome for voice, or type
              below.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            {!inCall ? (
              <button
                onClick={() => void startCall()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Start Call
              </button>
            ) : (
              <>
                <button
                  onClick={startListening}
                  disabled={listening || status === "THINKING"}
                  className="rounded-md border border-input px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {listening ? "Listening…" : "Listen"}
                </button>
                <button
                  onClick={() => void hangUp()}
                  className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90"
                >
                  End Call
                </button>
              </>
            )}
            <div className="flex flex-1 gap-2">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void sendTyped()}
                disabled={!inCall || status === "THINKING"}
                placeholder="Or type your message…"
                className="min-w-[10rem] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
              />
              <button
                onClick={() => void sendTyped()}
                disabled={!inCall || status === "THINKING" || !typed.trim()}
                className="rounded-md border border-input px-3 py-2 text-sm disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Agent status</p>
            <p className="mt-1 text-lg font-semibold">{listening ? "LISTENING" : status}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Detected intent</p>
            <p className="mt-1 font-mono text-sm">{intent}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Call duration</p>
            <p className="mt-1 font-mono text-lg">
              {mm}:{ss}
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Actions taken</p>
            <ul className="mt-1 space-y-1 text-sm">
              <li>Appointment: {stateRef.current.appointmentId ? "Created" : "—"}</li>
              <li>Escalated: {stateRef.current.escalated ? "Yes" : "No"}</li>
            </ul>
          </Card>
          {summary && (
            <Card>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Call summary</p>
              <p className="mt-1 text-sm">{summary}</p>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
