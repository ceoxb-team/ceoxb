const summary = document.getElementById("application-summary");
const submitButton = document.getElementById("submit-application");
const statusMessage = document.getElementById("application-status");

const fields = [
  ["First Name", "firstName"],
  ["Last Name", "lastName"],
  ["Title", "title"],
  ["Email", "email"],
  ["LinkedIn Profile URL", "url"],
  ["Phone", "phoneNumber"],
  ["City", "city"],
  ["Country", "country"],
  ["Company Name", "companyName"],
  ["Company Website", "website"],
  ["Company Country", "companyCountry"],
  ["Industry", "companyIndustry"],
  ["Company Funding", "funding"],
  ["Company Funding Stage", "fundingStage"],
  ["Number of Employees", "numberOfEmployees"],
];

fields.forEach(function (field) {
  const paragraph = document.createElement("p");
  const label = document.createElement("strong");

  label.textContent = field[0] + ": ";
  paragraph.appendChild(label);

  paragraph.append(
    document.createTextNode(sessionStorage.getItem(field[1]) || "Not provided")
  );

  summary.appendChild(paragraph);
});

submitButton.addEventListener("click", async function () {
  const get = (key) => (sessionStorage.getItem(key) || "").trim();

  const required = [
    "firstName",
    "lastName",
    "title",
    "email",
    "url",
    "phoneNumber",
    "city",
    "country",
    "companyName",
    "website",
    "companyCountry",
    "companyIndustry",
    "funding",
    "fundingStage",
    "numberOfEmployees",
  ];

  if (required.some((key) => !get(key))) {
    statusMessage.textContent =
      "Missing information. Please complete the previous forms.";
    return;
  }

  submitButton.disabled = true;
  statusMessage.textContent = "Submitting application...";

  try {
    if (typeof _supabase === "undefined") {
      throw new Error("Application service is unavailable.");
    }

    const captchaToken =
      typeof grecaptcha !== "undefined" ? grecaptcha.getResponse() : "";

    if (!captchaToken) {
      throw new Error("Please check the \"I'm not a robot\" box.");
    }

    // Sent to the submit-application Edge Function, which checks the
    // captcha and validates everything before saving
    const body = { captchaToken: captchaToken };
    required.forEach((key) => (body[key] = get(key)));
    body.company_fax = document.getElementById("company-fax").value;

    const { error } = await _supabase.functions.invoke("submit-application", {
      body: body,
    });

    if (error) {
      let message = "Please try again later.";

      try {
        message = (await error.context.json()).error || message;
      } catch (ignored) {}

      throw new Error(message);
    }

    required.forEach((key) => sessionStorage.removeItem(key));
    sessionStorage.removeItem("url");

    // Thank-you page; replace() so Back doesn't return to a submitted form
    window.location.replace("additional-info.html");
  } catch (error) {
    statusMessage.textContent =
      "Unable to submit your application: " + error.message;

    // Each captcha token works once, so get a fresh one for a retry
    if (typeof grecaptcha !== "undefined") {
      grecaptcha.reset();
    }

    submitButton.disabled = false;
  }
});
