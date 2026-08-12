type Msg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
};

export const REASONING_MODEL = "llama-3.3-70b-versatile";
export const FAST_MODEL = "llama-3.1-8b-instant";

const GROQ_TIMEOUT_MS = 12_000;

export async function groqChat(body: {
  model: string;
  messages: Msg[];
  tools?: unknown[];
  temperature?: number;
  max_tokens?: number;
}): Promise<any> {
  const key = process.env["GROQ_API_KEY"];
  if (!key) throw new Error("Missing GROQ_API_KEY");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ temperature: 0.3, ...body }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("TIMEOUT");
    throw new Error("NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("RATE_LIMIT");

    // Groq sometimes emits a malformed tool call; recover it instead of failing the turn.
    const recovered = recoverToolCall(text);
    if (recovered) return recovered;

    throw new Error(`Groq error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function recoverToolCall(errorBody: string): any | null {
  try {
    const parsed = JSON.parse(errorBody);
    const failed: string | undefined = parsed?.error?.failed_generation;
    if (parsed?.error?.code !== "tool_use_failed" || !failed) return null;
    const match = failed.match(/<function=([a-z_]+)\s*(\{[\s\S]*?\})\s*<\/function>/i);
    if (!match) return null;
    JSON.parse(match[2]!);
    return {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: `recovered_${Date.now()}`,
                type: "function",
                function: { name: match[1], arguments: match[2] },
              },
            ],
          },
        },
      ],
    };
  } catch {
    return null;
  }
}
