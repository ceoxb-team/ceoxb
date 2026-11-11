
document.addEventListener("DOMContentLoaded", async function () {
    const form = document.getElementById("coffee-form");
    const member = document.getElementById("coffee-member");
    const date = document.getElementById("coffee-date");
    const time = document.getElementById("coffee-time");
    const message = document.getElementById("coffee-message");
    const result = document.getElementById("coffee-result");
    const submit = document.getElementById("coffee-submit");
    const list = document.getElementById("coffee-requests-list");
    const tabs = document.querySelectorAll("[data-coffee-filter]");

    const yourTime = document.getElementById("coffee-your-time");
    const theirTime = document.getElementById("coffee-their-time");

    function updateMeetingPreview() {
        if (!yourTime || !theirTime) return;

        if (!date.value || !time.value) {
            yourTime.textContent = "Choose a date and time.";
            theirTime.textContent = "Choose a member to see their time.";
            return;
        }

        const meeting = new Date(date.value + "T" + time.value);

        if (Number.isNaN(meeting.getTime())) {
            yourTime.textContent = "Invalid meeting time.";
            theirTime.textContent = "";
            return;
        }

        const formatMeeting = function(timezone) {
            return new Intl.DateTimeFormat("en-US", {
                dateStyle: "full",
                timeStyle: "short",
                timeZone: timezone
            }).format(meeting);
        };

        yourTime.textContent =
            "Your time: " + formatMeeting(
                Intl.DateTimeFormat().resolvedOptions().timeZone
            );

        if (!member.value) {
            theirTime.textContent = "Choose a member.";
            return;
        }

        const recipientTimezone =
            member.selectedOptions[0].dataset.timezone;

        if (!recipientTimezone) {
            theirTime.textContent =
                "Recipient's timezone is unavailable.";
            return;
        }

        try {
            theirTime.textContent =
                "Recipient's time: " + formatMeeting(recipientTimezone);
        } catch (error) {
            theirTime.textContent =
                "Recipient's timezone is unavailable.";
        }
    }

    member.addEventListener("change", updateMeetingPreview);
    date.addEventListener("change", updateMeetingPreview);
    time.addEventListener("input", updateMeetingPreview);

    if (!form || !list) return;

    let currentUser = null;
    let requests = [];
    let editingId = null;
    let currentFilter = "all";

    const requestColumns =
        "id, requester_id, recipient_id, starts_at, message, status, " +
        "requester:profiles!ceoxb_coffee_requests_requester_id_fkey(name), " +
        "recipient:profiles!ceoxb_coffee_requests_recipient_id_fkey(name)";

    function todayString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");

        return year + "-" + month + "-" + day;
    }

    date.min = todayString();
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const timezoneLabel = document.getElementById("coffee-sender-timezone");

    if (timezoneLabel) {
        timezoneLabel.textContent =
            "Your timezone: " + userTimezone.replaceAll("_", " ") +
            " (automatically detected)";
    }

    function formatLocalMeeting(instant) {
        return new Intl.DateTimeFormat("en-US", {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: userTimezone
        }).format(instant);
    }

    function toRequest(row) {
        const outgoing = row.requester_id === currentUser.id;
        const other = outgoing ? row.recipient : row.requester;

        return {
            id: row.id,
            outgoing: outgoing,
            memberId: outgoing ? row.recipient_id : row.requester_id,
            memberName: (other && other.name && other.name.trim()) || "A member",
            startsAt: row.starts_at,
            message: row.message || "",
            status: row.status
        };
    }

    async function loadRequests() {
        const { data, error } = await _supabase
            .from("ceoxb_coffee_requests")
            .select(requestColumns)
            .order("starts_at", { ascending: true });

        if (error) {
            result.textContent = "Unable to load coffee chats: " + error.message;
            return false;
        }

        requests = (data || []).map(toRequest);
        return true;
    }

    async function changeStatus(request, status, successText) {
        const { error } = await _supabase
            .from("ceoxb_coffee_requests")
            .update({ status: status })
            .eq("id", request.id);

        if (error) {
            result.textContent = "Unable to update request: " + error.message;
            return;
        }

        request.status = status;

        if (editingId === request.id) {
            resetForm();
        }

        result.textContent = successText;
        renderRequests();
    }

    function createElement(tag, text, className) {
        const element = document.createElement(tag);

        if (text !== undefined) {
            element.textContent = text;
        }

        if (className) {
            element.className = className;
        }

        return element;
    }

    function makeButton(text, className, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = text;
        button.addEventListener("click", onClick);
        return button;
    }

    function statusLabel(request) {
        if (request.status === "accepted") return "Accepted";
        if (request.status === "declined") return "Declined";
        if (request.status === "cancelled") return "Cancelled";
        return request.outgoing ? "Sent" : "Awaiting Your Reply";
    }

    function matchesFilter(request) {
        if (currentFilter === "all") return true;
        if (currentFilter === "sent") return request.outgoing;
        if (currentFilter === "received") return !request.outgoing;
        if (currentFilter === "cancelled") {
            return request.status === "cancelled" ||
                request.status === "declined";
        }
        return request.status === currentFilter;
    }

    function renderRequests() {
        list.replaceChildren();

        const filtered = requests.filter(matchesFilter);

        if (filtered.length === 0) {
            const empty = createElement(
                "div", undefined, "coffee-empty"
            );

            empty.append(
                createElement("div", "☕", "coffee-empty-icon"),
                createElement(
                    "h3",
                    currentFilter === "all"
                        ? "No coffee chats yet"
                        : "Nothing to show here"
                ),
                createElement(
                    "p",
                    "Choose a member and suggest a time to get started."
                )
            );

            list.appendChild(empty);
            return;
        }

        filtered.slice().reverse().forEach(function (request) {
            const card = createElement(
                "article", undefined, "coffee-request-card"
            );

            const header = createElement(
                "div", undefined, "coffee-request-header"
            );

            const details = createElement("div");

            details.append(
                createElement(
                    "h3",
                    (request.outgoing ? "To " : "From ") + request.memberName
                ),
                createElement(
                    "p",
                    "📅 " + formatLocalMeeting(new Date(request.startsAt))
                )
            );

            const status = createElement(
                "span",
                statusLabel(request),
                "coffee-request-status " + request.status
            );

            header.append(details, status);
            card.appendChild(header);

            if (request.message) {
                card.appendChild(
                    createElement(
                        "p",
                        request.message,
                        "coffee-request-message"
                    )
                );
            }

            const actions = createElement(
                "div", undefined, "coffee-request-actions"
            );

            if (request.outgoing && request.status === "sent") {
                actions.append(
                    makeButton(
                        "Edit Request",
                        "coffee-secondary-button",
                        function () {
                            editingId = request.id;
                            member.value = request.memberId;

                            const instant = new Date(request.startsAt);

                            date.value = [
                                instant.getFullYear(),
                                String(instant.getMonth() + 1).padStart(2, "0"),
                                String(instant.getDate()).padStart(2, "0")
                            ].join("-");

                            time.value = [
                                String(instant.getHours()).padStart(2, "0"),
                                String(instant.getMinutes()).padStart(2, "0")
                            ].join(":");

                            message.value = request.message;

                            submit.textContent = "Save Changes";
                            result.textContent = "Editing your Coffee Chat request.";
                            updateMeetingPreview();

                            form.scrollIntoView({
                                behavior: "smooth",
                                block: "center"
                            });
                        }
                    ),
                    makeButton(
                        "Cancel Request",
                        "coffee-danger-button",
                        function () {
                            changeStatus(request, "cancelled", "Request cancelled.");
                        }
                    )
                );
            }

            if (!request.outgoing && request.status === "sent") {
                actions.append(
                    makeButton(
                        "Accept",
                        "coffee-secondary-button",
                        function () {
                            changeStatus(request, "accepted", "Coffee chat accepted.");
                        }
                    ),
                    makeButton(
                        "Decline",
                        "coffee-danger-button",
                        function () {
                            changeStatus(request, "declined", "Coffee chat declined.");
                        }
                    )
                );
            }

            if (request.status === "accepted") {
                actions.append(
                    makeButton(
                        "Cancel Coffee Chat",
                        "coffee-danger-button",
                        function () {
                            changeStatus(request, "cancelled", "Coffee chat cancelled.");
                        }
                    )
                );
            }

            if (actions.children.length) {
                card.appendChild(actions);
            }

            list.appendChild(card);
        });
    }

    function resetForm() {
        form.reset();
        editingId = null;
        submit.textContent = "Save Coffee Chat";
        updateMeetingPreview();
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (!currentUser) {
            result.textContent = "Please sign in to request a coffee chat.";
            return;
        }

        if (!form.reportValidity()) return;

        const appointment = new Date(
            date.value + "T" + time.value
        );

        if (
            Number.isNaN(appointment.getTime()) ||
            appointment <= new Date()
        ) {
            result.textContent =
                "Choose a date and time in the future.";
            return;
        }

        const fields = {
            recipient_id: member.value,
            starts_at: appointment.toISOString(),
            sender_timezone: userTimezone,
            message: message.value.trim()
        };

        submit.disabled = true;
        result.textContent = "Saving...";

        const query = editingId
            ? _supabase
                .from("ceoxb_coffee_requests")
                .update(fields)
                .eq("id", editingId)
            : _supabase
                .from("ceoxb_coffee_requests")
                .insert(fields);

        const { error } = await query;

        submit.disabled = false;

        if (error) {
            result.textContent = "Unable to save request: " + error.message;
            return;
        }

        const wasEditing = Boolean(editingId);

        resetForm();
        await loadRequests();

        result.textContent = wasEditing
            ? "Coffee chat request updated."
            : "Coffee chat request sent.";

        renderRequests();
    });

    tabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
            currentFilter = tab.dataset.coffeeFilter;

            tabs.forEach(function (other) {
                other.classList.toggle(
                    "active",
                    other === tab
                );
            });

            renderRequests();
        });
    });

    submit.disabled = true;
    result.textContent = "Loading your coffee chats...";

    try {
        currentUser = await getCurrentUser();

        if (!currentUser) {
            result.textContent =
                "Please sign in to use Coffee Chats.";
            return;
        }

        const memberStatus = document.getElementById("coffee-member-status") || document.createElement("p");

        member.replaceChildren();

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select a member";
        member.appendChild(placeholder);

        const { data: members, error: membersError } = await _supabase
            .from("profiles")
            .select("id, name, role, company, timezone")
            .order("name");

        if (membersError) {
            memberStatus.textContent = "Unable to load members.";
            return;
        }

        const me = (members || []).find(function(profile) {
            return profile.id === currentUser.id;
        });

        // Keep our own time zone current so others see the right time
        if (me && me.timezone !== userTimezone) {
            await _supabase
                .from("profiles")
                .update({ timezone: userTimezone })
                .eq("id", currentUser.id);
        }

        const otherMembers = (members || []).filter(function(profile) {
            return profile.id !== currentUser.id;
        });

        otherMembers.forEach(function(profile) {
            const option = document.createElement("option");

            option.value = profile.id;
            option.dataset.timezone = profile.timezone || "";

            option.textContent = [
                profile.name || "Unnamed member",
                profile.company
            ].filter(Boolean).join(" · ");

            member.appendChild(option);
        });
        const selectedMember = new URLSearchParams(
            window.location.search
        ).get("member");

        if (selectedMember && otherMembers.some(function(profile) {
            return profile.id === selectedMember;
        })) {
            member.value = selectedMember;
        }
        memberStatus.textContent = otherMembers.length
            ? otherMembers.length + " members available"
            : "No other members found.";

        submit.disabled = otherMembers.length === 0;

        if (await loadRequests()) {
            result.textContent = "";
        }

        updateMeetingPreview();
    } catch (error) {
        result.textContent =
            "Unable to load your coffee chats.";
    }

    renderRequests();
});
