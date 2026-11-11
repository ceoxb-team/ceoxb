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
        status.textContent = "Saving...";

        const { error } = await _supabase
            .from("ceoxb_monthly_updates")
            .upsert(update, { onConflict: "user_id,month" });

        saveButton.disabled = false;

        if (error) {
            status.textContent = "Unable to save your update: " + error.message;
            return;
        }

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
