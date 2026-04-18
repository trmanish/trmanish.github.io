document.addEventListener("DOMContentLoaded", function () {
    function setupSubscribeForm(formId, emailId, messageId) {
        const form = document.getElementById(formId);
        const message = document.getElementById(messageId);
        if (!form) return;

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const email = document.getElementById(emailId).value;

            try {
                const response = await fetch("https://api.twoticks.blog", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ email })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                const result = await response.json();
                message.innerText = result.message;
                message.style.color = "green";
                message.style.display = "block";
                form.reset();
            } catch (error) {
                console.error("Error:", error);
                message.innerText = "Network Error. Please try again.";
                message.style.color = "red";
                message.style.display = "block";
            }
        });
    }

    setupSubscribeForm("subscribe-form", "email", "subscribe-message");
    setupSubscribeForm("subscribe-form-top", "email-top", "subscribe-message-top");
});
