// MONTHLY UPDATE (dashboard)
// One update per member per month, saved in ceoxb_monthly_updates.
// Facilitators and admins can read updates from their cohort members.
const monthlyUpdateForm = document.getElementById("cohort-update-form");

if (monthlyUpdateForm) {
    const winInput = document.getElementById("cohort-win");
    const focusInput = document.getElementById("cohort-focus");
    const askInput = document.getElementById("cohort-ask");

    const monthLabel = document.getElementById("cohort-update-month");
    const summary = document.getElementById("cohort-update-summary");
    const savedText = document.getElementById("cohort-update-saved-text");
    const editButton = document.getElementById("cohort-update-edit");
    const status = document.getElementById("cohort-update-status");
    const saveButton = monthlyUpdateForm.querySelector("button[type=submit]");

    const now = new Date();

    const monthKey =
        now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

    monthLabel.textContent = now.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric"
    });

    let signedIn = false;

    const aiGenerate = document.getElementById("monthly-ai-generate");
    const aiConsent = document.getElementById("monthly-ai-consent");
    const aiStatus = document.getElementById("monthly-ai-status");
    const aiPreview = document.getElementById("monthly-ai-preview");
    const aiText = document.getElementById("monthly-ai-draft-text");
    const aiPanel = document.getElementById("monthly-ai-assistant");
    const updateInputs = [winInput, focusInput, askInput];
    let aiDraft = null;
    let aiLoading = false;

    function clearAIDraft() {
        aiDraft = null;
        aiPreview.hidden = true;
        aiText.replaceChildren();
    }

    updateInputs.forEach(input => input.addEventListener("input", () => {
        if (aiDraft) aiStatus.textContent = "Your notes changed. Generate a new draft when ready.";
        clearAIDraft();
    }));

    aiGenerate.addEventListener("click", async () => {
        if (!signedIn) {
            aiStatus.textContent = "Please sign in to use AI assistance.";
            return;
        }
        if (!aiConsent.checked) {
            aiStatus.textContent = "Please confirm the Google Gemini data notice first.";
            aiConsent.focus();
            return;
        }
        if (!monthlyUpdateForm.reportValidity()) return;
        const original = updateInputs.map(input => input.value);
        if (original.some(value => !value.trim())) {
            aiStatus.textContent = "Add a few notes in each field first.";
            return;
        }
        clearAIDraft();
        aiLoading = true;
        aiGenerate.disabled = true;
        saveButton.disabled = true;
        aiPanel.setAttribute("aria-busy", "true");
        aiStatus.textContent = "Improving your wording...";
        try {
            const draft = await window.CEOXBAI.generate({
                task: "monthly-update", win: original[0].trim(), focus: original[1].trim(), ask: original[2].trim()
            });
            if (original.some((value, index) => value !== updateInputs[index].value)) {
                aiStatus.textContent = "Your notes changed during generation. Generate a new draft when ready.";
                return;
            }
            if (["win", "focus", "ask"].some(key => typeof draft[key] !== "string" || !draft[key].trim() || draft[key].length > 500)) {
                throw new Error("The draft was incomplete. Please try again.");
            }
            aiDraft = draft;
            [["Your Win", draft.win], ["Your Focus", draft.focus], ["Your Ask", draft.ask]].forEach(([title, value]) => {
                const heading = document.createElement("h4");
                heading.textContent = title;
                const paragraph = document.createElement("p");
                paragraph.textContent = value;
                aiText.append(heading, paragraph);
            });
            aiPreview.hidden = false;
            aiStatus.textContent = "Review the draft, then choose whether to use it.";
        } catch (error) {
            aiStatus.textContent = error.message;
        } finally {
            aiLoading = false;
            aiGenerate.disabled = false;
            saveButton.disabled = false;
            aiPanel.removeAttribute("aria-busy");
        }
    });

    document.getElementById("monthly-ai-use").addEventListener("click", () => {
        if (!aiDraft) return;
        [aiDraft.win, aiDraft.focus, aiDraft.ask].forEach((value, index) => { updateInputs[index].value = value; });
        clearAIDraft();
        aiStatus.textContent = "Draft added to your fields. Review or edit it, then save your update.";
        winInput.focus();
    });
    document.getElementById("monthly-ai-cancel").addEventListener("click", () => {
        clearAIDraft();
        aiStatus.textContent = "Draft discarded. Your original notes are unchanged.";
    });

    function showSavedUpdate(update) {
        savedText.replaceChildren();

        [
            ["Your Win", update.win],
            ["Your Focus", update.focus],
            ["Your Ask", update.ask]
        ].forEach(function(section) {
            const item = document.createElement("div");

            const heading = document.createElement("h4");
            heading.textContent = section[0];

            const paragraph = document.createElement("p");
            paragraph.textContent = section[1];

            item.append(heading, paragraph);
            savedText.appendChild(item);
        });

        monthlyUpdateForm.hidden = true;
        summary.hidden = false;
    }

    function showEditForm() {
        monthlyUpdateForm.hidden = false;
        summary.hidden = true;
        status.textContent = "";
    }

    monthlyUpdateForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        if (aiLoading) return;

        if (!signedIn) {
            status.textContent = "Please sign in to save an update.";
            return;
        }

        const update = {
            month: monthKey,
            win: winInput.value.trim(),
            focus: focusInput.value.trim(),
            ask: askInput.value.trim(),
            updated_at: new Date().toISOString()
        };

        if (!update.win || !update.focus || !update.ask) {
            status.textContent = "Please complete all three fields.";
            return;
        }

        saveButton.disabled = true;
        aiGenerate.disabled = true;
        status.textContent = "Saving...";

        const { error } = await _supabase
            .from("ceoxb_monthly_updates")
            .upsert(update, { onConflict: "user_id,month" });

        saveButton.disabled = false;
        aiGenerate.disabled = false;

        if (error) {
            status.textContent = "Unable to save your update: " + error.message;
            return;
        }

        clearAIDraft();
        aiStatus.textContent = "";
        showSavedUpdate(update);
        status.textContent = "Your monthly update has been saved.";
    });

    editButton.addEventListener("click", showEditForm);

    (async function loadUpdate() {
        try {
            const user = await getCurrentUser();

            if (!user) {
                status.textContent = "Please sign in to save an update.";
                return;
            }

            signedIn = true;

            const { data, error } = await _supabase
                .from("ceoxb_monthly_updates")
                .select("win, focus, ask")
                .eq("user_id", user.id)
                .eq("month", monthKey)
                .maybeSingle();

            if (error) throw error;

            if (!data) {
                showEditForm();
                return;
            }

            winInput.value = data.win;
            focusInput.value = data.focus;
            askInput.value = data.ask;

            showSavedUpdate(data);
        } catch (error) {
            showEditForm();
            status.textContent = "Unable to load your saved update.";
        }
    })();
}
