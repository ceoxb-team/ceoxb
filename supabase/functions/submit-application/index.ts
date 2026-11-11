// Receives membership applications from onboarding_files/application-review.js.
// Checks the Turnstile captcha and validates every field before saving.
// The database only accepts application inserts from this function.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Form key (sessionStorage) -> column, with a max length
const fields: [string, string, number][] = [
  ["firstName", "first_name", 100],
  ["lastName", "last_name", 100],
  ["title", "title", 100],
  ["email", "email", 254],
  ["url", "linkedin_url", 300],
  ["phoneNumber", "phone", 40],
  ["city", "city", 100],
  ["country", "country", 100],
  ["companyName", "company_name", 200],
  ["website", "company_website", 300],
  ["companyCountry", "company_country", 100],
  ["companyIndustry", "industry", 100],
  ["funding", "funding", 100],
  ["fundingStage", "funding_stage", 100],
  ["numberOfEmployees", "number_of_employees", 100],
];

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Returns false for a bad token or when Cloudflare can't be reached
async function verifyCaptcha(secret: string, token: string, ip: string | null) {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: form, signal: AbortSignal.timeout(5000) },
    );

    if (!response.ok) return false;

    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("Captcha check failed:", error);
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return reply(405, { error: "Method not allowed." });
  }

  const captchaSecret = Deno.env.get("TURNSTILE_SECRET_KEY");

  if (!captchaSecret) {
    console.error("TURNSTILE_SECRET_KEY is not set.");
    return reply(500, {
      error: "Unable to submit your application. Please try again later.",
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: "Invalid request." });
  }

  if (!body || typeof body !== "object") {
    return reply(400, { error: "Invalid request." });
  }

  // Honeypot: real people never fill this hidden field
  if (typeof body.company_fax === "string" && body.company_fax.trim() !== "") {
    return reply(200, { ok: true });
  }

  const application: Record<string, string> = {};

  for (const [key, column, maxLength] of fields) {
    const value = typeof body[key] === "string" ? body[key].trim() : "";

    if (!value || value.length > maxLength) {
      return reply(400, {
        error: "Missing information. Please complete the previous forms.",
      });
    }

    application[column] = value;
  }

  if (!emailPattern.test(application.email)) {
    return reply(400, { error: "Please enter a valid email address." });
  }

  const token = typeof body.captchaToken === "string" ? body.captchaToken : "";
  const ip = request.headers.get("cf-connecting-ip");

  if (
    !token || token.length > 2048 ||
    !(await verifyCaptcha(captchaSecret, token, ip))
  ) {
    return reply(400, { error: "Please complete the captcha and try again." });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { error } = await supabase.from("applications").insert(application);

  if (error) {
    if (error.code === "RL001" || error.code === "RL002") {
      return reply(429, { error: error.message });
    }

    console.error("Application insert failed:", error.code, error.message);
    return reply(500, {
      error: "Unable to submit your application. Please try again later.",
    });
  }

  return reply(200, { ok: true });
});
