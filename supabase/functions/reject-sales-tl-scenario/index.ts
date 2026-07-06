import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STARHIRE_API_BASE = "https://api.starhire.io/api/v1";
const DEFAULT_SALES_TL_POSITION_ID = "293";
const REJECTED_STAGE_TITLE = "Rejected";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let submissionForError: { id: string } | null = null;

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
      .select(
        [
          "id",
          "candidate_name",
          "candidate_email",
          "starhire_candidate_id",
          "responses",
          "scenario_version",
          "created_at",
          "review_status",
          "starhire_rejected_at",
        ].join(",")
      )
      .eq("review_token", reviewToken)
      .maybeSingle();

    if (submissionError) throw submissionError;
    const submission = submissionRow as Record<string, unknown> | null;
    if (!submission) return json({ error: "Review response not found." }, 404);
    const submissionId = String(submission.id || "");
    submissionForError = { id: submissionId };

    const candidateId = String(submission.starhire_candidate_id || "").trim();
    if (!/^\d+$/.test(candidateId)) {
      throw clientError("This response does not have a valid StarHire candidate ID, so StarHire was not changed.");
    }

    const rejectedStage = await findRejectedStage(starhireApiKey, positionId);
    const candidate = unwrapCandidate(
      await starhireRequest(starhireApiKey, `/candidates/${encodeURIComponent(candidateId)}`)
    );

    assertCandidateMatchesSubmission(candidate, submission);

    const currentStageId = readStageId(candidate);
    const currentStageTitle = readStageTitle(candidate);
    const alreadyRejected =
      String(currentStageId || "") === String(rejectedStage.id) || currentStageTitle === REJECTED_STAGE_TITLE;

    if (!alreadyRejected) {
      const movedCandidate = unwrapCandidate(
        await starhireRequest(starhireApiKey, `/candidates/${encodeURIComponent(candidateId)}/stage`, {
          method: "PATCH",
          body: new URLSearchParams({ stage_id: String(rejectedStage.id) }),
        })
      );

      const movedStageId = readStageId(movedCandidate);
      const movedStageTitle = readStageTitle(movedCandidate);
      if (String(movedStageId || "") !== String(rejectedStage.id) && movedStageTitle !== REJECTED_STAGE_TITLE) {
        throw upstreamError("StarHire did not confirm the candidate was moved to Rejected.");
      }
    }

    const now = new Date().toISOString();
    const { data: updatedSubmission, error: updateError } = await supabase
      .from("sales_tl_scenario_submissions")
      .update({
        review_status: "rejected",
        reviewed_at: now,
        starhire_rejected_at: now,
        starhire_reject_verified_at: now,
        starhire_rejected_stage_id: String(rejectedStage.id),
        starhire_reject_error: null,
      })
      .eq("id", submissionId)
      .select(
        [
          "candidate_name",
          "candidate_email",
          "starhire_candidate_id",
          "created_at",
          "responses",
          "scenario_version",
          "review_status",
          "reviewed_at",
          "starhire_rejected_at",
          "starhire_reject_verified_at",
          "starhire_rejected_stage_id",
          "starhire_reject_error",
        ].join(",")
      )
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updatedSubmission) throw new Error("Rejected response could not be reloaded.");

    return json({
      ok: true,
      already_rejected: alreadyRejected,
      starhire_stage_id: String(rejectedStage.id),
      submission: updatedSubmission,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const status = readStatus(error);

    if (submissionForError) {
      try {
        const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
        await supabase
          .from("sales_tl_scenario_submissions")
          .update({ starhire_reject_error: message.slice(0, 1000) })
          .eq("id", submissionForError.id);
      } catch {
        // Preserve the original error for the dashboard.
      }
    }

    return json({ error: message }, status);
  }
});

async function findRejectedStage(starhireApiKey: string, positionId: string) {
  const payload = await starhireRequest(starhireApiKey, `/positions/${encodeURIComponent(positionId)}/stages`);
  const stages = Array.isArray(payload.stages) ? payload.stages : [];
  const stage = stages.find((item) => String(item.title || "").trim() === REJECTED_STAGE_TITLE);
  if (!stage || !stage.id) {
    throw upstreamError(`StarHire stage "${REJECTED_STAGE_TITLE}" was not found for Sales Team Leader.`);
  }
  return stage;
}

async function starhireRequest(
  apiKey: string,
  path: string,
  options: { method?: string; body?: URLSearchParams } = {}
) {
  const response = await fetch(`${STARHIRE_API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: options.body,
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

function unwrapCandidate(payload: Record<string, unknown>) {
  return (payload.candidate && typeof payload.candidate === "object" ? payload.candidate : payload) as Record<
    string,
    unknown
  >;
}

function assertCandidateMatchesSubmission(candidate: Record<string, unknown>, submission: Record<string, unknown>) {
  const starhireEmail = String(candidate.email || "").trim().toLowerCase();
  const submittedEmail = String(submission.candidate_email || "").trim().toLowerCase();

  if (starhireEmail && submittedEmail && starhireEmail !== submittedEmail) {
    throw clientError(
      `StarHire candidate email (${starhireEmail}) does not match this response (${submittedEmail}), so StarHire was not changed.`
    );
  }
}

function readStageId(candidate: Record<string, unknown>) {
  if (candidate.stage_id) return candidate.stage_id;
  const stage = candidate.stage;
  if (stage && typeof stage === "object" && "id" in stage) return (stage as { id?: unknown }).id;
  return null;
}

function readStageTitle(candidate: Record<string, unknown>) {
  const stage = candidate.stage;
  if (stage && typeof stage === "object" && "title" in stage) return String((stage as { title?: unknown }).title || "");
  return "";
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
