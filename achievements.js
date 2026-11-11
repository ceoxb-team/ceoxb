(function () {
    const categories = [
        { id: "coffee", name: "Coffee Chats", icon: "☕" },
        { id: "discussion", name: "Discussions", icon: "💬" },
        { id: "connection", name: "Connections", icon: "🤝" },
        { id: "learning", name: "Learning", icon: "📚" }
    ];

    let userId = null;
    let achievementsDialog = null;
    let profileComplete = false;
    let tutorialCompleted = false;

    // Counts come from real activity in the database
    // (see ceoxb_my_activity_counts in the migrations)
    let activityCounts = {
        coffee: 0,
        discussion: 0,
        connection: 0,
        learning: 0
    };

    let visibilitySettings = {
        visible: false,
        selected: []
    };

    function getMilestone(index) {
        if (index === 0) return 1;

        const adjustedIndex = index - 1;
        const multiplier = [5, 10, 25][adjustedIndex % 3];
        const power = Math.floor(adjustedIndex / 3);

        return multiplier * Math.pow(10, power);
    }

    function getTier(milestone) {
        if (milestone >= 10000) {
            return {
                name: "Celestial",
                icon: "✺",
                className: "celestial"
            };
        }

        if (milestone >= 5000) {
            return {
                name: "Diamond",
                icon: "💎",
                className: "diamond"
            };
        }

        if (milestone >= 1000) {
            return {
                name: "Platinum",
                icon: "✧",
                className: "platinum"
            };
        }

        if (milestone >= 100) {
            return {
                name: "Gold",
                icon: "★",
                className: "gold"
            };
        }

        if (milestone >= 10) {
            return {
                name: "Silver",
                icon: "✦",
                className: "silver"
            };
        }

        return {
            name: "Bronze",
            icon: "◆",
            className: "bronze"
        };
    }

    function getMilestoneInfo(count) {
        const earned = [];
        let index = 0;

        while (getMilestone(index) <= count) {
            earned.push(getMilestone(index));
            index++;
        }

        return {
            earned: earned,
            next: getMilestone(index),
            previous: earned.length
                ? earned[earned.length - 1]
                : 0
        };
    }

    function getCount(type) {
        return Number(activityCounts[type]) || 0;
    }

    async function loadActivityCounts() {
        if (!userId) return;

        const { data, error } = await _supabase
            .rpc("ceoxb_my_activity_counts")
            .maybeSingle();

        if (!error && data) {
            activityCounts = data;
        }
    }

    function updateEarnedCount() {
        const counter = document.getElementById("earned-badge-count");

        if (!counter) return;

        const badges = document.querySelectorAll(
            ".badge-collection .reward-badge"
        );

        const earned = document.querySelectorAll(
            ".badge-collection .reward-badge.earned"
        );

        counter.textContent =
            earned.length + " / " + badges.length + " earned";
    }

    function setBadgeEarned(id, unlocked) {
        const badge = document.getElementById(id);

        if (!badge) return;

        badge.classList.toggle("earned", unlocked);
        badge.classList.toggle("locked", !unlocked);

        const status = badge.querySelector(".reward-status");

        if (status) {
            status.textContent = unlocked ? "Earned" : "Locked";
        }

        updateEarnedCount();
    }

    async function loadProfileAchievement() {
        const fill = document.getElementById("profile-progress-fill");

        if (!userId) return;

        const count = document.getElementById("profile-progress-count");
        const message = document.getElementById(
            "profile-progress-message"
        );
        const progressBar = document.getElementById(
            "profile-progress-bar"
        );

        const { data, error } = await _supabase
            .from("profiles")
            .select(
                "name, role, company, location, " +
                "about, interests, avatar_url, tutorial_completed"
            )
            .eq("id", userId)
            .maybeSingle();

        if (error) {
            if (message) {
                message.textContent = "Unable to load progress.";
            }
            return;
        }

        const profile = data || {};

        tutorialCompleted = profile.tutorial_completed === true;
        updateTutorialAchievement();

        const fields = [
            "name",
            "role",
            "company",
            "location",
            "about",
            "interests",
            "avatar_url"
        ];

        const completed = fields.filter(function (field) {
            return (
                typeof profile[field] === "string" &&
                profile[field].trim() !== ""
            );
        }).length;

        const percentage = Math.round(
            (completed / fields.length) * 100
        );

        if (count) {
            count.textContent =
                completed + " of " + fields.length;
        }
        
        if (fill) {
            fill.style.width = percentage + "%";
        }

        if (progressBar) {
            progressBar.setAttribute(
                "aria-valuenow",
                String(percentage)
            );
        }

        const complete = completed === fields.length;
        profileComplete = complete;

        if (message) {
            message.textContent = complete
                ? "Profile complete!"
                : "Complete your profile to unlock your first badge.";
        }

        setBadgeEarned("badge-profile", complete);
    }

    function isTutorialUnlocked() {
        return tutorialCompleted ||
            localStorage.getItem("ceoxb-tutorial-achievement") ===
            "unlocked";
    }

    function updateTutorialAchievement() {
        setBadgeEarned("badge-tutorial", isTutorialUnlocked());
    }

    function createMilestoneTile(number, earned) {
        const tier = getTier(number);

        const tile = document.createElement("div");
        tile.className =
            "milestones-tile achievement-tier " +
            tier.className +
            (earned ? " is-earned" : " is-locked");

        const icon = document.createElement("span");
        icon.className = "milestone-tier-icon";
        icon.textContent = earned ? tier.icon : "🔒";

        const amount = document.createElement("strong");
        amount.textContent = number.toLocaleString();

        const label = document.createElement("small");
        label.textContent = tier.name;

        const status = document.createElement("span");
        status.className = "milestone-status";
        status.textContent = earned ? "Earned" : "Locked";

        tile.append(icon, amount, label, status);

        return tile;
    }

    function createCategoryCard(category) {
        const count = getCount(category.id);
        const info = getMilestoneInfo(count);

        const card = document.createElement("section");
        card.className = "milestones-activity";

        const title = document.createElement("h3");
        title.textContent =
            category.icon + " " + category.name;

        const description = document.createElement("p");
        description.textContent =
            count.toLocaleString() + " completed";

        const progress = document.createElement("div");
        progress.className = "milestones-progress";

        const fill = document.createElement("div");
        fill.className = "milestones-progress-fill";

        const percent =
            ((count - info.previous) /
                (info.next - info.previous)) * 100;

        fill.style.width =
            Math.max(0, Math.min(100, percent)) + "%";

        progress.appendChild(fill);

        const next = document.createElement("p");
        next.className = "milestones-next";
        next.textContent =
            "Next milestone: " +
            info.next.toLocaleString() +
            " · " +
            (info.next - count).toLocaleString() +
            " to go";

        const grid = document.createElement("div");
        grid.className = "milestones-grid";

        info.earned.forEach(function (milestone) {
            grid.appendChild(
                createMilestoneTile(milestone, true)
            );
        });

        const index = info.earned.length;

        for (let i = 0; i < 3; i++) {
            grid.appendChild(
                createMilestoneTile(
                    getMilestone(index + i),
                    false
                )
            );
        }

        card.append(title, description, progress, next, grid);

        return card;
    }

    function renderMilestones() {
        const content = document.getElementById(
            "milestones-content"
        );

        if (!content) return;

        content.replaceChildren();

        categories.forEach(function (category) {
            content.appendChild(
                createCategoryCard(category)
            );
        });
    }

    function createAchievementsViewer() {
        const collection = document.querySelector(".badge-collection");

        if (!collection) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "milestones-open";
        button.textContent = "View All Achievements →";

        collection.appendChild(button);

        achievementsDialog = document.createElement("dialog");
        achievementsDialog.className = "milestones-dialog";

        achievementsDialog.innerHTML = `
            <div class="milestones-dialog-inner">
                <div class="milestones-header">
                    <h2>All Achievements</h2>
                    <button type="button"
                        class="milestones-close"
                        aria-label="Close achievements">
                        ✕
                    </button>
                </div>

                <p class="milestones-intro">
                    Keep growing your community impact.
                    Every milestone unlocks a new badge.
                </p>

                <div id="milestones-content"
                    class="milestones-content"></div>
            </div>
        `;

        document.body.appendChild(achievementsDialog);

        button.addEventListener("click", function () {
            renderMilestones();
            achievementsDialog.showModal();
        });

        achievementsDialog
            .querySelector(".milestones-close")
            .addEventListener("click", function () {
                achievementsDialog.close();
            });
    }

    function celebrateAchievement(category, milestone) {
        const tier = getTier(milestone);

        const popup = document.createElement("div");
        popup.className =
            "achievement-celebration achievement-tier " +
            tier.className;

        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-modal", "true");
        popup.setAttribute(
            "aria-label",
            "Achievement unlocked"
        );

        const card = document.createElement("div");
        card.className = "achievement-celebration-card";

        const icon = document.createElement("div");
        icon.className = "achievement-celebration-icon";
        icon.textContent = tier.icon;

        const heading = document.createElement("h2");
        heading.textContent = "Achievement Unlocked!";

        const tierName = document.createElement("strong");
        tierName.textContent = tier.name + " " + category.name;

        const description = document.createElement("p");
        description.textContent =
            "You've reached " +
            milestone.toLocaleString() +
            " completed " +
            category.name.toLowerCase() +
            "!";

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Awesome! ✨";

        card.append(
            icon,
            heading,
            tierName,
            description,
            button
        );

        popup.appendChild(card);

        if (!window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches) {
            const symbols = ["✦", "★", "◆", "✧"];

            for (let i = 0; i < 24; i++) {
                const particle = document.createElement("span");
                particle.className = "achievement-particle";
                particle.textContent = symbols[i % symbols.length];

                particle.style.left =
                    Math.random() * 100 + "%";

                particle.style.animationDelay =
                    Math.random() * 0.7 + "s";

                popup.appendChild(particle);
            }
        }

        document.body.appendChild(popup);

        const previousFocus = document.activeElement;

        function closePopup() {
            popup.remove();

            if (
                previousFocus &&
                typeof previousFocus.focus === "function"
            ) {
                previousFocus.focus();
            }
        }

        button.addEventListener("click", closePopup);
        button.focus();
    }

    async function recordActivity(type, uniqueId) {
        const category = categories.find(function (item) {
            return item.id === type;
        });

        if (
            !category ||
            uniqueId === undefined ||
            uniqueId === null ||
            String(uniqueId).trim() === ""
        ) {
            return false;
        }

        if (!userId) {
            const user = await getCurrentUser();

            if (!user) return false;

            userId = user.id;
        }

        // The activity itself is already saved in the database;
        // just refresh the counts and celebrate new milestones.
        const previousCount = getCount(type);

        await loadActivityCounts();

        renderMilestones();
        refreshProfileAchievements();

        const before = getMilestoneInfo(previousCount);
        const after = getMilestoneInfo(getCount(type));

        if (after.earned.length > before.earned.length) {
            const milestone =
                after.earned[after.earned.length - 1];

            celebrateAchievement(category, milestone);
        }

        return true;
    }

    window.ceoxbMilestones = {
        record: recordActivity,
        refresh: renderMilestones
    };

    

    function getEarnedAchievements() {
        const earned = [];

        if (profileComplete) {
            earned.push({
                id: "profile",
                name: "Getting Started",
                icon: "✦",
                description: "Complete your profile",
                className: "gold"
            });
        }

        if (isTutorialUnlocked()) {
            earned.push({
                id: "tutorial",
                name: "Welcome Aboard",
                icon: "🎓",
                description: "Explore or skip the tutorial",
                className: "bronze"
            });
        }

        categories.forEach(function (category) {
            const info = getMilestoneInfo(getCount(category.id));

            info.earned.forEach(function (number) {
                const tier = getTier(number);

                earned.push({
                    id: category.id + "-" + number,
                    name: category.name + " · " +
                        number.toLocaleString(),
                    icon: tier.icon,
                    description: tier.name + " milestone",
                    className: tier.className
                });
            });
        });

        return earned;
    }

    async function loadVisibilitySettings() {
        visibilitySettings = {
            visible: false,
            selected: []
        };

        if (!userId) return;

        const { data } = await _supabase
            .from("profiles")
            .select("show_achievements, featured_achievements")
            .eq("id", userId)
            .maybeSingle();

        if (data) {
            visibilitySettings.visible = data.show_achievements === true;
            visibilitySettings.selected =
                Array.isArray(data.featured_achievements)
                    ? data.featured_achievements
                    : [];
        }
    }

    async function saveVisibilitySettings() {
        const status = document.getElementById(
            "achievement-privacy-status"
        );

        const { error } = await _supabase
            .from("profiles")
            .update({
                show_achievements: visibilitySettings.visible,
                featured_achievements: visibilitySettings.selected
            })
            .eq("id", userId);

        if (status) {
            status.textContent = error
                ? "Unable to save achievement preferences: " + error.message
                : "Achievement preferences saved.";
        }
    }

    function createFeaturedBadge(achievement) {
        const badge = document.createElement("div");

        badge.className =
            "featured-achievement-badge achievement-tier " +
            achievement.className;

        const icon = document.createElement("span");
        icon.className = "featured-achievement-icon";
        icon.textContent = achievement.icon;

        const name = document.createElement("strong");
        name.textContent = achievement.name;

        badge.append(icon, name);

        return badge;
    }

    function renderFeaturedPreview(earned) {
        const preview = document.getElementById(
            "featured-achievements-preview"
        );

        if (!preview) return;

        preview.replaceChildren();

        const featured = visibilitySettings.visible
            ? earned.filter(function (achievement) {
                return visibilitySettings.selected.includes(
                    achievement.id
                );
            })
            : [];

        if (featured.length === 0) {
            const empty = document.createElement("p");
            empty.textContent = "No achievements displayed.";
            preview.appendChild(empty);
            return;
        }

        featured.forEach(function (achievement) {
            preview.appendChild(createFeaturedBadge(achievement));
        });
    }

    function refreshProfileAchievements() {
        const toggle = document.getElementById(
            "show-profile-achievements"
        );

        const options = document.getElementById(
            "achievement-visibility-options"
        );

        const list = document.getElementById(
            "achievement-selection-list"
        );

        if (!toggle || !options || !list) return;

        const earned = getEarnedAchievements();

        toggle.checked = visibilitySettings.visible;
        options.hidden = !visibilitySettings.visible;

        list.replaceChildren();

        if (earned.length === 0) {
            const empty = document.createElement("p");
            empty.textContent = "No achievements earned yet.";
            list.appendChild(empty);
        }

        earned.forEach(function (achievement) {
            const row = document.createElement("label");
            row.className = "achievement-selection-item";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";

            checkbox.checked =
                visibilitySettings.selected.includes(achievement.id);

            const icon = document.createElement("span");
            icon.className = "achievement-selection-icon";
            icon.textContent = achievement.icon;

            const details = document.createElement("span");
            details.className = "achievement-selection-info";

            const title = document.createElement("strong");
            title.textContent = achievement.name;

            details.append(title);
            row.append(checkbox, icon, details);
            list.appendChild(row);

            checkbox.addEventListener("change", function () {
                if (checkbox.checked) {
                    if (!visibilitySettings.selected.includes(
                        achievement.id
                    )) {
                        visibilitySettings.selected.push(achievement.id);
                    }
                } else {
                    visibilitySettings.selected =
                        visibilitySettings.selected.filter(
                            function (id) {
                                return id !== achievement.id;
                            }
                        );
                }

                saveVisibilitySettings();
                renderFeaturedPreview(earned);
            });
        });

        renderFeaturedPreview(earned);
    }

    async function initializeProfileSettings() {
        const toggle = document.getElementById(
            "show-profile-achievements"
        );

        if (!toggle) return;

        if (!userId) {
            toggle.disabled = true;

            const status = document.getElementById(
                "achievement-privacy-status"
            );

            if (status) {
                status.textContent =
                    "Sign in to manage your achievements.";
            }

            return;
        }

        await loadVisibilitySettings();

        toggle.addEventListener("change", function () {
            visibilitySettings.visible = toggle.checked;

            saveVisibilitySettings();
            refreshProfileAchievements();
        });

        refreshProfileAchievements();
    }
    
    async function initializeAchievements(){ 
        createAchievementsViewer();
        updateTutorialAchievement();

        try {
            const user = await getCurrentUser();

            if (user) {
                userId = user.id;
                await Promise.all([
                    loadProfileAchievement(),
                    loadActivityCounts()
                ]);
            }
        } catch (error) {
            const message = document.getElementById(
                "profile-progress-message"
            );

            if (message) {
                message.textContent =
                    "Unable to load achievements.";
            }
        }

        updateEarnedCount();
        renderMilestones();
        initializeProfileSettings();
    }

    window.addEventListener(
        "ceoxb-achievement-updated",
        function () {
            updateTutorialAchievement();
            refreshProfileAchievements();
        }
    );

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initializeAchievements
        );
    } else {
        initializeAchievements();
    }
})();
