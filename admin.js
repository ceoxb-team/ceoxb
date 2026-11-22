// ADMIN: review membership applications (admin.html).
// The database only shows applications to admins, and approving or
// declining goes through the approve-application Edge Function.

(function () {
  const list = document.getElementById("application-list");
  const status = document.getElementById("admin-status");
  const tabs = document.querySelectorAll(".admin-tabs button");

  if (!list) {
    return;
  }

  let currentTab = "pending";

  function setStatus(message) {
    status.textContent = message;
  }

  // Only link to real web addresses
  function safeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:"
        ? url.href
        : "";
    } catch (error) {
      return "";
    }
  }

  function addDetail(container, label, value, link) {
    if (!value) {
      return;
    }

    const row = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = label + ": ";
    row.appendChild(strong);

    const href = link ? safeUrl(value) : "";

    if (href) {
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = value;
      row.appendChild(anchor);
    } else {
      row.appendChild(document.createTextNode(value));
    }

    container.appendChild(row);
  }

  function formatDate(value) {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  async function review(application, decision, card, buttons) {
    const name = application.first_name + " " + application.last_name;

    const question = decision === "approve"
      ? "Approve " + name + " and email an invite to " + application.email + "?"
      : "Decline " + name + "'s application?";

    if (!window.confirm(question)) {
      return;
    }

    buttons.forEach((button) => (button.disabled = true));
    setStatus(decision === "approve" ? "Approving " + name + "..." : "Declining...");

    const { data, error } = await _supabase.functions.invoke(
      "approve-application",
      { body: { applicationId: application.id, decision: decision } }
    );

    if (error) {
      let message = "Please try again.";

      try {
        message = (await error.context.json()).error || message;
      } catch (ignored) {}

      setStatus("Unable to update " + name + ": " + message);
      buttons.forEach((button) => (button.disabled = false));
      return;
    }

    card.remove();

    if (decision === "decline") {
      setStatus(name + "'s application was declined.");
    } else if (data && data.invited) {
      setStatus(name + " was approved. An invite was sent to " + application.email + ".");
    } else {
      setStatus(name + " was approved. They already had an account, so they can sign in now.");
    }

    if (!list.querySelector(".admin-application")) {
      showEmpty();
    }
  }

  function showEmpty() {
    const empty = document.createElement("p");
    empty.className = "admin-empty";
    empty.textContent = currentTab === "pending"
      ? "No pending applications."
      : "No reviewed applications yet.";
    list.replaceChildren(empty);
  }

  function addApplication(application) {
    const card = document.createElement("article");
    card.className = "dashboard-card admin-application";

    const heading = document.createElement("h2");
    heading.textContent = application.first_name + " " + application.last_name;
    card.appendChild(heading);

    const subtitle = document.createElement("p");
    subtitle.className = "admin-application-role";
    subtitle.textContent = [application.title, application.company_name]
      .filter(Boolean).join(" at ");
    card.appendChild(subtitle);

    const details = document.createElement("div");
    details.className = "admin-application-details";

    addDetail(details, "Email", application.email);
    addDetail(details, "Phone", application.phone);
    addDetail(details, "LinkedIn", application.linkedin_url, true);
    addDetail(details, "Location",
      [application.city, application.country].filter(Boolean).join(", "));
    addDetail(details, "Company website", application.company_website, true);
    addDetail(details, "Company country", application.company_country);
    addDetail(details, "Industry", application.industry);
    addDetail(details, "Funding", application.funding);
    addDetail(details, "Funding stage", application.funding_stage);
    addDetail(details, "Employees", application.number_of_employees);
    addDetail(details, "Invitation code", application.invitation_code);
    addDetail(details, "Applied", formatDate(application.created_at));

    if (application.status !== "pending" && application.reviewed_at) {
      addDetail(details, "Reviewed", formatDate(application.reviewed_at));
    }

    card.appendChild(details);

    if (application.status === "pending") {
      const actions = document.createElement("div");
      actions.className = "admin-application-actions";

      const approve = document.createElement("button");
      approve.type = "button";
      approve.className = "admin-approve";
      approve.textContent = "Approve";

      const decline = document.createElement("button");
      decline.type = "button";
      decline.className = "admin-decline";
      decline.textContent = "Decline";

      const buttons = [approve, decline];
      approve.addEventListener("click", () =>
        review(application, "approve", card, buttons));
      decline.addEventListener("click", () =>
        review(application, "decline", card, buttons));

      actions.append(approve, decline);
      card.appendChild(actions);
    } else {
      const badge = document.createElement("span");
      badge.className = "admin-badge admin-badge-" + application.status;
      badge.textContent = application.status === "approved" ? "Approved" : "Declined";
      card.appendChild(badge);
    }

    list.appendChild(card);
  }

  async function loadApplications() {
    setStatus("Loading applications...");
    list.replaceChildren();

    let query = _supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: currentTab === "pending" });

    query = currentTab === "pending"
      ? query.eq("status", "pending")
      : query.in("status", ["approved", "declined"]).limit(50);

    const { data, error } = await query;

    if (error) {
      setStatus("Unable to load applications. Please refresh the page.");
      return;
    }

    setStatus("");

    if (data.length === 0) {
      showEmpty();
      return;
    }

    data.forEach(addApplication);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      currentTab = tab.dataset.status;
      tabs.forEach((other) =>
        other.setAttribute("aria-selected", String(other === tab)));
      loadApplications();
    });
  });

  // Only admins may use this page
  (async function () {
    const { data: isAdmin, error } = await _supabase.rpc("is_admin");

    if (error || isAdmin !== true) {
      window.location.replace("dashboard.html");
      return;
    }

    loadApplications();
  })();
})();
