import { neon } from '@neondatabase/serverless';

export default {
  async fetch(request, env) {
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers,
      });
    }

    try {
      const { email } = await request.json();

      if (!email) {
        return new Response(JSON.stringify({ error: "Email is required" }), {
          status: 400,
          headers,
        });
      }

      const sql = neon(env.DATABASE_URL);
      await sql`INSERT INTO subscribers (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;

      // Notify you of new subscriber
      const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
      const referer = request.headers.get('Referer') || 'Unknown';
      const country = request.cf?.country || 'Unknown';
      const city = request.cf?.city || 'Unknown';

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Two Ticks <onboarding@resend.dev>',
          to: env.NOTIFY_EMAIL,
          subject: `New Subscriber: ${email}`,
          html: `
            <p><strong>${email}</strong> just subscribed to Two Ticks.</p>
            <p><strong>Time:</strong> ${now} (PT)</p>
            <p><strong>Location:</strong> ${city}, ${country}</p>
            <p><strong>Page:</strong> ${referer}</p>
          `,
        }),
      });

      return new Response(
        JSON.stringify({ message: "You are in!" }),
        { headers }
      );
    } catch (error) {
      console.error("Subscribe error:", error.message);
      return new Response(
        JSON.stringify({ error: "Something went wrong. Please try again." }),
        { status: 500, headers }
      );
    }
  },
};
