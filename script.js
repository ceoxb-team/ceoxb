async function getCurrentUser() {
    const { data } = await _supabase.auth.getSession();
    return data.session ? data.session.user : null;
}

const signinForm = document.getElementById("signin-form");

if (signinForm) {
    signinForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const message = document.getElementById("signin-message");

        message.textContent = "Signing in...";

        const { error } = await _supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            message.textContent = error.message;
            return;
        }

        window.location.href = "dashboard.html";
    });
}

const signupForm = document.getElementById("signup-form");

if (signupForm) {
    signupForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        const name = document.getElementById("signup-name").value.trim();
        const email = document.getElementById("signup-email").value.trim();
        const inviteCode = document.getElementById("invite-code").value.trim();
        const password = document.getElementById("signup-password").value;
        const confirm = document.getElementById("confirm-password").value;
        const message = document.getElementById("signup-message");

        if (password !== confirm) {
            message.textContent = "Passwords do not match.";
            return;
        }

        message.textContent = "Creating your account...";
        const { data, error } = await _supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { name: name, invite_code: inviteCode }
            }
        });

        if (error) {
            message.textContent = error.message;
            return;
        }

        if (data.session) {
            window.location.href = "profile.html";
        } else {
            message.textContent =
                "Account created! Check your email to confirm it, then sign in.";
            signupForm.reset();
        }
    });
}

const pageName = window.location.pathname.split("/").pop();

if (pageName === "dashboard.html" || pageName === "learn.html" ||
        pageName === "connect.html" || pageName === "coffee.html" ||
        pageName === "discuss.html"|| pageName === "profile.html" ||
        pageName === "calendar.html") {
    getCurrentUser().then(function(user) {
        if (!user) {
            window.location.replace("onboarding_files/signin.html");
        }
    });
}

const signout = document.getElementById("signout");

if (signout) {
    signout.addEventListener("click", async function(event) {
        event.preventDefault();

        await _supabase.auth.signOut();
        window.location.href = "index.html";
    });
}

const dashboardWelcome = document.getElementById("dashboard-welcome");

if (dashboardWelcome) {
    (async function() {
        const user = await getCurrentUser();

        if (!user) {
            return;
        }

        const { data } = await _supabase
            .from("profiles")
            .select("name")
            .eq("id", user.id)
            .maybeSingle();

        const name = ((data && data.name) || "").trim();

        dashboardWelcome.textContent = name
            ? "Welcome back, " + name + "!"
            : "Welcome back!";
    })();
}

const memberSearch = document.getElementById("member-search");

