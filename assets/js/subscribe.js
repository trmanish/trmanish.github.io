import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';

document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("subscribe-form");
    const message = document.getElementById("subscribe-message");

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const email = document.getElementById("email").value;

        const response = await fetch(`${SUPABASE_URL}/rest/v1/emails`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`
            },
            body: JSON.stringify({ email })
        });

        if (response.ok) {
            message.innerText = "Thank you for subscribing!";
            message.style.color = "green";
            message.style.display = "block";
            form.reset();
        } else {
            message.innerText = "Subscription failed. Try again.";
            message.style.color = "red";
            message.style.display = "block";
        }
    });
});
