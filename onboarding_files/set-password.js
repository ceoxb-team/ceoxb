// SET PASSWORD (set-password.html)
// The invite email from an approved application links here. Supabase signs
// the new member in from the link, and they choose their password.

(function () {
  const form = document.getElementById("set-password-form");
  const notice = document.getElementById("auth-message");
  const signinLink = document.getElementById("set-password-signin");
  const saveButton = document.getElementById("save-password");

  function setNotice(message) {
    notice.textContent = message;
  }

  function showLinkProblem(message) {
    document.getElementById("set-password-intro").hidden = true;
    setNotice(message);
    signinLink.hidden = false;
  }

  (async function () {
    // Only offer the form when this visit came from an invite link, so it
    // never changes the password of someone who was already signed in
    const link = new URLSearchParams((window.inviteLinkHash || "").slice(1));

    if (link.get("error")) {
      await _supabase.auth.signOut();
      showLinkProblem(
        "This invite link is invalid or has expired. Go to Sign In and use " +
        "\"Send Email Code\" with your email to get in."
      );
      return;
    }

    if (link.get("type") !== "invite") {
      showLinkProblem("Open this page from the invite link in your email.");
      return;
    }

    const { data } = await _supabase.auth.getSession();

    // The session must be the one this invite link just created
    if (!data.session || !link.get("access_token") ||
        data.session.access_token !== link.get("access_token")) {
      showLinkProblem(
        "This invite link is invalid or has expired. Go to Sign In and use " +
        "\"Send Email Code\" with your email to get in."
      );
      return;
    }

    form.hidden = false;
    document.getElementById("new-password").focus();
  })();

  // The browser blocks too-short passwords before "submit"; explain why
  form.addEventListener("invalid", function () {
    setNotice("Your password needs at least 8 characters.");
  }, true);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const password = document.getElementById("new-password").value;
    const confirm = document.getElementById("confirm-password").value;

    if (password.length < 8) {
      setNotice("Your password needs at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setNotice("The passwords don't match.");
      return;
    }

    saveButton.disabled = true;
    setNotice("Saving...");

    const { error } = await _supabase.auth.updateUser({ password: password });

    if (error) {
      setNotice("Unable to save your password: " + error.message);
      saveButton.disabled = false;
      return;
    }

    setNotice("Password saved! Taking you to your dashboard...");
    window.location.replace("../dashboard.html");
  });
})();