if (memberSearch) {
    const memberList = document.getElementById("member-list");
    const memberCount = document.getElementById("member-count");
    const noResults = document.getElementById("no-search-results");

    function addMember(profile) {
        const name = (profile.name || "").trim();
        const role = (profile.role || "").trim();
        const company = (profile.company || "").trim();
        const location = (profile.location || "").trim();
        const about = (profile.about || "").trim();
        const interests = (profile.interests || "").trim();
        
        if (!name || !profile.avatar_url) {
            return;
        }

        const card = document.createElement("div");
        card.className = "dashboard-card member-card";
        card.dataset.search =
            [name, role, company, location, interests]
                .join(" ").toLowerCase();

        const picture = document.createElement("img");
        picture.src = profile.avatar_url;
        picture.alt = name + "'s profile picture";
        picture.className = "member-picture";
        
        const heading = document.createElement("h3");
        heading.textContent = name;

        const roleText = document.createElement("p");
        roleText.className = "member-role";
        roleText.textContent =
        [role, company].filter(Boolean).join(" at ");

        const viewButton = document.createElement("button");
        viewButton.type = "button";
        viewButton.className = "member-view-profile";
        viewButton.textContent = "View Profile";
    
        card.append(picture, heading, roleText, viewButton);
        memberList.appendChild(card);

        const dialog = document.createElement("dialog");
        dialog.className = "member-profile-dialog";
        dialog.setAttribute("aria-label", name + "'s profile");
        
        const content = document.createElement("div");
        content.className = "member-dialog-content";
    
        const close = document.createElement("button");
        close.type = "button";
        close.className = "member-dialog-close";
        close.textContent = "×";
        close.setAttribute("aria-label", "Close profile");
        close.addEventListener("click", function() {
            dialog.close();
        });
        
        const modalPicture = picture.cloneNode(true);
        modalPicture.className = "member-modal-picture";
        
        const modalName = document.createElement("h2");
        modalName.textContent = name;
        
        const modalRole = document.createElement("p");
        modalRole.className = "member-modal-role";
        modalRole.textContent = roleText.textContent;
        
        content.append(close, modalPicture, modalName, modalRole);
    
        if (location) {
            const section = document.createElement("div");
            section.className = "member-modal-info";
    
            const title = document.createElement("h3");
            title.textContent = "Location";
    
            const value = document.createElement("p");
            value.textContent = "📍 " + location;
    
            section.append(title, value);
            content.appendChild(section);
        }
        if (about) {
            const section = document.createElement("div");
            section.className = "member-modal-info";
        
            const title = document.createElement("h3");
            title.textContent = "About Me";
        
            const value = document.createElement("p");
            value.textContent = about;
        
            section.append(title, value);
            content.appendChild(section);
        }

        if (interests) {
            const section = document.createElement("div");
            section.className = "member-modal-info";
    
            const title = document.createElement("h3");
            title.textContent = "Interests";
    
            const value = document.createElement("p");
            value.textContent = interests;
    
            section.append(title, value);
            content.appendChild(section);
        }

    const achievements = document.createElement("div");
    achievements.className = "member-modal-achievements";
        
    const achievementsTitle = document.createElement("h3");
    achievementsTitle.textContent = "Featured Achievements";
    achievements.appendChild(achievementsTitle);

    const badges = document.createElement("div");
    badges.className = "member-achievements";

    let settings = null;

    try {
        settings = JSON.parse(
            localStorage.getItem(
                "ceoxb-achievement-visibility-" + profile.id
            ) || "null"
        );
    } catch (error) {
        settings = null;
    }

    if (settings && settings.visible &&
        Array.isArray(settings.selected)) {

        const categories = {
            coffee: "Coffee Chats",
            discussion: "Discussions",
            connection: "Connections",
            learning: "Learning"
        };

        settings.selected.forEach(function(id) {
            let label = "";
            let icon = "★";

            if (id === "profile") {
                label = "Getting Started";
                icon = "✦";
            } else if (id === "tutorial") {
                label = "Welcome Aboard";
                icon = "🎓";
            } else {
                const match = id.match(
                    /^(coffee|discussion|connection|learning)-(\d+)$/
                );

                if (match) {
                    label = categories[match[1]] +
                        " · " + Number(match[2]).toLocaleString();
                }
            }

            if (label) {
                const badge = document.createElement("span");
                badge.className = "member-achievement-badge";
                badge.textContent = icon + " " + label;
                badges.appendChild(badge);
            }
        });
    }

    if (badges.children.length > 0) {
        achievements.appendChild(badges);
        content.appendChild(achievements);
    }
    
        const linkedinUrl = localStorage.getItem(
            "ceoxb-linkedin-" + profile.id
        );
    
        if (linkedinUrl) {
            try {
                const url = new URL(linkedinUrl);
    
                if (url.protocol === "https:" &&
                    ["linkedin.com", "www.linkedin.com"]
                        .includes(url.hostname.toLowerCase()) &&
                    url.pathname.startsWith("/in/")) {
    
                    const link = document.createElement("a");
                    link.href = url.href;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.className = "member-linkedin-button";
                    link.textContent = "LinkedIn Profile";
                    content.appendChild(link);
                }
            } catch (error) {
            }
        }

    const coffeeButton = document.createElement("a");
    coffeeButton.href =
        "coffee.html?member=" + encodeURIComponent(profile.id);
    coffeeButton.className = "member-coffee-button";
    coffeeButton.textContent = "☕ Schedule Coffee Chat";
    
    content.appendChild(coffeeButton);
    
    dialog.appendChild(content);
    document.body.appendChild(dialog);
    
    viewButton.addEventListener("click", function() {
        dialog.showModal();
    });
    
    dialog.addEventListener("click", function(event) {
        if (event.target === dialog) {
            dialog.close();
        }
    });
    }

    async function loadMembers() {
        const { data, error } = await _supabase
            .from("profiles")
            .select("id, name, role, company, location, about, interests, avatar_url")
            .order("name");

        if (error) {
            memberCount.textContent = "Unable to load members";
            return;
        }

        data.forEach(addMember);
        filterMembers();
    }

    function filterMembers() {
        const searchText = memberSearch.value.toLowerCase().trim();
        const members = document.querySelectorAll(".member-card");

        let visibleCount = 0;

        members.forEach(function(member) {
            const matches = member.dataset.search.includes(searchText);

            member.hidden = !matches;

            if (matches) {
                visibleCount++;
            }
        });

        memberCount.textContent =
            visibleCount + (visibleCount === 1 ? " member" : " members");

        if (noResults) {
            noResults.hidden =
                visibleCount > 0 || members.length === 0 || !searchText;
        }
    }

    loadMembers();

    memberSearch.addEventListener("input", filterMembers);
}

const profileForm = document.getElementById("profile-form");

