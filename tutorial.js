document.addEventListener("DOMContentLoaded", function () {
    const steps = [
        {
            href: "dashboard.html",
            icon: "🏠",
            title: "Dashboard",
            text: "Your monthly updates, achievements, and next meeting."
        },
        {
            href: "cohorts.html",
            icon: "👥",
            title: "Cohorts",
            text: "Mandatory monthly meetings, private chat, and facilitator notes."
        },
        {
            href: "calendar.html",
            icon: "📅",
            title: "Schedule",
            text: "Your calendar and optional one-on-one coffee chats."
        },
        {
            href: "connect.html",
            icon: "🤝",
            title: "Community",
            text: "Members, discussions, and learning resources."
        }
    ];

    const storageKey = "ceoxb-guided-tour-v3";
    const replayButton = document.getElementById("replay-tour");
    const oldDialog = document.getElementById("welcome-tour");

    if (oldDialog) {
        oldDialog.remove();
    }

    const overlay = document.createElement("div");
    overlay.className = "guided-tour-overlay";
    overlay.hidden = true;

    const tooltip = document.createElement("div");
    tooltip.className = "guided-tour-tooltip";
    tooltip.hidden = true;
    tooltip.setAttribute("role", "dialog");
    tooltip.setAttribute("aria-modal", "true");
    tooltip.setAttribute("aria-labelledby", "guided-tour-title");

    tooltip.innerHTML = `
        <div class="guided-tour-top">
            <span>CEO XB GUIDE</span>
            <button type="button" id="guided-tour-skip">Skip ×</button>
        </div>

        <div class="guided-tour-progress"></div>

        <div class="guided-tour-icon" id="guided-tour-icon"></div>
        <h2 id="guided-tour-title"></h2>
        <p id="guided-tour-description"></p>

        <div class="guided-tour-bottom">
            <button type="button" id="guided-tour-back">← Back</button>
            <span id="guided-tour-count"></span>
            <button type="button" id="guided-tour-next">Next →</button>
        </div>
    `;

    document.body.append(overlay, tooltip);

    const backButton = tooltip.querySelector("#guided-tour-back");
    const nextButton = tooltip.querySelector("#guided-tour-next");
    const skipButton = tooltip.querySelector("#guided-tour-skip");

    let currentStep = 0;
    let activeTarget = null;
    let tourOpen = false;

    function findTarget() {
        return document.querySelector(
            `.nav-links a[href="${steps[currentStep].href}"]`
        );
    }

    function positionTooltip() {
        if (!tourOpen || tooltip.hidden) return;

        const target = findTarget();

        if (!target) return;

        const rect = target.getBoundingClientRect();
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;

        let left = rect.left + rect.width / 2 - tooltipWidth / 2;

        left = Math.max(
            12,
            Math.min(left, window.innerWidth - tooltipWidth - 12)
        );

        const spaceBelow = window.innerHeight - rect.bottom;
        const showAbove =
            spaceBelow < tooltipHeight + 30 &&
            rect.top > tooltipHeight + 30;

        let top = showAbove
            ? rect.top - tooltipHeight - 22
            : rect.bottom + 22;

        top = Math.max(
            12,
            Math.min(top, window.innerHeight - tooltipHeight - 12)
        );

        tooltip.style.left = left + "px";
        tooltip.style.top = top + "px";
        tooltip.classList.toggle("tour-above", showAbove);

        const arrowX =
            rect.left + rect.width / 2 - left;

        tooltip.style.setProperty("--tour-arrow-x", arrowX + "px");
    }

    function showStep() {
        if (activeTarget) {
            activeTarget.classList.remove("guided-tour-highlight");
        }

        const step = steps[currentStep];
        activeTarget = findTarget();

        if (!activeTarget) {
            finishTour(false);
            return;
        }

        activeTarget.classList.add("guided-tour-highlight");

        tooltip.querySelector("#guided-tour-icon").textContent = step.icon;
        tooltip.querySelector("#guided-tour-title").textContent = step.title;
        tooltip.querySelector("#guided-tour-description").textContent =
            step.text;

        tooltip.querySelector("#guided-tour-count").textContent =
            `${currentStep + 1} of ${steps.length}`;

        backButton.disabled = currentStep === 0;

        nextButton.textContent =
            currentStep === steps.length - 1
                ? "Finish ✨"
                : "Next →";

        const progress = tooltip.querySelector(".guided-tour-progress");
        progress.replaceChildren();

        steps.forEach(function (_, index) {
            const bar = document.createElement("span");

            if (index <= currentStep) {
                bar.classList.add("completed");
            }

            progress.appendChild(bar);
        });

        positionTooltip();
    }

    function startTour() {
        currentStep = 0;
        tourOpen = true;

        overlay.hidden = false;
        tooltip.hidden = false;

        document.body.classList.add("guided-tour-active");

        showStep();
        nextButton.focus();
    }

    function closeTour() {
        tourOpen = false;

        overlay.hidden = true;
        tooltip.hidden = true;

        document.body.classList.remove("guided-tour-active");

        if (activeTarget) {
            activeTarget.classList.remove("guided-tour-highlight");
            activeTarget = null;
        }

        localStorage.setItem(storageKey, "done");
        replayButton?.focus();
    }

    function celebrate() {
        const celebration = document.createElement("div");
        celebration.className = "tour-celebration";
        celebration.setAttribute("role", "status");

        celebration.innerHTML = `
            <div class="tour-celebration-card">
                <div class="tour-celebration-icon">🎉</div>
                <h2>Tour Complete!</h2>
                <p>You're ready to explore CEO XB and connect with your community.</p>
                <button type="button">Explore CEO XB →</button>
            </div>
        `;

        document.body.appendChild(celebration);

        const symbols = ["✦", "★", "●", "✧"];

        for (let i = 0; i < 36; i++) {
            const piece = document.createElement("span");
            piece.className = "tour-confetti";
            piece.textContent = symbols[i % symbols.length];

            piece.style.left = Math.random() * 100 + "%";
            piece.style.animationDelay = Math.random() * 0.7 + "s";
            piece.style.setProperty(
                "--confetti-color",
                ["#56b9dc", "#e8a83d", "#80cba6", "#ffffff"][i % 4]
            );

            celebration.appendChild(piece);
        }

        celebration.querySelector("button").addEventListener(
            "click",
            function () {
                celebration.remove();
                replayButton?.focus();
            }
        );

        celebration.querySelector("button").focus();
    }

    function finishTour(completed) {
        closeTour();

        if (completed) {
            localStorage.setItem("ceoxb-tutorial-achievement", "unlocked");
            window.dispatchEvent(new Event("ceoxb-achievement-updated"));
            celebrate();
            saveTutorialBadge();
        }
    }

    // Keep the badge on the member's profile so it follows them
    // to other devices (the "seen the tour" flag stays per browser).
    async function saveTutorialBadge() {
        if (typeof _supabase === "undefined") return;

        const user = await getCurrentUser();

        if (!user) return;

        await _supabase
            .from("profiles")
            .update({ tutorial_completed: true })
            .eq("id", user.id);
    }

    nextButton.addEventListener("click", function () {
        if (currentStep === steps.length - 1) {
            finishTour(true);
        } else {
            currentStep++;
            showStep();
        }
    });

    backButton.addEventListener("click", function () {
        if (currentStep > 0) {
            currentStep--;
            showStep();
        }
    });

    skipButton.addEventListener("click", function () {
        finishTour(false);
    });

    document.addEventListener("keydown", function (event) {
        if (tourOpen && event.key === "Escape") {
            finishTour(false);
        }
    });

    window.addEventListener("resize", positionTooltip);
    window.addEventListener("scroll", positionTooltip, true);

    if (replayButton) {
        replayButton.addEventListener("click", startTour);
    }

    if (!localStorage.getItem(storageKey) && findTarget()) {
        startTour();
    }
});
