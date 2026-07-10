const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STARHIRE_API_BASE = "https://api.starhire.io/api/v1";
const DEFAULT_SALES_TL_POSITION_ID = "293";

// Looks up a StarHire candidate by ID so the practice-scenarios page can skip
// the identity form when someone arrives from their emailed link
// (?candidate_id={{candidate_id}}). The StarHire key stays server-side; the
// browser only ever receives the whitelisted fields below.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const candidateId = String(body.candidate_id || "").trim();
    if (!/^\d+$/.test(candidateId)) {
      return json({ error: "A numeric candidate_id is required." }, 400);
    }

    const starhireApiKey = requiredEnv("STARHIRE_API_KEY");
    const positionId =
      Deno.env.get("STARHIRE_SALES_TL_POSITION_ID") ||
      DEFAULT_SALES_TL_POSITION_ID;

    const candidate = await starhireRequest(
      starhireApiKey,
      `/candidates/${encodeURIComponent(candidateId)}`
    );
    const record =
      candidate && typeof candidate.candidate === "object"
        ? (candidate.candidate as Record<string, unknown>)
        : candidate;

    // Only resolve candidates that belong to this position, so the endpoint
    // cannot be used to read candidates from unrelated pipelines.
    if (String(record.position_id ?? "") !== String(positionId)) {
      return json({ error: "Candidate not found." }, 404);
    }

    const name =
      String(record.full_name || "").trim() ||
      `${String(record.first_name || "").trim()} ${String(record.last_name || "").trim()}`.trim();

    return json({
      ok: true,
      candidate: {
        id: String(record.id ?? candidateId),
        name,
        email: String(record.email || "").trim(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ error: message }, readStatus(error));
  }
});

async function starhireRequest(apiKey: string, path: string) {
  const response = await fetch(`${STARHIRE_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (response.status === 404) {
    throw withStatus(new Error("Candidate not found."), 404);
  }
  if (!response.ok) {
    const detail = typeof payload.error === "string" ? payload.error : text || response.statusText;
    throw withStatus(new Error(`StarHire request failed: ${String(detail).slice(0, 500)}`), 502);
  }

  return payload;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function withStatus(error: Error, status: number) {
  return Object.assign(error, { status });
}

function readStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  return 500;
}
