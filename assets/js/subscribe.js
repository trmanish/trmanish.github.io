document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("subscribe-form");
    const message = document.getElementById("subscribe-message");

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const email = document.getElementById("email").value;

        try {
            const response = await fetch("https://your-project.functions.supabase.co/subscribe", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
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
        } catch (error) {
            console.error("Network Error:", error);
            message.innerText = "Network error. Please try again.";
            message.style.color = "red";
            message.style.display = "block";
        }
    });
});
