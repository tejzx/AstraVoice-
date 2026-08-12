import { createFileRoute } from "@tanstack/react-router";

// Server URL for the Vapi assistant (see /vapi-assistant-config for the JSON to
// paste into the Vapi dashboard). Vapi POSTs every call event here: tool calls
// during the conversation, and one end-of-call-report when it hangs up.
export const Route = createFileRoute("/api/vapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Verify this request actually came from Vapi. Vapi sends the value you
        // configure in the assistant's server.secret field back as this header.
        const expected = process.env["VAPI_WEBHOOK_SECRET"];
        const got = request.headers.get("x-vapi-secret");
        if (!expected) {
          console.error("vapi-webhook: VAPI_WEBHOOK_SECRET is not configured");
          return Response.json({ error: "Webhook not configured" }, { status: 500 });
        }
        if (got !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const message = body?.message;
        const type = message?.type as string | undefined;

        try {
          const { handleVapiToolCalls, handleVapiEndOfCall } = await import("@/lib/vapi.server");

          if (type === "tool-calls") {
            const result = await handleVapiToolCalls(message);
            return Response.json(result);
          }

          if (type === "end-of-call-report") {
            await handleVapiEndOfCall(message);
            return Response.json({ ok: true });
          }

          // All other event types (status-update, transcript, speech-update,
          // etc.) are informational — acknowledge and ignore.
          return Response.json({ ok: true });
        } catch (e) {
          console.error("vapi-webhook: handler failed", e);
          // Never leak internals to a webhook caller; 200 with an error result
          // for tool-calls so Vapi speaks a graceful fallback instead of a raw
          // failure, per Vapi's own guidance (a 500 makes it say something odd).
          if (type === "tool-calls") {
            return Response.json({
              results: (message?.toolCallList ?? []).map((c: any) => ({
                name: c.name,
                toolCallId: c.id,
                result: JSON.stringify({
                  error:
                    "Something went wrong on our end. Offer to connect the caller with a team member.",
                }),
              })),
            });
          }
          return Response.json({ ok: false }, { status: 200 });
        }
      },
    },
  },
});
