import { serve } from "https://deno.land/std@0.170.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { email } = await req.json();

  if (!email) {
    return new Response(JSON.stringify({ error: "Email is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get environment variables (store in GitHub Secrets or Supabase Dashboard)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // Insert the email into the Supabase `members` table
  const response = await fetch(`${supabaseUrl}/rest/v1/members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseKey!,
      "Authorization": `Bearer ${supabaseKey!}`,
      "Prefer": "return=representation",
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    return new Response(JSON.stringify({ error: "Failed to insert email" }), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ message: "Thanks. You are all set!" }), {
    headers: { "Content-Type": "application/json" },
  });
});
