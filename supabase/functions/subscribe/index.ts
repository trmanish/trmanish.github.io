import { serve } from "https://deno.land/std@0.170.0/http/server.ts";

serve(async (req) => {
  const allowedOrigin = "https://trmanish.github.io"; // Update with your domain
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    // Handle CORS Preflight Requests
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  const { email } = await req.json();

  if (!email) {
    return new Response(JSON.stringify({ error: "Email is required" }), {
      status: 400,
      headers,
    });
  }

  // Supabase API Details
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // Insert email into Supabase `members` table
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
      headers,
    });
  }

  return new Response(JSON.stringify({ message: "Thanks. You are all set!" }), {
    headers,
  });
});
