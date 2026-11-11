
const linkedinInput = document.getElementById("edit-linkedin");

if (linkedinInput) {
    const linkedinStatus = document.getElementById("linkedin-save-status");

    let linkedinUserId = "";

    function validLinkedinUrl(value) {
        try {
            const url = new URL(value);
            const hostname = url.hostname.toLowerCase();

            return url.protocol === "https:" &&
                (hostname === "linkedin.com" ||
                 hostname === "www.linkedin.com") &&
                url.pathname.startsWith("/in/") &&
                url.pathname.length > 4;
        } catch (error) {
            return false;
        }
    }

    linkedinInput.addEventListener("change", async function() {
        if (!linkedinUserId) {
            linkedinStatus.textContent = "Unable to save LinkedIn profile.";
            return;
        }

        const url = linkedinInput.value.trim();

        if (url && !validLinkedinUrl(url)) {
            linkedinStatus.textContent =
                "Enter a valid LinkedIn profile URL.";
            return;
        }

        linkedinStatus.textContent = "Saving...";

        const { error } = await _supabase
            .from("profiles")
            .update({ linkedin_url: url || null })
            .eq("id", linkedinUserId);

        linkedinStatus.textContent = error
            ? "Unable to save LinkedIn link: " + error.message
            : (url ? "LinkedIn link saved." : "LinkedIn link removed.");
    });

    async function loadLinkedin() {
        const user = await getCurrentUser();

        if (!user) {
            return;
        }

        linkedinUserId = user.id;

        const { data } = await _supabase
            .from("profiles")
            .select("linkedin_url")
            .eq("id", user.id)
            .maybeSingle();

        const savedUrl = (data && data.linkedin_url) || "";

        if (savedUrl && validLinkedinUrl(savedUrl)) {
            linkedinInput.value = savedUrl;
        }
    }
    loadLinkedin();
}
