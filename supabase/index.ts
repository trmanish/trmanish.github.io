import { serve } from "https://deno.land/std@0.170.0/http/server.ts";

serve(async (req) => {
  return new Response(JSON.stringify({ message: "Subscription successful!" }), {
    headers: { "Content-Type": "application/json" },
  });
});
