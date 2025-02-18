document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("subscribe-form");
    const message = document.getElementById("subscribe-message");

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const email = document.getElementById("email").value;

        try {
            const response = await fetch("https://vmxgdukmghrrzmadoqsm.functions.supabase.co/subscribe", {
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
});
