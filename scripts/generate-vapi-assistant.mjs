// Generates vapi-assistant.json from the SAME tool definitions and system
// prompt used by the browser/Groq flow, so the Vapi assistant can never drift
// out of sync with what receptionist.server.ts actually implements.
//
// Usage: npx tsx scripts/generate-vapi-assistant.mjs [serverUrl]
import { writeFileSync } from "node:fs";

const { tools, SYSTEM_PROMPT } = await import("../src/lib/receptionist.server.ts");

const serverUrl = process.argv[2] || "https://REPLACE-WITH-YOUR-PUBLIC-URL/api/vapi-webhook";
const secret = process.env.VAPI_WEBHOOK_SECRET || "REPLACE-WITH-A-RANDOM-SECRET";

// Vapi's assistant format takes flat function definitions (name/description/
// parameters), not the OpenAI-style {type:"function", function:{...}} wrapper
// receptionist.server.ts uses for Groq — unwrap here.
const functions = tools.map((t) => t.function);

const assistant = {
  name: "AstraVoice",
  firstMessage: "Thank you for calling AstraVoice. This is the AI receptionist. How can I help you today?",
  model: {
    provider: "openai",
    model: "gpt-4o",
    messages: [{ role: "system", content: SYSTEM_PROMPT }],
    functions,
  },
  voice: {
    provider: "vapi",
    voiceId: "Neha",
  },
  server: {
    url: serverUrl,
    secret,
  },
  recordingEnabled: true,
};

writeFileSync("vapi-assistant.json", JSON.stringify(assistant, null, 2));
console.log("Wrote vapi-assistant.json");
console.log(`Tool functions included: ${functions.map((f) => f.name).join(", ")}`);
