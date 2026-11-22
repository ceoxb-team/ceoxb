// Lets admins approve or decline membership applications (admin.html).
// Approving creates the account, emails an invite and grants the member role.
// Only signed-in admins can use it; everything else is refused.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Where the invite link sends new members to choose a password. SITE_URL is
// a server-side secret (the public site), never the admin's own browser.
const setPasswordUrl =
  (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "") +
  "/onboarding_files/set-password.html";

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return reply(405, { error: "Method not allowed." });
  }

  if (!Deno.env.get("SITE_URL")) {
    console.error("SITE_URL is not set.");
    return reply(500, { error: "Approvals aren't set up yet." });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Who is calling, and are they an admin?
  const token = (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token);
  const caller = auth?.user;

  if (!caller) {
    return reply(401, { error: "Please sign in again." });
  }

  const { data: callerRole } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (callerRole?.role !== "admin") {
    return reply(403, { error: "Only admins can review applications." });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: "Invalid request." });
  }

  const applicationId = body?.applicationId;
  const decision = body?.decision;

  if (
    !Number.isSafeInteger(applicationId) ||
    (decision !== "approve" && decision !== "decline")
  ) {
    return reply(400, { error: "Invalid request." });
  }

  // Claim the application: only one admin can review it, and only once
  const { data: application, error: claimError } = await admin
    .from("applications")
    .update({
      status: decision === "approve" ? "approved" : "declined",
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("status", "pending")
    .select("id, first_name, last_name, email")
    .maybeSingle();

  if (claimError) {
    console.error("Claim failed:", claimError.code, claimError.message);
    return reply(500, { error: "Unable to update the application." });
  }

  if (!application) {
    return reply(409, {
      error: "This application was already reviewed or no longer exists.",
    });
  }

  if (decision === "decline") {
    return reply(200, { ok: true, decision });
  }

  try {
    const email = application.email.trim().toLowerCase();
    const name = [application.first_name, application.last_name]
      .join(" ").trim();
    const { data: invited, error: inviteError } = await admin.auth.admin
      .inviteUserByEmail(email, {
        data: { name },
        redirectTo: setPasswordUrl,
      });

    let userId = invited?.user?.id;
    let alreadyHadAccount = false;

    if (inviteError) {
      // Only "this email already has an account" means: just approve them.
      // Anything else (email limit, mail server down) is a real failure.
      const alreadyExists = inviteError.code === "email_exists" ||
        inviteError.status === 422;

      if (!alreadyExists) throw inviteError;

      userId = await findUserId(admin, email);
      alreadyHadAccount = Boolean(userId);

      if (!userId) throw inviteError;
    }

    // Never downgrade an existing role (e.g. an admin re-applying)
    const { error: roleError } = await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "member" }, {
        onConflict: "user_id",
        ignoreDuplicates: true,
      });

    if (roleError) throw roleError;

    const { error: linkError } = await admin.from("applications")
      .update({ user_id: userId })
      .eq("id", application.id);

    // The approval itself worked; only the record link is missing
    if (linkError) {
      console.error("Saving user_id failed:", linkError.code, linkError.message);
    }

    return reply(200, { ok: true, decision, invited: !alreadyHadAccount });
  } catch (error) {
    console.error("Approval failed:", error);

    // Put it back so an admin can try again
    const { error: revertError } = await admin.from("applications")
      .update({ status: "pending", reviewed_by: null, reviewed_at: null })
      .eq("id", application.id)
      .eq("status", "approved")
      .eq("reviewed_by", caller.id);

    if (revertError) {
      console.error("Revert failed:", revertError.code, revertError.message);
      return reply(500, {
        error: "Approval failed partway. Please check this application in Supabase.",
      });
    }

    return reply(500, {
      error: "Unable to approve right now. The application is still pending.",
    });
  }
});

// Looks up an existing account by email (the project has few users)
async function findUserId(
  admin: ReturnType<typeof createClient>,
  email: string,
) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error || !data) return undefined;

    const match = data.users.find((user) =>
      (user.email ?? "").toLowerCase() === email
    );

    if (match) return match.id;
    if (data.users.length < 200) return undefined;
  }

  return undefined;
}
