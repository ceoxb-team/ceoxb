
document.addEventListener("DOMContentLoaded", async function () {
    const search = document.getElementById("learn-search");
    const category = document.getElementById("learn-category");
    const cards = [...document.querySelectorAll(".learn-topic-card")];
    const count = document.getElementById("learn-count");
    const empty = document.getElementById("learn-empty");
    const savedList = document.getElementById("learn-saved-list");
    const feedback = document.getElementById("learn-feedback");

    if (!search || !category || !savedList) return;

    let saved = [];
    let signedIn = false;

    function filterTopics() {
        const query = search.value.trim().toLowerCase();
        let visible = 0;

        cards.forEach(function (card) {
            const matchesSearch =
                card.textContent.toLowerCase().includes(query);

            const matchesCategory =
                category.value === "all" ||
                card.dataset.category === category.value;

            const show = matchesSearch && matchesCategory;

            card.hidden = !show;
            if (show) visible++;
        });

        count.textContent = visible + " topics";
        empty.hidden = visible !== 0;
    }

    function renderSaved() {
        savedList.replaceChildren();

        cards.forEach(function (card) {
            const button = card.querySelector(".learn-save-button");
            const topic = button.dataset.topic;
            const isSaved = saved.includes(topic);

            button.textContent = isSaved
                ? "★ Saved"
                : "☆ Save Topic";

            button.classList.toggle("saved", isSaved);
            button.setAttribute("aria-pressed", String(isSaved));
        });

        if (saved.length === 0) {
            const note = document.createElement("p");
            note.textContent = "You haven't saved any topics yet.";
            note.className = "learn-empty-state";
            savedList.appendChild(note);
            return;
        }

        saved.forEach(function (topic) {
            const item = document.createElement("div");
            item.className = "learn-saved-item";

            const label = document.createElement("span");
            label.textContent = topic;

            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "Remove";
            remove.setAttribute("aria-label", "Remove " + topic);

            remove.addEventListener("click", function () {
                updateSaved(topic);
            });

            item.append(label, remove);
            savedList.appendChild(item);
        });
    }

    async function updateSaved(topic) {
        if (!signedIn) {
            feedback.textContent = "Please sign in to save topics.";
            return;
        }

        const removing = saved.includes(topic);

        const { error } = removing
            ? await _supabase
                .from("ceoxb_saved_topics")
                .delete()
                .eq("topic", topic)
            : await _supabase
                .from("ceoxb_saved_topics")
                .insert({ topic: topic });

        if (error) {
            feedback.textContent = "Unable to update saved topics: " + error.message;
            return;
        }

        saved = removing
            ? saved.filter(item => item !== topic)
            : saved.concat(topic);

        feedback.textContent = removing ? "Topic removed." : "Topic saved.";
        renderSaved();
    }

    document.querySelectorAll(".learn-save-button")
        .forEach(function (button) {
            button.addEventListener("click", function () {
                updateSaved(button.dataset.topic);
            });
        });

    search.addEventListener("input", filterTopics);
    category.addEventListener("change", filterTopics);

    filterTopics();
    renderSaved();

    const user = await getCurrentUser();

    if (!user) return;

    signedIn = true;

    const { data, error } = await _supabase
        .from("ceoxb_saved_topics")
        .select("topic")
        .order("saved_at");

    if (error) {
        feedback.textContent = "Unable to load saved topics: " + error.message;
        return;
    }

    saved = (data || []).map(row => row.topic);
    renderSaved();
});
