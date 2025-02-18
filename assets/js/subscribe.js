import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';

document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("subscribe-form");
    const message = document.getElementById("subscribe-message");

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const email = document.getElementById("email").value.trim(); // Trim whitespace

        if (!email) {
            message.innerText = "Please enter a valid email.";
            message.style.color = "red";
            message.style.display = "block";
            return;
        }

        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/members`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${SUPABASE_KEY}`,
                    "Prefer": "return=representation"  // Ensures response is returned
                },
                body: JSON.stringify({ email })
            });

            const result = await response.json();

            if (response.ok) {
                message.innerText = "Thank you for subscribing!";
                message.style.color = "green";
                message.style.display = "block";
                form.reset();
            } else {
                console.error("Supabase Error:", result);
                message.innerText = `Subscription failed: ${result.message || "Try again."}`;
                message.style.color = "red";
                message.style.display = "block";
            }
        } catch (error) {
            console.error("Network Error:", error);
            message.innerText = "Network error. Please try again.";
            message.style.color = "red";
            message.style.display = "block";
        }
    });
});
