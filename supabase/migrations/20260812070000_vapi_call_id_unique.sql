-- Required for the Vapi webhook: it upserts one call_records row per phone
-- call (first on tool calls during the call, then finalized at end-of-call),
-- keyed by call_id. Upsert needs a unique constraint to know what "conflict"
-- means.
CREATE UNIQUE INDEX IF NOT EXISTS call_records_call_id_key ON public.call_records (call_id);
