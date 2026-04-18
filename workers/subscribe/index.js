import { neon } from '@neondatabase/serverless';

function generateToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle confirmation link clicks
    if (url.pathname === '/confirm' && request.method === 'GET') {
      return handleConfirm(url, env);
    }

    // Handle subscribe requests
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
        status: 405, headers,
      });
    }

    try {
      const { email } = await request.json();

      if (!email) {
        return new Response(JSON.stringify({ error: "Email is required" }), {
          status: 400, headers,
        });
      }

      const sql = neon(env.DATABASE_URL);

      // Check if already confirmed
      const existing = await sql`SELECT confirmed FROM subscribers WHERE email = ${email}`;
      if (existing.length > 0 && existing[0].confirmed) {
        return new Response(
          JSON.stringify({ message: "You are already subscribed!" }),
          { headers }
        );
      }

      // Generate confirmation token
      const token = generateToken();

      // Upsert: insert or update token if email exists but unconfirmed
      await sql`
        INSERT INTO subscribers (email, confirmation_token, confirmed)
        VALUES (${email}, ${token}, false)
        ON CONFLICT (email) DO UPDATE SET confirmation_token = ${token}
      `;

      // Send confirmation email
      const confirmUrl = `${env.CONFIRM_BASE_URL}/confirm?token=${token}`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Two Ticks <newsletter@twoticks.blog>',
          to: email,
          subject: 'Confirm your subscription to Two Ticks',
          html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px;">
              <h2 style="font-size: 20px; color: #333;">Welcome to Two Ticks</h2>
              <p style="font-size: 15px; color: #444; line-height: 1.6;">Click below to confirm your subscription and stay in the loop for new posts.</p>
              <a href="${confirmUrl}" style="display: inline-block; margin-top: 15px; padding: 12px 28px; background: #1F2937; color: white; text-decoration: none; border-radius: 6px; font-size: 14px;">Confirm Subscription</a>
              <p style="font-size: 12px; color: #999; margin-top: 25px;">If you didn't subscribe, you can ignore this email.</p>
            </div>
          `,
        }),
      });

      // Notify you of new subscriber attempt
      const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
      const country = request.cf?.country || 'Unknown';
      const city = request.cf?.city || 'Unknown';

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Two Ticks <newsletter@twoticks.blog>',
          to: env.NOTIFY_EMAIL,
          subject: `New Subscriber (pending): ${email}`,
          html: `
            <p><strong>${email}</strong> is confirming subscription to Two Ticks.</p>
            <p><strong>Time:</strong> ${now} (PT)</p>
            <p><strong>Location:</strong> ${city}, ${country}</p>
          `,
        }),
      });

      return new Response(
        JSON.stringify({ message: "Check your email to confirm!" }),
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

async function handleConfirm(url, env) {
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response('Invalid confirmation link.', {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const result = await sql`
      UPDATE subscribers SET confirmed = true, confirmation_token = null
      WHERE confirmation_token = ${token}
      RETURNING email
    `;

    if (result.length === 0) {
      return new Response('This link has expired or was already used.', {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Notify you of confirmed subscriber
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Two Ticks <newsletter@twoticks.blog>',
        to: env.NOTIFY_EMAIL,
        subject: `Subscriber Confirmed: ${result[0].email}`,
        html: `<p><strong>${result[0].email}</strong> confirmed their subscription to Two Ticks.</p>`,
      }),
    });

    // Redirect to blog
    return Response.redirect('https://twoticks.blog', 302);
  } catch (error) {
    console.error("Confirm error:", error.message);
    return new Response('Something went wrong. Please try again.', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
