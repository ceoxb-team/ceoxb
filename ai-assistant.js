// Gemini is called only by the authenticated Supabase function. No provider key here.
window.CEOXBAI = {
    async generate(input) {
        const { data: sessionData, error: sessionError } = await _supabase.auth.getSession();
        if (sessionError || !sessionData.session) throw new Error("Please sign in again to use AI assistance.");
        const { data, error } = await _supabase.functions.invoke("ai-assistant", {
            body: { ...input, consent: true }
        });
        if (error) {
            let message = "Unable to reach the AI assistant. Ask a project administrator to check its deployment.";
            try {
                const payload = await error.context?.json();
                if (typeof payload?.error === "string") message = payload.error;
            } catch { /* Network and gateway errors may not have JSON bodies. */ }
            throw new Error(message);
        }
        if (!data?.draft) throw new Error("No AI draft was returned. Please try again.");
        return data.draft;
    },

    attachCoffeeAssistant(card, request) {
        const make = (tag, content, className) => {
            const node = document.createElement(tag);
            if (content) node.textContent = content;
            if (className) node.className = className;
            return node;
        };
        const panel = make("details", "", "ai-assistant");
        panel.appendChild(make("summary", "Help me prepare with AI"));
        const content = make("div", "", "ai-assistant-content");
        const goalId = "ai-coffee-goal-" + request.id;
        const label = make("label", "What would you like to get out of this chat? (optional)");
        label.htmlFor = goalId;
        const goal = make("textarea");
        goal.id = goalId;
        goal.rows = 2;
        goal.maxLength = 500;
        goal.placeholder = "For example: learn how to find my first customers.";
        const consentLabel = make("label", "", "ai-consent");
        const consent = make("input");
        consent.type = "checkbox";
        consentLabel.append(consent, document.createTextNode(
            "Send both members' profile roles and interests, plus my optional goal, to Google Gemini. Names and chat messages are excluded."
        ));
        const notice = make("p", "Google may use free-tier inputs and responses to improve its products. Use sample data for this prototype and avoid confidential information.", "ai-notice");
        const generate = make("button", "Generate agenda", "coffee-secondary-button");
        generate.type = "button";
        const status = make("p", "", "learn-note");
        status.setAttribute("role", "status");
        const preview = make("div", "", "ai-draft");
        preview.hidden = true;
        const dismiss = make("button", "Dismiss draft", "coffee-secondary-button");
        dismiss.type = "button";
        dismiss.hidden = true;
        dismiss.addEventListener("click", () => {
            preview.hidden = true;
            dismiss.hidden = true;
            status.textContent = "Draft dismissed.";
        });
        generate.addEventListener("click", async () => {
            if (!consent.checked) {
                status.textContent = "Please confirm the Google Gemini data notice first.";
                consent.focus();
                return;
            }
            generate.disabled = true;
            goal.disabled = true;
            consent.disabled = true;
            content.setAttribute("aria-busy", "true");
            status.textContent = "Preparing your conversation starters...";
            try {
                const draft = await window.CEOXBAI.generate({ task: "coffee-chat", chatId: request.id, goal: goal.value.trim() });
                if (!Array.isArray(draft.agenda) || draft.agenda.length !== 3 ||
                    !Array.isArray(draft.questions) || draft.questions.length !== 3 ||
                    [...draft.agenda, ...draft.questions].some(item => typeof item !== "string" || !item.trim() || item.length > 400)) {
                    throw new Error("The agenda was incomplete. Please try again.");
                }
                preview.replaceChildren(make("h4", "Suggested 15-minute agenda"));
                const agenda = make("ol");
                draft.agenda.forEach(item => agenda.appendChild(make("li", item)));
                const questions = make("ul");
                draft.questions.forEach(item => questions.appendChild(make("li", item)));
                preview.append(agenda, make("h4", "Conversation starters"), questions,
                    make("p", "AI suggestions may be inaccurate. Review before using. This draft is not saved or sent to the other member.", "ai-notice"));
                preview.hidden = false;
                dismiss.hidden = false;
                status.textContent = "Your draft is ready.";
            } catch (error) {
                status.textContent = error.message;
            } finally {
                generate.disabled = false;
                goal.disabled = false;
                consent.disabled = false;
                content.removeAttribute("aria-busy");
            }
        });
        content.append(label, goal, consentLabel, notice, generate, status, preview, dismiss);
        panel.appendChild(content);
        card.appendChild(panel);
    }
};
