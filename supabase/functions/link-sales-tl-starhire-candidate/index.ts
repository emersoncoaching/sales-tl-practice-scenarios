import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STARHIRE_API_BASE = "https://api.starhire.io/api/v1";
const DEFAULT_SALES_TL_POSITION_ID = "293";
const POSITION_LABEL = "Sales Team Leader";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const reviewToken = String(body.review_token || "").trim();

    if (!reviewToken) {
      return json({ error: "Missing review token." }, 400);
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const starhireApiKey = requiredEnv("STARHIRE_API_KEY");
    const positionId = Deno.env.get("STARHIRE_SALES_TL_POSITION_ID") || DEFAULT_SALES_TL_POSITION_ID;

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: submissionRow, error: submissionError } = await supabase
      .from("sales_tl_scenario_submissions")
      .select("id,candidate_name,candidate_email,starhire_candidate_id,created_at,responses,scenario_version,review_status,reviewed_at,starhire_rejected_at,starhire_reject_verified_at,starhire_rejected_stage_id,starhire_reject_error")
      .eq("review_token", reviewToken)
      .maybeSingle();

    if (submissionError) throw submissionError;
    const submission = submissionRow as Record<string, unknown> | null;
    if (!submission) return json({ error: "Review response not found." }, 404);

    const storedCandidateId = String(submission.starhire_candidate_id || "").trim();
    if (/^\d+$/.test(storedCandidateId)) {
      return json({ ok: true, linked: false, submission });
    }

    const candidateId = await resolveCandidateId(starhireApiKey, positionId, submission);
    const { data: updatedSubmission, error: updateError } = await supabase
      .from("sales_tl_scenario_submissions")
      .update({ starhire_candidate_id: candidateId, starhire_reject_error: null })
      .eq("id", String(submission.id || ""))
      .select("candidate_name,candidate_email,starhire_candidate_id,created_at,responses,scenario_version,review_status,reviewed_at,starhire_rejected_at,starhire_reject_verified_at,starhire_rejected_stage_id,starhire_reject_error")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updatedSubmission) throw new Error("Linked response could not be reloaded.");

    return json({ ok: true, linked: true, submission: updatedSubmission });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ error: message }, readStatus(error));
  }
});

async function resolveCandidateId(
  starhireApiKey: string,
  positionId: string,
  submission: Record<string, unknown>
) {
  const submittedEmail = String(submission.candidate_email || "").trim().toLowerCase();
  if (!submittedEmail) {
    throw clientError("This response has no StarHire candidate ID or email.");
  }

  const matches = await findCandidatesByEmail(starhireApiKey, positionId, submittedEmail);
  if (matches.length === 0) {
    throw clientError(`No ${POSITION_LABEL} StarHire candidate matched ${submittedEmail}.`);
  }
  if (matches.length > 1) {
    throw clientError(`More than one ${POSITION_LABEL} StarHire candidate matched ${submittedEmail}.`);
  }

  return String(matches[0].id);
}

async function findCandidatesByEmail(starhireApiKey: string, positionId: string, email: string) {
  const candidates = await listPositionCandidates(starhireApiKey, positionId);
  return candidates.filter((candidate) => String(candidate.email || "").trim().toLowerCase() === email);
}

async function listPositionCandidates(starhireApiKey: string, positionId: string) {
  const candidates: Array<Record<string, unknown>> = [];
  let offset = 0;

  while (true) {
    const payload = await starhireRequest(
      starhireApiKey,
      `/positions/${encodeURIComponent(positionId)}/candidates?limit=100&offset=${offset}`
    );
    const batch = Array.isArray(payload.candidates) ? payload.candidates : [];
    candidates.push(...batch);

    const meta = payload.meta && typeof payload.meta === "object" ? (payload.meta as Record<string, unknown>) : {};
    const limit = Number(meta.limit || 100);
    const total = Number(meta.total || candidates.length);
    if (!Number.isFinite(limit) || !Number.isFinite(total) || offset + limit >= total) return candidates;
    offset += limit;
  }
}

async function starhireRequest(apiKey: string, path: string) {
  const response = await fetch(`${STARHIRE_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
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

  if (!response.ok) {
    const detail = typeof payload.error === "string" ? payload.error : text || response.statusText;
    throw upstreamError(`StarHire request failed: ${String(detail).slice(0, 500)}`);
  }

  return payload;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function clientError(message: string) {
  return withStatus(new Error(message), 400);
}

function upstreamError(message: string) {
  return withStatus(new Error(message), 502);
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
