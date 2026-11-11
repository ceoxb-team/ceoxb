const fullCalendar = document.getElementById("full-calendar-days");

if (fullCalendar) {
    const today = new Date();

    let displayedYear = today.getFullYear();
    let displayedMonth = today.getMonth();

    const monthTitle = document.getElementById("full-calendar-month");
    const selectedDate = document.getElementById("selected-date");
    const selectedInfo = document.getElementById("selected-date-info");
    const eventForm = document.getElementById("calendar-event-form");
    const eventList = document.getElementById("calendar-event-list");
    const eventStatus = document.getElementById("calendar-event-status");
    
    let events = [];
    let cohortMeetings = [];
    let currentUser = null;
    let selectedDay = today.getDate();

    function localDateKey(value) {
        const date = new Date(value);

        return dateKey(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        );
    }
    
    function dateKey(year, month, day) {
        return [
            year,
            String(month + 1).padStart(2, "0"),
            String(day).padStart(2, "0")
        ].join("-");
    }
    
    function renderSelectedEvents() {
        eventList.replaceChildren();
    
        const key = dateKey(displayedYear, displayedMonth, selectedDay);
        const matching = events
            .filter(event => event.date === key)
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    
        const matchingCohortMeetings = cohortMeetings
            .filter(meeting => localDateKey(meeting.starts_at) === key)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

        const totalEvents = matching.length + matchingCohortMeetings.length;

        selectedInfo.textContent = totalEvents
            ? totalEvents + (totalEvents === 1
                ? " scheduled item."
                : " scheduled items.")
            : "No meetings or personal events scheduled for this date.";

        matchingCohortMeetings.forEach(function(meeting) {
            const card = document.createElement("div");
            card.className = "calendar-event-item cohort-calendar-event";

            const title = document.createElement("strong");
            title.textContent = "Cohort Meeting: " + meeting.title;

            const time = document.createElement("p");
            time.textContent =
                new Date(meeting.starts_at).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit"
                }) +
                " - " +
                new Date(meeting.ends_at).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit"
                });

            const requirement = document.createElement("p");
            requirement.textContent = meeting.required
                ? "Required"
                : "Optional";

            const link = document.createElement("a");
            link.href = "cohorts.html";
            link.textContent = "View Cohort";

            card.append(title, time, requirement, link);
            eventList.appendChild(card);
        });

    
        matching.forEach(function(event) {
            const card = document.createElement("div");
            card.className = "calendar-event-item";
    
            const title = document.createElement("strong");
            title.textContent = event.title;
    
            const timeText = document.createElement("p");
            timeText.textContent = new Date(event.startsAt)
                .toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit"
                });
    
            card.append(title, timeText);
    
            if (event.description) {
                const description = document.createElement("p");
                description.textContent = event.description;
                card.appendChild(description);
            }
    
            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "Remove Personal Event";
    
            remove.addEventListener("click", async function() {
                remove.disabled = true;

                const { error } = await _supabase
                    .from("ceoxb_personal_events")
                    .delete()
                    .eq("id", event.id);

                if (error) {
                    remove.disabled = false;
                    eventStatus.textContent =
                        "Unable to remove event: " + error.message;
                    return;
                }

                events = events.filter(item => item.id !== event.id);
                eventStatus.textContent = "Personal event removed.";

                renderSelectedEvents();
                renderCalendar();
            });
    
            card.appendChild(remove);
            eventList.appendChild(card);
        });
    }
    
    function toEvent(row) {
        return {
            id: row.id,
            title: row.title,
            date: localDateKey(row.starts_at),
            startsAt: row.starts_at,
            description: row.description || ""
        };
    }

    function showSelectedDate(year, month, day) {
        const date = new Date(year, month, day);

        selectedDate.textContent = date.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        });

        selectedDay = day;
        renderSelectedEvents();

        fullCalendar.querySelectorAll("button.calendar-day")
            .forEach(function(button) {
                button.classList.remove("selected");
                button.setAttribute("aria-pressed", "false");
            });

        const selectedButton = fullCalendar.querySelector(
            '[data-day="' + day + '"]'
        );

        if (selectedButton) {
            selectedButton.classList.add("selected");
            selectedButton.setAttribute("aria-pressed", "true");
        }
    }

    function renderCalendar() {
        fullCalendar.innerHTML = "";

        const firstDay = new Date(
            displayedYear, displayedMonth, 1
        ).getDay();

        const daysInMonth = new Date(
            displayedYear, displayedMonth + 1, 0
        ).getDate();

        const monthDate = new Date(
            displayedYear, displayedMonth, 1
        );

        monthTitle.textContent = monthDate.toLocaleDateString(
            "en-US", {
                month: "long",
                year: "numeric"
            }
        );

        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement("div");
            empty.className = "calendar-day empty";
            fullCalendar.appendChild(empty);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "calendar-day";
            cell.textContent = day;
            cell.dataset.day = day;
            cell.setAttribute("aria-pressed", "false");
            const key = dateKey(displayedYear, displayedMonth, day);
            const hasPersonalEvents = events.some(
                event => event.date === key
            );
            
            const hasCohortMeetings = cohortMeetings.some(
                meeting => localDateKey(meeting.starts_at) === key
            );
            
            if (hasPersonalEvents || hasCohortMeetings) {
                cell.classList.add("has-events");
            
                if (hasPersonalEvents) {
                    cell.classList.add("has-personal-events");
                }
            
                if (hasCohortMeetings) {
                    cell.classList.add("has-cohort-meetings");
                }
            
                const eventTypes = [];
            
                if (hasPersonalEvents) {
                    eventTypes.push("personal events");
                }
            
                if (hasCohortMeetings) {
                    eventTypes.push("cohort meetings");
                }
            
                cell.setAttribute(
                    "aria-label",
                    day + " - " + eventTypes.join(" and ")
                );
            }
            
            if (
                selectedDay === day &&
                selectedDate.textContent !== "Select a date"
            ) {
                cell.classList.add("selected");
                cell.setAttribute("aria-pressed", "true");
            }

            if (
                displayedYear === today.getFullYear() &&
                displayedMonth === today.getMonth() &&
                day === today.getDate()
            ) {
                cell.classList.add("today");
            }

            cell.addEventListener("click", function() {
                showSelectedDate(
                    displayedYear, displayedMonth, day
                );
            });

            fullCalendar.appendChild(cell);
        }
    }

    document.getElementById("calendar-prev")
        .addEventListener("click", function() {
            displayedMonth--;

            if (displayedMonth < 0) {
                displayedMonth = 11;
                displayedYear--;
            }
            selectedDay = 1;
            renderCalendar();
            showSelectedDate(displayedYear, displayedMonth, 1);
        });

    document.getElementById("calendar-next")
        .addEventListener("click", function() {
            displayedMonth++;

            if (displayedMonth > 11) {
                displayedMonth = 0;
                displayedYear++;
            }
            selectedDay = 1;
            renderCalendar();
            showSelectedDate(displayedYear, displayedMonth, 1);
        });

    document.getElementById("calendar-today")
        .addEventListener("click", function() {
            const currentDate = new Date();
            
            displayedYear = currentDate.getFullYear();
            displayedMonth = currentDate.getMonth();
            selectedDay = currentDate.getDate();

            renderCalendar();

            showSelectedDate(
                displayedYear,
                displayedMonth,
                currentDate.getDate()
            );
        });

        eventForm.addEventListener("submit", async function(event) {
            event.preventDefault();
        
            if (!currentUser) {
                eventStatus.textContent = "Please sign in first.";
                return;
            }
        
            const title = document.getElementById("event-title").value.trim();
            const timeValue = document.getElementById("event-time").value;
            const description = document.getElementById("event-description")
                .value.trim();
        
            if (!title || !timeValue) return;
        
            const dayKey = dateKey(displayedYear, displayedMonth, selectedDay);
            const instant = new Date(dayKey + "T" + timeValue);
        
            if (Number.isNaN(instant.getTime())) {
                eventStatus.textContent = "Choose a valid event time.";
                return;
            }
        
            const { data, error } = await _supabase
                .from("ceoxb_personal_events")
                .insert({
                    title: title,
                    starts_at: instant.toISOString(),
                    description: description
                })
                .select("id, title, starts_at, description")
                .single();

            if (error) {
                eventStatus.textContent =
                    "Unable to save event: " + error.message;
                return;
            }

            events.push(toEvent(data));
        
            eventForm.reset();
            eventStatus.textContent = "Personal event added.";
        
            renderSelectedEvents();
            renderCalendar();
        });
        
        renderCalendar();
        
        showSelectedDate(
            displayedYear,
            displayedMonth,
            today.getDate()
        );
    
        getCurrentUser().then(async function(user) {
            if (!user) return;
        
            currentUser = user;

            const { data: savedEvents, error: eventsError } = await _supabase
                .from("ceoxb_personal_events")
                .select("id, title, starts_at, description")
                .order("starts_at");

            if (eventsError) {
                eventStatus.textContent =
                    "Unable to load personal events: " + eventsError.message;
            } else {
                events = (savedEvents || []).map(toEvent);
            }
        
            renderCalendar();
            renderSelectedEvents();
            try {
                if (typeof _supabase === "undefined") {
                    throw new Error("Supabase is unavailable.");
                }

                const { data: memberships, error: memberError } =
                    await _supabase
                        .from("ceoxb_cohort_members")
                        .select("cohort_id, ceoxb_cohorts(archived)")
                        .eq("user_id", user.id);

                if (memberError) throw memberError;

                const cohortIds = (memberships || [])
                    .filter(item =>
                        item.ceoxb_cohorts &&
                        !item.ceoxb_cohorts.archived
                    )
                    .map(item => item.cohort_id);

                if (cohortIds.length) {
                    const { data: meetings, error: meetingError } =
                        await _supabase
                            .from("ceoxb_cohort_meetings")
                            .select(
                                "id, cohort_id, title, starts_at, ends_at, required"
                            )
                            .in("cohort_id", cohortIds)
                            .order("starts_at");

                    if (meetingError) throw meetingError;

                    cohortMeetings = (meetings || []).filter(meeting =>
                        !Number.isNaN(
                            new Date(meeting.starts_at).getTime()
                        )
                    );
                }

                renderCalendar();
                renderSelectedEvents();

            } catch (error) {
                console.error("Cohort calendar error:", error);
                eventStatus.textContent =
                    "Personal events loaded, but cohort meetings could not be loaded.";
            }
        }).catch(function() {
            eventStatus.textContent = "Unable to load personal events.";
        });
}