if (profileForm) {
    const fields = [
        "name", "role", "company",
        "location", "about", "interests"
    ];

    const pictureInput = document.getElementById("edit-picture");
    const picturePreview = document.getElementById("profile-picture-preview");
    const profileResult = document.getElementById("profile-result");

    function updateText(id, value) {
        const element = document.getElementById(id);

        element.textContent = value;
        element.hidden = !value;
    }

    function showProfile() {
        const name = document.getElementById("edit-name").value.trim();
        const role = document.getElementById("edit-role").value.trim();
        const company = document.getElementById("edit-company").value.trim();
        const location = document.getElementById("edit-location").value.trim();
        const about = document.getElementById("edit-about").value.trim();
        const interests = document.getElementById("edit-interests").value.trim();

        document.getElementById("profile-name").textContent =
            name || "Your name";

        updateText(
            "profile-role",
            [role, company].filter(Boolean).join(" at ")
        );

        updateText("profile-location", location);
        updateText("profile-about", about);
        updateText("profile-interests", interests);

        document.getElementById("profile-about-section").hidden = !about;
        document.getElementById("profile-interests-section").hidden = !interests;
    }

    // URL of the picture already saved in Supabase, if any
    let savedPicture = "";

    async function loadProfile() {
        const user = await getCurrentUser();

        if (!user) {
            return;
        }

        const { data } = await _supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

        if (data) {
            fields.forEach(function(field) {
                if (data[field]) {
                    document.getElementById("edit-" + field).value = data[field];
                }
            });

            if (data.avatar_url) {
                savedPicture = data.avatar_url;
                picturePreview.src = savedPicture;
                picturePreview.hidden = false;
                pictureInput.required = false;
            }
        }

        showProfile();
    }

    showProfile();
    loadProfile();

    // Save profile
    profileForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        if (window.profileCropPending) {
            profileResult.textContent = "Finish editing your picture first.";
            return;
        }
        
        const file = window.profileCroppedFile;

        if (!file && !savedPicture) {
            profileResult.textContent = "Please upload a profile picture.";
            return;
        }

        const user = await getCurrentUser();

        if (!user) {
            window.location.replace("signin.html");
            return;
        }

        profileResult.textContent = "Saving...";

        const profile = { id: user.id };

        fields.forEach(function(field) {
            profile[field] =
                document.getElementById("edit-" + field).value.trim();
        });

        if (file) {
            const path = user.id + "/avatar.jpg";

            const { error: uploadError } = await _supabase.storage
                .from("avatars")
                .upload(path, file, { upsert: true, contentType: file.type });

            if (uploadError) {
                profileResult.textContent =
                    "Unable to upload the picture: " + uploadError.message;
                return;
            }

            const { data } = _supabase.storage
                .from("avatars")
                .getPublicUrl(path);
            
            profile.avatar_url = data.publicUrl + "?v=" + Date.now();
        }

        const { error } = await _supabase.from("profiles").upsert(profile);

        if (error) {
            profileResult.textContent =
                "Unable to save your profile: " + error.message;
            return;
        }

        if (profile.avatar_url) {
            savedPicture = profile.avatar_url;
            picturePreview.src = savedPicture;
            picturePreview.hidden = false;
        }

        pictureInput.value = "";
        pictureInput.required = false;
        showProfile();
        profileResult.textContent = "Profile saved successfully!";
    });
}

const dashboardUpcoming = document.getElementById("dashboard-upcoming-events");

if (dashboardUpcoming) {
    loadDashboardEvents();
}

async function loadDashboardEvents() {
    try {
        const user = await getCurrentUser();

        if (!user) {
            dashboardUpcoming.textContent = "Sign in to see your activities.";
            return;
        }

        const storageKey = "ceoxb-coffee-drafts-" + user.id;
        const requests = JSON.parse(
            localStorage.getItem(storageKey) || "[]"
        );

        const now = new Date();

        const upcoming = (Array.isArray(requests) ? requests : [])
            .filter(function(request) {
                if (!request.date || !request.time) return false;

                if (request.status !== "sent" &&
                    request.status !== "draft") return false;

                const eventDate = new Date(
                    request.date + "T" + request.time
                );

                return !isNaN(eventDate.getTime()) && eventDate > now;
            })
            .sort(function(a, b) {
                return new Date(a.date + "T" + a.time) -
                    new Date(b.date + "T" + b.time);
            })
            .slice(0, 3);

        dashboardUpcoming.replaceChildren();

        if (upcoming.length === 0) {
            const message = document.createElement("p");
            message.textContent = "No upcoming coffee chat proposals.";
            dashboardUpcoming.appendChild(message);
            return;
        }

        upcoming.forEach(function(request) {
            const eventDate = new Date(
                request.date + "T" + request.time
            );

            const item = document.createElement("div");
            item.className = "dashboard-upcoming-item";

            const details = document.createElement("div");

            const title = document.createElement("h4");
            title.textContent = "Coffee Chat with " +
                (request.memberName || "a member");

            const date = document.createElement("p");
            date.textContent = eventDate.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit"
            });

            const status = document.createElement("span");
            status.className = "dashboard-upcoming-status";
            status.textContent = "Proposed · Not Confirmed";

            details.append(title, date);
            item.append(details, status);
            dashboardUpcoming.appendChild(item);
        });

    } catch (error) {
        console.error("Unable to load dashboard events:", error);
        dashboardUpcoming.textContent = "Unable to load upcoming activities.";
    }
}

