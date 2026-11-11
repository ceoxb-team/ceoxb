(function () {
  const find = id => document.getElementById(id);
  const status = find("cohort-page-status");
  const dashboard = find("dashboard-cohort-summary");

  if (!status && !dashboard) return;

  const db = typeof _supabase === "undefined" ? null : _supabase;

  let user = null;
  let role = "member";
  let memberships = [];
  let active = null;
  let meetings = [];

  const dateTime = value =>
    new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });

  function message(id, text) {
    if (find(id)) find(id).textContent = text;
  }

  function add(parent, tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function addOption(select, value, text) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  }

  function rows(result) {
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function loadMeetings() {
    const ids = memberships.map(item => item.cohort_id);
    if (!ids.length) return [];

    return rows(await db.from("ceoxb_cohort_meetings")
      .select("id,cohort_id,title,starts_at,ends_at,required,notes")
      .in("cohort_id", ids)
      .order("starts_at"));
  }

  async function updateAchievements() {
    if (!active) return;

    const completed = meetings.filter(meeting =>
      meeting.cohort_id === active.cohort_id &&
      meeting.required &&
      new Date(meeting.ends_at) < new Date()
    );

    const attendance = rows(await db
      .from("ceoxb_cohort_attendance")
      .select("meeting_id")
      .eq("user_id", user.id));

    const attended = new Set(
      attendance.map(item => item.meeting_id)
    );

    let streak = 0;
    let highest = 0;

    completed.forEach(meeting => {
      streak = attended.has(meeting.id) ? streak + 1 : 0;
      highest = Math.max(highest, streak);
    });

    const badges = [
      ["badge-cohort-member", true],
      [
        "badge-cohort-attendance",
        completed.length > 0 &&
        completed.every(meeting => attended.has(meeting.id))
      ],
      ["badge-cohort-streak", highest >= 3]
    ];

    badges.forEach(([id, earned]) => {
      const badge = find(id);
      if (!badge) return;

      badge.classList.toggle("earned", earned);
      badge.classList.toggle("locked", !earned);

      const label = badge.querySelector(".reward-status");
      if (label) label.textContent = earned ? "Earned" : "Locked";
    });

    const counter = find("earned-badge-count");
    if (counter) {
      const all = document.querySelectorAll(
        ".badge-collection .reward-badge"
      );
      const earned = document.querySelectorAll(
        ".badge-collection .reward-badge.earned"
      );

      counter.textContent =
        earned.length + " / " + all.length + " earned";
    }
  }

  async function showCurrent() {
    const cohort = active?.ceoxb_cohorts;

    if (!cohort) {
      message(
        "cohort-current",
        "You have not been assigned to a cohort yet."
      );
    
      message(
        "cohort-meetings",
        "Your required meetings will appear here once you join a cohort."
      );
    
      message(
        "cohort-notes-list",
        "Facilitator notes will appear after your cohort has been assigned."
      );
    
      message(
        "cohort-messages",
        "Group chat will be available when you are assigned to a cohort."
      );
    
      if (dashboard) {
        dashboard.textContent = "No current cohort assigned.";
      }
    
      return;
    }

    const upcoming = meetings
      .filter(meeting =>
        meeting.cohort_id === cohort.id &&
        new Date(meeting.ends_at) >= new Date()
      )
      .sort((a, b) =>
        new Date(a.starts_at) - new Date(b.starts_at)
      );

    if (dashboard) {
      dashboard.textContent = cohort.name +
        (upcoming.length
          ? " · Next meeting: " + dateTime(upcoming[0].starts_at)
          : " · No upcoming meeting scheduled.");
    }

    const current = find("cohort-current");

    if (current) {
      current.replaceChildren();
      add(current, "h3", cohort.name);
      add(
        current,
        "p",
        "Your time zone: " +
        Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      add(current, "p", "Attend your required cohort meetings and stay connected with your group.");
    }

    const list = find("cohort-meetings");

    if (list) {
      list.replaceChildren();
      
      const cohortMeetings = upcoming;
      
      if (!cohortMeetings.length) {
        add(
          list,
          "p",
          "No upcoming meetings scheduled. Check back for updates."
        );
      }

      cohortMeetings.forEach(meeting => {
        const card = document.createElement("div");
        card.className = "cohort-meeting-card";

        add(card, "strong", meeting.title || "Monthly Meeting");
        
        const meetingTime = add(
          card,
          "p",
          dateTime(meeting.starts_at) + " – " +
          new Date(meeting.ends_at).toLocaleTimeString(
            undefined,
            { hour: "numeric", minute: "2-digit" }
          )
        );
        
        meetingTime.className = "cohort-meeting-time";
        
        const requirement = add(
          card,
          "span",
          meeting.required ? "Required Meeting" : "Optional Meeting"
        );
        
        requirement.className = meeting.required
          ? "cohort-meeting-label required"
          : "cohort-meeting-label";

        list.appendChild(card);
      });
    }

    const notes = find("cohort-notes-list");

    if (notes) {
      notes.replaceChildren();

      const published = meetings.filter(meeting =>
        meeting.cohort_id === cohort.id && meeting.notes
      );

      if (!published.length) {
        add(notes, "p", "No facilitator notes posted yet.");
      }

      published.forEach(meeting => {
        const card = document.createElement("div");
        card.className = "cohort-meeting-card";

        add(card, "strong", meeting.title + " · " +
          dateTime(meeting.starts_at));
        add(card, "p", meeting.notes);

        notes.appendChild(card);
      });
    }

    await updateAchievements();
  }

  async function showChat() {
    const list = find("cohort-messages");

    if (!list || !active) return;

    const messages = rows(await db
      .from("ceoxb_cohort_messages")
      .select("id,author_id,body,created_at")
      .eq("cohort_id", active.cohort_id)
      .order("created_at", { ascending: true })
      .limit(100));

    list.replaceChildren();

    if (!messages.length) {
      add(list, "p", "No cohort messages yet.");
    }

    messages.forEach(item => {
      const card = document.createElement("div");
      card.className = "cohort-chat-message";

      add(
        card,
        "strong",
        (item.author_id === user.id ? "You" : "Cohort member") +
        " · " + dateTime(item.created_at)
      );
      add(card, "p", item.body);

      list.appendChild(card);
    });

    list.scrollTop = list.scrollHeight;
    find("cohort-message-form").hidden = false;
  }

  async function showHistory() {
    const container = find("cohort-history");
    if (!container) return;

    container.replaceChildren();

    const archived = memberships.filter(
      item => item.ceoxb_cohorts?.archived
    );

    if (!archived.length) {
      add(container, "p", "No past cohorts yet.");
    }

    archived.forEach(item => {
      const card = document.createElement("div");
      card.className = "cohort-meeting-card";

      add(card, "h3", item.ceoxb_cohorts.name);

      meetings
        .filter(meeting => meeting.cohort_id === item.cohort_id)
        .forEach(meeting => {
          add(card, "p", meeting.title + " · " +
            dateTime(meeting.starts_at));

          if (meeting.notes) {
            add(card, "p", "Facilitator notes: " + meeting.notes);
          }
        });

      container.appendChild(card);
    });
  }

  async function showFacilitator() {
    if (!active || !["facilitator", "admin"].includes(role)) {
      return;
    }

    find("cohort-facilitator-panel").hidden = false;

    const meetingSelect = find("facilitator-meeting");
    const memberSelect = find("attendance-member");

    meetingSelect.replaceChildren();
    memberSelect.replaceChildren();

    meetings
      .filter(meeting => meeting.cohort_id === active.cohort_id)
      .forEach(meeting => {
        addOption(
          meetingSelect,
          meeting.id,
          meeting.title + " · " + dateTime(meeting.starts_at)
        );
      });

    const members = rows(await db
      .from("ceoxb_cohort_members")
      .select("user_id")
      .eq("cohort_id", active.cohort_id));

    members.forEach(member => {
      addOption(
        memberSelect,
        member.user_id,
        member.user_id === user.id
          ? "You"
          : "Member " + member.user_id.slice(0, 8)
      );
    });

    function updateNotesField() {
      const meeting = meetings.find(
        item => item.id === meetingSelect.value
      );
      find("facilitator-notes").value = meeting?.notes || "";
    }

    meetingSelect.addEventListener("change", updateNotesField);
    updateNotesField();

    find("save-facilitator-notes").addEventListener(
      "click",
      async function () {
        if (!meetingSelect.value) return;

        const notes = find("facilitator-notes").value.trim();

        const { error } = await db.rpc(
          "ceoxb_save_facilitator_notes",
          { mid: meetingSelect.value, note: notes }
        );

        if (error) {
          message("facilitator-save-status", error.message);
          return;
        }

        const meeting = meetings.find(
          item => item.id === meetingSelect.value
        );

        if (meeting) meeting.notes = notes;

        message("facilitator-save-status", "Notes saved.");
        await showCurrent();
      }
    );

    find("mark-attendance").addEventListener(
      "click",
      async function () {
        if (!meetingSelect.value || !memberSelect.value) return;

        const { error } = await db
          .from("ceoxb_cohort_attendance")
          .upsert({
            meeting_id: meetingSelect.value,
            user_id: memberSelect.value
          }, { onConflict: "meeting_id,user_id" });

        message(
          "attendance-status",
          error ? error.message : "Attendance recorded."
        );

        if (!error) await updateAchievements();
      }
    );
  }

  async function showAdmin() {
    if (role !== "admin" || !find("cohort-admin-panel")) {
      return;
    }

    find("cohort-admin-panel").hidden = false;

    const cohorts = rows(await db
      .from("ceoxb_cohorts")
      .select("id,name")
      .order("created_at"));

    ["assign-cohort", "meeting-cohort", "archive-cohort"]
      .forEach(id => {
        const select = find(id);
        select.replaceChildren();

        cohorts.forEach(cohort =>
          addOption(select, cohort.id, cohort.name)
        );
      });

    const members = rows(await db.rpc(
      "ceoxb_admin_member_directory"
    ));

    ["assign-member", "role-member"].forEach(id => {
      const select = find(id);
      select.replaceChildren();

      members.forEach(member =>
        addOption(
          select,
          member.id,
          member.display_name || member.id.slice(0, 8)
        )
      );
    });

    find("create-cohort-form").addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        const name = find("new-cohort-name").value.trim();

        const { error } = await db
          .from("ceoxb_cohorts")
          .insert({ name });

        message(
          "cohort-admin-status",
          error ? error.message : "Cohort created. Reload to update menus."
        );
      }
    );

    find("assign-cohort-form").addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        const { error } = await db
          .from("ceoxb_cohort_members")
          .upsert({
            cohort_id: find("assign-cohort").value,
            user_id: find("assign-member").value
          }, { onConflict: "cohort_id,user_id" });

        message(
          "cohort-admin-status",
          error ? error.message : "CEO assigned to cohort."
        );
      }
    );

    find("set-facilitator-form").addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        const { error } = await db
          .from("ceoxb_roles")
          .upsert({
            user_id: find("role-member").value,
            role: "facilitator"
          }, { onConflict: "user_id" });

        message(
          "cohort-admin-status",
          error ? error.message : "Facilitator role granted."
        );
      }
    );

    find("archive-cohort-form").addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        const { error } = await db
          .from("ceoxb_cohorts")
          .update({ archived: true })
          .eq("id", find("archive-cohort").value);

        message(
          "cohort-admin-status",
          error ? error.message : "Cohort archived."
        );
      }
    );

    find("create-meeting-form").addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        const start = new Date(find("meeting-start").value);
        const end = new Date(find("meeting-end").value);

        if (!(end > start)) {
          message("cohort-admin-status", "End must be after start.");
          return;
        }

        const { error } = await db
          .from("ceoxb_cohort_meetings")
          .insert({
            cohort_id: find("meeting-cohort").value,
            title: find("meeting-title").value.trim(),
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            required: true
          });

        message(
          "cohort-admin-status",
          error
            ? error.message
            : "Required meeting scheduled in local time."
        );
      }
    );
  }

  async function start() {
    if (!db) {
      message("cohort-page-status", "Supabase is unavailable.");
      return;
    }

    try {
      user = await getCurrentUser();
      
      if (!user) {
        message("cohort-page-status", "Please sign in to view your cohorts.");
        message("cohort-current", "Sign in to see your cohort assignment.");
        message("cohort-notes-list", "Sign in to view meeting notes.");
        message("cohort-messages", "Sign in to view group messages.");
        return;
      }
      
      const assignedRole = rows(await db
        .from("ceoxb_roles")
        .select("role")
        .eq("user_id", user.id));

      role = assignedRole[0]?.role || "member";

      memberships = rows(await db
        .from("ceoxb_cohort_members")
        .select(
          "cohort_id,ceoxb_cohorts(id,name,archived,created_at)"
        )
        .eq("user_id", user.id));

      active = memberships.find(
        item => item.ceoxb_cohorts &&
          !item.ceoxb_cohorts.archived
      ) || null;

      meetings = await loadMeetings();

      await showCurrent();

      if (status) {
        status.textContent =
          "Meeting times are shown in your local time zone.";

        await showHistory();

        if (active) {
          await showChat();

          find("cohort-message-form").addEventListener(
            "submit",
            async event => {
              event.preventDefault();

              const input = find("cohort-message");
              const body = input.value.trim();
              if (!body) return;

              const { error } = await db
                .from("ceoxb_cohort_messages")
                .insert({
                  cohort_id: active.cohort_id,
                  author_id: user.id,
                  body
                });

              if (error) {
                message("cohort-chat-status", error.message);
                return;
              }

              input.value = "";
              message("cohort-chat-status", "Message sent.");
              await showChat();
            }
          );

          await showFacilitator();
        }

        await showAdmin();
      }
    } catch (error) {
      const text =
        "Cohort service not configured or access denied: " +
        (error.message || error);

      message("cohort-page-status", text);

      if (dashboard) {
        dashboard.textContent = "Cohort information unavailable.";
      }
    }
  }

  start();
})();

