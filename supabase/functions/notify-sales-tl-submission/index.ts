import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const submissionId = String(body.submission_id || "");
    const reviewToken = String(body.review_token || "");
    const reviewUrl = String(body.review_url || "");
    const applicantUrl = String(body.applicant_url || "");

    if (!submissionId || !reviewToken || !reviewUrl) {
      return json({ error: "Missing submission details" }, 400);
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = requiredEnv("RESEND_API_KEY");
    const notifyTo = Deno.env.get("NOTIFY_TO") || "dan@emersoncoaching.com.au";
    const notifyFrom = Deno.env.get("NOTIFY_FROM") || "Dan at Emerson Coaching <dan@emersoncoaching.com.au>";
    const replyTo = Deno.env.get("REPLY_TO") || "dan@emersoncoaching.com.au";

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: submission, error } = await supabase
      .from("sales_tl_scenario_submissions")
      .select("id,candidate_name,candidate_email,review_token,notification_sent_at")
      .eq("id", submissionId)
      .eq("review_token", reviewToken)
      .maybeSingle();

    if (error) throw error;
    if (!submission) return json({ error: "Submission not found" }, 404);

    if (submission.notification_sent_at) {
      return json({ ok: true, skipped: "already-notified" });
    }

    const subject = `New Sales TL scenario response: ${submission.candidate_name}`;
    const text = [
      "A new Sales Team Leader scenario response has been submitted.",
      "",
      `Name: ${submission.candidate_name}`,
      `Email: ${submission.candidate_email}`,
      "",
      `Review URL: ${reviewUrl}`,
      applicantUrl ? `Applicant saved URL: ${applicantUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #23211e;">
        <h2>New Sales TL scenario response</h2>
        <p><strong>Name:</strong> ${escapeHtml(submission.candidate_name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(submission.candidate_email)}</p>
        <p><a href="${escapeAttr(reviewUrl)}">Open private review page</a></p>
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: notifyFrom,
        to: [notifyTo],
        reply_to: replyTo,
        subject,
        text,
        html,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      await supabase
        .from("sales_tl_scenario_submissions")
        .update({ notification_error: errorText.slice(0, 1000) })
        .eq("id", submissionId);
      return json({ error: errorText }, 502);
    }

    await supabase
      .from("sales_tl_scenario_submissions")
      .update({ notification_sent_at: new Date().toISOString(), notification_error: null })
      .eq("id", submissionId);

    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || "Unexpected error" }, 500);
  }
});

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

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
