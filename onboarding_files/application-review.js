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

    const { error } = await _supabase.from("applications").insert({
      first_name: get("firstName"),
      last_name: get("lastName"),
      title: get("title"),
      email: get("email"),
      url: get("url"),
      phone: get("phoneNumber"),
      city: get("city"),
      country: get("country"),
      company_name: get("companyName"),
      company_website: get("website"),
      company_country: get("companyCountry"),
      industry: get("companyIndustry"),
      funding: get("funding"),
      funding_stage: get("fundingStage"),
      number_of_employees: get("numberOfEmployees"),
    });

    if (error) {
      console.log("missing information!!");
      throw error;
    }

    required.forEach((key) => sessionStorage.removeItem(key));
    sessionStorage.removeItem("url");

    summary.hidden = true;
    submitButton.hidden = true;
    statusMessage.textContent =
      "Your application has been submitted successfully!";
  } catch (error) {
    statusMessage.textContent =
      "Unable to submit your application: " + error.message;

    submitButton.disabled = false;
  }
});
