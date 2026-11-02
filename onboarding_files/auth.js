(function () {
    const client = typeof _supabase !== "undefined" ? _supabase : null;
    const emailForm = document.getElementById("signin-form");
    const verificationForm = document.getElementById("verification-form");
    const notice = document.getElementById("auth-message");
    const loginEmailKey = "ceoxb-pending-email";

    function setNotice(message) {
        if (notice) {
            notice.textContent = message;
        }
    }

    async function withBusy(button, action) {
        if (button) button.disabled = true;

        try {
            await action();
        } catch (error) {
            setNotice(error?.message || "Unable to contact the sign-in service.");
        } finally {
            if (button) button.disabled = false;
        }
    }

    // Email entry page
    if (emailForm) {
        emailForm.addEventListener("submit", function (event) {
            event.preventDefault();

            if (!emailForm.reportValidity()) return;

            const email = document.getElementById("email").value.trim();

            sessionStorage.setItem(loginEmailKey, email);
            window.location.assign("password.html");
        });

        const googleButton = document.getElementById("google-signin");

        if (googleButton) {
            googleButton.addEventListener("click", async function () {
                if (!client) {
                    setNotice("Sign-in service is unavailable.");
                    return;
                }

                await withBusy(googleButton, async function () {
                    const { error } = await client.auth.signInWithOAuth({
                        provider: "google",
                        options: {
                            redirectTo: new URL(
                                "../dashboard.html",
                                window.location.href
                            ).href
                        }
                    });

                    if (error) setNotice(error.message);
                });
            });
        }

        const invitationButton = document.getElementById("signin-invitation");

        if (invitationButton) {
            invitationButton.addEventListener("click", function () {
                setNotice(
                    "Invitation registration is not configured yet. Please contact the CEO XB administrator."
                );
            });
        }
    }

        // Verification and password page
        if (verificationForm) {
            const email = sessionStorage.getItem(loginEmailKey);
    
            if (!email) {
                window.location.replace("signin.html");
                return;
            }
    
            const emailDisplay = document.getElementById("email-display");
            const codeInputs = Array.from(document.querySelectorAll(".otp-box"));
    
        function fillCode(value, startIndex = 0) {
            const digits = value.replace(/\D/g, "").slice(0, 6 - startIndex);
        
            if (!digits) return;
        
            for (let i = startIndex; i < codeInputs.length; i++) {
                codeInputs[i].value = "";
            }
        
            digits.split("").forEach(function(digit, index) {
                codeInputs[startIndex + index].value = digit;
            });
        
            const nextIndex = Math.min(startIndex + digits.length, 5);
            codeInputs[nextIndex].focus();
        }
    
    codeInputs.forEach(function(input, index) {
        input.addEventListener("input", function() {
            const digits = input.value.replace(/\D/g, "");
    
            input.value = "";
    
            if (digits) {
                fillCode(digits, index);
            }
        });
    
        input.addEventListener("keydown", function(event) {
            if (event.key === "Backspace") {
                event.preventDefault();
            
                if (input.value) {
                    input.value = "";
                } else if (index > 0) {
                    codeInputs[index - 1].value = "";
                    codeInputs[index - 1].focus();
                }
            }
    
            if (event.key === "ArrowLeft" && index > 0) {
                event.preventDefault();
                codeInputs[index - 1].focus();
            }
    
            if (event.key === "ArrowRight" && index < 5) {
                event.preventDefault();
                codeInputs[index + 1].focus();
            }
        });
    
        input.addEventListener("paste", function(event) {
            event.preventDefault();
    
            const pasted = event.clipboardData.getData("text");
            fillCode(pasted, index);
        });
    });
        
        const passwordInput = document.getElementById("password");
        const codeButton = document.getElementById("send-code");
        const passwordButton = document.getElementById("password-signin");
        const verifyButton = document.getElementById("verify-code");

        if (emailDisplay) emailDisplay.textContent = email;

        // Send verification code
        codeButton.addEventListener("click", async function () {
            if (!client) {
                setNotice("Sign-in service is unavailable.");
                return;
            }

            await withBusy(codeButton, async function () {
                setNotice("Requesting a verification code...");

                const { error } = await client.auth.signInWithOtp({
                    email: email,
                    options: {
                        shouldCreateUser: false
                    }
                });

                setNotice(
                    error
                        ? error.message
                        : "If this email has an existing account, check your inbox for a six-digit code."
                );
            });
        });

        // Verify email code
        verificationForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            if (!client) {
                setNotice("Sign-in service is unavailable.");
                return;
            }

            const code = codeInputs.map(input => input.value).join("");

            if (!/^\d{6}$/.test(code)) {
                setNotice("Enter the six-digit code from your email.");
                const firstEmpty = codeInputs.find(input => !input.value);
                (firstEmpty || codeInputs[0]).focus();
                return;
            }

            await withBusy(verifyButton, async function () {
                setNotice("Verifying code...");

                const { error } = await client.auth.verifyOtp({
                    email: email,
                    token: code,
                    type: "email"
                });

                if (error) {
                    setNotice(error.message);
                    return;
                }

                sessionStorage.removeItem(loginEmailKey);
                window.location.assign("../dashboard.html");
            });
        });

        // Sign in with password
        passwordButton.addEventListener("click", async function () {
            if (!client) {
                setNotice("Sign-in service is unavailable.");
                return;
            }

            if (!passwordInput.value) {
                setNotice("Enter your password.");
                passwordInput.focus();
                return;
            }

            await withBusy(passwordButton, async function () {
                setNotice("Signing in...");

                const { error } = await client.auth.signInWithPassword({
                    email: email,
                    password: passwordInput.value
                });

                if (error) {
                    setNotice(error.message);
                    return;
                }

                sessionStorage.removeItem(loginEmailKey);
                window.location.assign("../dashboard.html");
            });
        });
    }
})();
