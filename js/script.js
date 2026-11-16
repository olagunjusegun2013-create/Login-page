/**
 * Interactive Form & Auth — Client-Side Validation, UX Feedback & API Integration
 *
 * Features:
 * 1. Create Account & Sign In mode switching + inline Forgot Password flow.
 * 2. Real-time validation, focus/blur events, smart phone auto-formatting, and Confirm Password check.
 * 3. Form-level error summary banner & per-field Caps Lock indicator.
 * 4. Real server-backed registration, login (with Remember Me), session check, and sign-out.
 */

(function () {
  "use strict";

  // Mode & Header Elements
  const modeSwitcher = document.getElementById("modeSwitcher");
  const tabRegister = document.getElementById("tab-register");
  const tabLogin = document.getElementById("tab-login");
  const formHeader = document.getElementById("formHeader");
  const formHeading = document.getElementById("form-heading");
  const formSubtitle = document.getElementById("form-subtitle");

  // Error Summary Elements
  const formErrorSummary = document.getElementById("formErrorSummary");
  const formErrorSummaryText = document.getElementById("formErrorSummaryText");

  // Main Auth Form Elements
  const form = document.getElementById("interactiveForm");
  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const phoneInput = document.getElementById("phone");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const rememberMeCheckbox = document.getElementById("rememberMe");
  const rememberMeRow = document.getElementById("rememberMeRow");

  const togglePasswordBtn = document.getElementById("togglePassword");
  const toggleConfirmPasswordBtn = document.getElementById("toggleConfirmPassword");
  const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  const capsLockWarning = document.getElementById("caps-lock-warning");
  const confirmCapsLockWarning = document.getElementById("confirm-caps-lock-warning");

  const submitBtn = document.getElementById("submitBtn");
  const clearFormBtn = document.getElementById("clearFormBtn");

  // Password Strength Elements
  const strengthBar = document.getElementById("strengthBar");
  const strengthLabel = document.getElementById("strengthLabel");
  const passwordRules = {
    length: document.getElementById("rule-length"),
    upper: document.getElementById("rule-upper"),
    lower: document.getElementById("rule-lower"),
    number: document.getElementById("rule-number"),
    special: document.getElementById("rule-special"),
  };

  // Forgot Password Elements
  const forgotPasswordForm = document.getElementById("forgotPasswordForm");
  const resetEmailInput = document.getElementById("resetEmail");
  const resetEmailGroup = document.getElementById("group-resetEmail");
  const resetEmailError = document.getElementById("resetEmail-error");
  const resetStatusMessage = document.getElementById("resetStatusMessage");
  const sendResetBtn = document.getElementById("sendResetBtn");
  const backToLoginBtn = document.getElementById("backToLoginBtn");

  // Authenticated / Success Panel Elements
  const successPanel = document.getElementById("successPanel");
  const successTitle = document.getElementById("successTitle");
  const successDescription = document.getElementById("successDescription");
  const summaryName = document.getElementById("summary-name");
  const summaryEmail = document.getElementById("summary-email");
  const summaryPhone = document.getElementById("summary-phone");
  const logoutBtn = document.getElementById("logoutBtn");

  const registerOnlyElements = document.querySelectorAll("[data-register-only='true']");
  const registerOnlyInputs = [nameInput, phoneInput, confirmPasswordInput];

  // Application State: "register" | "login" | "forgot"
  let currentMode = "register";
  let isSubmitting = false;

  const touchedFields = {
    name: false,
    email: false,
    phone: false,
    password: false,
    confirmPassword: false,
    resetEmail: false,
  };

  // =========================================================================
  // 1. Validation & Formatting Helpers
  // =========================================================================

  function validateName(value) {
    if (value.trim().length === 0) {
      return "Name is required. Please enter your name.";
    }
    return "";
  }

  function validateEmail(value) {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return "Email address is required.";
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailPattern.test(trimmed) || trimmed.includes("..")) {
      return "Please enter a valid email address (e.g., name@example.com).";
    }
    const [localPart, domainPart] = trimmed.split("@");
    if (
      !localPart ||
      !domainPart ||
      localPart.startsWith(".") ||
      localPart.endsWith(".") ||
      domainPart.startsWith(".") ||
      domainPart.endsWith(".")
    ) {
      return "Please enter a valid email address (e.g., name@example.com).";
    }
    return "";
  }

  function validatePhone(value) {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return "Phone number is required.";
    }
    const allowedCharsPattern = /^[+]?[\d\s().-]+$/;
    if (!allowedCharsPattern.test(trimmed)) {
      return "Phone number can only contain digits, spaces, parentheses, hyphens, or a leading +.";
    }
    const digitsOnly = trimmed.replace(/\D/g, "");
    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
      return "Please enter a valid phone number containing 10 to 15 digits.";
    }
    return "";
  }

  /**
   * Auto-formats 10-digit local phone numbers as (555) 234-5678 while typing,
   * preserving cursor position. Leaves invalid characters (so validation errors
   * display) and international '+' or 11+ digit numbers untouched.
   */
  function applyPhoneFormatting(inputEl) {
    const rawValue = inputEl.value;
    if (!rawValue || rawValue.trim().startsWith("+")) {
      return;
    }

    // Do not strip invalid characters like letters—let validation report the error
    if (!/^[\d\s()-]+$/.test(rawValue)) {
      return;
    }

    const digits = rawValue.replace(/\D/g, "");
    if (digits.length === 0 || digits.length > 10) {
      return;
    }

    let formatted;
    if (digits.length <= 3) {
      formatted = digits;
    } else if (digits.length <= 6) {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }

    if (formatted === rawValue) {
      return;
    }

    // Preserve cursor position based on how many digits appeared before the cursor
    const selectionStart = inputEl.selectionStart ?? rawValue.length;
    const digitsBeforeCursor = rawValue.slice(0, selectionStart).replace(/\D/g, "").length;

    inputEl.value = formatted;

    let newCursorPos = formatted.length;
    if (digitsBeforeCursor < digits.length) {
      let seenDigits = 0;
      newCursorPos = 0;
      while (newCursorPos < formatted.length && seenDigits < digitsBeforeCursor) {
        if (/\d/.test(formatted[newCursorPos])) {
          seenDigits += 1;
        }
        newCursorPos += 1;
      }
    }

    inputEl.setSelectionRange(newCursorPos, newCursorPos);
  }

  function evaluatePassword(value) {
    const checks = {
      length: value.length >= 8,
      upper: /[A-Z]/.test(value),
      lower: /[a-z]/.test(value),
      number: /\d/.test(value),
      special: /[^A-Za-z0-9\s]/.test(value),
    };

    const metCount = Object.values(checks).filter(Boolean).length;

    let errorMessage = "";
    if (value.length === 0) {
      errorMessage = "Password is required.";
    } else if (currentMode === "register") {
      if (!checks.length) {
        errorMessage = "Password must be at least 8 characters long.";
      } else if (!checks.upper) {
        errorMessage = "Password must include at least one uppercase letter.";
      } else if (!checks.lower) {
        errorMessage = "Password must include at least one lowercase letter.";
      } else if (!checks.number) {
        errorMessage = "Password must include at least one number.";
      } else if (!checks.special) {
        errorMessage = "Password must include at least one special character (e.g., !@#$%).";
      }
    }

    return { checks, metCount, errorMessage };
  }

  function validatePassword(value) {
    return evaluatePassword(value).errorMessage;
  }

  function validateConfirmPassword(value) {
    if (value.length === 0) {
      return "Please confirm your password.";
    }
    if (value !== passwordInput.value) {
      return "Passwords do not match.";
    }
    return "";
  }

  // =========================================================================
  // 2. UI State Updates
  // =========================================================================

  function showErrorSummary(message) {
    formErrorSummaryText.textContent = message;
    formErrorSummary.hidden = false;
  }

  function hideErrorSummary() {
    formErrorSummaryText.textContent = "";
    formErrorSummary.hidden = true;
  }

  function updatePasswordStrengthUI(value) {
    const { checks, metCount } = evaluatePassword(value);

    Object.keys(passwordRules).forEach((ruleKey) => {
      const ruleEl = passwordRules[ruleKey];
      ruleEl.classList.toggle("is-met", checks[ruleKey]);
    });

    strengthBar.className = "strength-bar";

    if (value.length === 0) {
      strengthLabel.textContent = "Not entered";
      return;
    }

    if (metCount <= 2) {
      strengthBar.classList.add("strength-weak");
      strengthLabel.textContent = "Weak";
    } else if (metCount === 3) {
      strengthBar.classList.add("strength-fair");
      strengthLabel.textContent = "Fair";
    } else if (metCount === 4) {
      strengthBar.classList.add("strength-good");
      strengthLabel.textContent = "Good";
    } else {
      strengthBar.classList.add("strength-strong");
      strengthLabel.textContent = "Strong";
    }
  }

  function updateFieldFeedback(inputEl, errorEl, groupEl, errorMessage) {
    if (errorMessage) {
      groupEl.classList.add("is-invalid");
      groupEl.classList.remove("is-valid");
      inputEl.setAttribute("aria-invalid", "true");
      errorEl.textContent = errorMessage;
      errorEl.classList.add("is-visible");
      return false;
    }

    groupEl.classList.remove("is-invalid");
    groupEl.classList.add("is-valid");
    inputEl.setAttribute("aria-invalid", "false");
    errorEl.textContent = "";
    errorEl.classList.remove("is-visible");
    return true;
  }

  function clearFieldState(field) {
    touchedFields[field.key] = false;
    field.group.classList.remove("is-focused", "is-invalid", "is-valid");
    field.input.removeAttribute("aria-invalid");
    field.errorEl.textContent = "";
    field.errorEl.classList.remove("is-visible");
  }

  const fields = [
    {
      key: "name",
      input: nameInput,
      group: document.getElementById("group-name"),
      errorEl: document.getElementById("name-error"),
      validate: validateName,
      modes: ["register"],
    },
    {
      key: "email",
      input: emailInput,
      group: document.getElementById("group-email"),
      errorEl: document.getElementById("email-error"),
      validate: validateEmail,
      modes: ["register", "login"],
    },
    {
      key: "phone",
      input: phoneInput,
      group: document.getElementById("group-phone"),
      errorEl: document.getElementById("phone-error"),
      validate: validatePhone,
      modes: ["register"],
    },
    {
      key: "password",
      input: passwordInput,
      group: document.getElementById("group-password"),
      errorEl: document.getElementById("password-error"),
      validate: validatePassword,
      modes: ["register", "login"],
    },
    {
      key: "confirmPassword",
      input: confirmPasswordInput,
      group: document.getElementById("group-confirmPassword"),
      errorEl: document.getElementById("confirmPassword-error"),
      validate: validateConfirmPassword,
      modes: ["register"],
    },
  ];

  function getActiveFields() {
    return fields.filter((field) => field.modes.includes(currentMode));
  }

  function validateSingleField(field) {
    const errorMessage = field.validate(field.input.value);
    return updateFieldFeedback(field.input, field.errorEl, field.group, errorMessage);
  }

  function refreshErrorSummaryIfVisible() {
    if (formErrorSummary.hidden) return;
    const activeFields = getActiveFields();
    const invalidCount = activeFields.filter((f) =>
      f.group.classList.contains("is-invalid")
    ).length;

    if (invalidCount === 0) {
      hideErrorSummary();
    } else {
      showErrorSummary(
        `Please fix ${invalidCount} highlighted ${invalidCount === 1 ? "field" : "fields"} below before submitting.`
      );
    }
  }

  function resetPasswordVisibility() {
    passwordInput.type = "password";
    togglePasswordBtn.textContent = "Show";
    togglePasswordBtn.setAttribute("aria-pressed", "false");
    togglePasswordBtn.setAttribute("aria-label", "Show password");

    confirmPasswordInput.type = "password";
    toggleConfirmPasswordBtn.textContent = "Show";
    toggleConfirmPasswordBtn.setAttribute("aria-pressed", "false");
    toggleConfirmPasswordBtn.setAttribute("aria-label", "Show confirm password");
  }

  function resetAllFormFields() {
    form.reset();
    hideErrorSummary();
    capsLockWarning.hidden = true;
    confirmCapsLockWarning.hidden = true;

    fields.forEach(clearFieldState);
    resetPasswordVisibility();
    updatePasswordStrengthUI("");
  }

  // =========================================================================
  // 3. Mode Switching & View Transitions
  // =========================================================================

  function setMode(mode) {
    if (isSubmitting) return;

    const previousMode = currentMode;
    currentMode = mode;
    hideErrorSummary();
    capsLockWarning.hidden = true;
    confirmCapsLockWarning.hidden = true;

    const isRegister = mode === "register";
    const isLogin = mode === "login";
    const isForgot = mode === "forgot";

    tabRegister.classList.toggle("is-active", isRegister);
    tabRegister.setAttribute("aria-selected", String(isRegister));
    tabLogin.classList.toggle("is-active", isLogin || isForgot);
    tabLogin.setAttribute("aria-selected", String(isLogin || isForgot));

    modeSwitcher.hidden = false;
    formHeader.hidden = false;
    successPanel.hidden = true;

    if (isForgot) {
      form.hidden = true;
      forgotPasswordForm.hidden = false;
      formHeading.textContent = "Reset Your Password";
      formSubtitle.textContent =
        "Enter your account email and we will send password reset instructions.";
      resetStatusMessage.hidden = true;
      resetEmailInput.value = emailInput.value.trim();
      touchedFields.resetEmail = false;
      resetEmailGroup.classList.remove("is-focused", "is-invalid", "is-valid");
      resetEmailInput.removeAttribute("aria-invalid");
      resetEmailError.textContent = "";
      resetEmailError.classList.remove("is-visible");
      resetEmailInput.focus();
      return;
    }

    forgotPasswordForm.hidden = true;
    form.hidden = false;

    registerOnlyElements.forEach((el) => {
      el.hidden = !isRegister;
    });

    // Disable hidden register-only inputs in Sign In mode so autofill skips them
    registerOnlyInputs.forEach((inputEl) => {
      inputEl.disabled = !isRegister;
    });

    rememberMeRow.hidden = !isLogin;
    forgotPasswordBtn.hidden = !isLogin;

    if (isRegister) {
      formHeading.textContent = "Create Your Account";
      formSubtitle.textContent =
        "Complete the required fields below. Each field validates in real time as you type and when you leave an input.";
      passwordInput.placeholder = "Create a strong password";
      passwordInput.setAttribute("autocomplete", "new-password");
      passwordInput.setAttribute(
        "aria-describedby",
        "caps-lock-warning password-strength-text password-rules password-error"
      );
      submitBtn.textContent = "Create Account";
    } else {
      formHeading.textContent = "Sign In to Your Account";
      formSubtitle.textContent =
        "Enter your registered email address and password to access your account.";
      passwordInput.placeholder = "Enter your password";
      passwordInput.setAttribute("autocomplete", "current-password");
      passwordInput.setAttribute(
        "aria-describedby",
        "caps-lock-warning password-error"
      );
      submitBtn.textContent = "Sign In";
    }

    // Clear password fields when switching between Sign In and Create Account
    if (previousMode !== mode) {
      passwordInput.value = "";
      confirmPasswordInput.value = "";
      resetPasswordVisibility();
      updatePasswordStrengthUI("");
    }

    fields.forEach(clearFieldState);
  }

  function showAuthenticatedView(user, modeLabel) {
    modeSwitcher.hidden = true;
    formHeader.hidden = true;
    form.hidden = true;
    forgotPasswordForm.hidden = true;
    hideErrorSummary();

    if (modeLabel === "register") {
      successTitle.textContent = "Account Created";
      successDescription.textContent =
        "All fields passed validation and your account has been created without reloading the page.";
    } else {
      successTitle.textContent = "Signed In";
      successDescription.textContent =
        "Welcome back. Your session is active and verified.";
    }

    summaryName.textContent = user.name;
    summaryEmail.textContent = user.email;
    summaryPhone.textContent = user.phone;

    successPanel.hidden = false;
    logoutBtn.focus();
  }

  // =========================================================================
  // 4. Focus, Blur, Caps Lock, and Real-Time Input Listeners
  // =========================================================================

  fields.forEach((field) => {
    field.input.addEventListener("focus", () => {
      field.group.classList.add("is-focused");
    });

    field.input.addEventListener("blur", () => {
      field.group.classList.remove("is-focused");
      if (!field.modes.includes(currentMode)) return;
      touchedFields[field.key] = true;
      validateSingleField(field);
      refreshErrorSummaryIfVisible();
    });

    field.input.addEventListener("input", () => {
      if (field.key === "phone") {
        applyPhoneFormatting(field.input);
      }

      if (field.key === "password" && currentMode === "register") {
        updatePasswordStrengthUI(field.input.value);
        if (touchedFields.confirmPassword || confirmPasswordInput.value.length > 0) {
          touchedFields.confirmPassword = true;
          const confirmField = fields.find((f) => f.key === "confirmPassword");
          if (confirmField) validateSingleField(confirmField);
        }
      }

      if (field.input.value.length > 0) {
        touchedFields[field.key] = true;
      }

      if (touchedFields[field.key]) {
        validateSingleField(field);
        refreshErrorSummaryIfVisible();
      }
    });
  });

  // Per-field Caps Lock Detection
  function bindCapsLockIndicator(inputEl, warningEl) {
    function handleKeyEvent(event) {
      if (typeof event.getModifierState === "function") {
        warningEl.hidden = !event.getModifierState("CapsLock");
      }
    }
    inputEl.addEventListener("keydown", handleKeyEvent);
    inputEl.addEventListener("keyup", handleKeyEvent);
    inputEl.addEventListener("blur", () => {
      warningEl.hidden = true;
    });
  }

  bindCapsLockIndicator(passwordInput, capsLockWarning);
  bindCapsLockIndicator(confirmPasswordInput, confirmCapsLockWarning);

  // Show/Hide Password Toggles
  function bindPasswordToggle(buttonEl, inputEl, labelBase) {
    buttonEl.addEventListener("click", () => {
      const isHidden = inputEl.type === "password";
      inputEl.type = isHidden ? "text" : "password";
      buttonEl.textContent = isHidden ? "Hide" : "Show";
      buttonEl.setAttribute("aria-pressed", String(isHidden));
      buttonEl.setAttribute("aria-label", `${isHidden ? "Hide" : "Show"} ${labelBase}`);
    });
  }

  bindPasswordToggle(togglePasswordBtn, passwordInput, "password");
  bindPasswordToggle(toggleConfirmPasswordBtn, confirmPasswordInput, "confirm password");

  // Mode Tab Clicks
  tabRegister.addEventListener("click", () => {
    if (currentMode !== "register") {
      setMode("register");
    }
  });

  tabLogin.addEventListener("click", () => {
    if (currentMode !== "login") {
      setMode("login");
    }
  });

  forgotPasswordBtn.addEventListener("click", () => {
    setMode("forgot");
  });

  backToLoginBtn.addEventListener("click", () => {
    setMode("login");
    emailInput.focus();
  });

  clearFormBtn.addEventListener("click", () => {
    resetAllFormFields();
    if (currentMode === "register") {
      nameInput.focus();
    } else {
      emailInput.focus();
    }
  });

  // Forgot Password Input Focus/Blur/Real-Time Validation
  resetEmailInput.addEventListener("focus", () => {
    resetEmailGroup.classList.add("is-focused");
  });

  resetEmailInput.addEventListener("blur", () => {
    resetEmailGroup.classList.remove("is-focused");
    touchedFields.resetEmail = true;
    updateFieldFeedback(
      resetEmailInput,
      resetEmailError,
      resetEmailGroup,
      validateEmail(resetEmailInput.value)
    );
  });

  resetEmailInput.addEventListener("input", () => {
    resetStatusMessage.hidden = true;
    if (resetEmailInput.value.length > 0) {
      touchedFields.resetEmail = true;
    }
    if (touchedFields.resetEmail) {
      updateFieldFeedback(
        resetEmailInput,
        resetEmailError,
        resetEmailGroup,
        validateEmail(resetEmailInput.value)
      );
    }
  });

  // =========================================================================
  // 5. Form Submissions & Session Lifecycle
  // =========================================================================

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const activeFields = getActiveFields();
    let firstInvalidField = null;
    let invalidCount = 0;

    activeFields.forEach((field) => {
      touchedFields[field.key] = true;
      const valid = validateSingleField(field);
      if (!valid) {
        invalidCount += 1;
        if (!firstInvalidField) {
          firstInvalidField = field.input;
        }
      }
    });

    if (invalidCount > 0) {
      showErrorSummary(
        `Please fix ${invalidCount} highlighted ${invalidCount === 1 ? "field" : "fields"} below before submitting.`
      );
      if (firstInvalidField) {
        firstInvalidField.focus();
      }
      return;
    }

    hideErrorSummary();
    isSubmitting = true;
    submitBtn.disabled = true;
    clearFormBtn.disabled = true;
    tabRegister.disabled = true;
    tabLogin.disabled = true;
    submitBtn.textContent =
      currentMode === "register" ? "Creating Account..." : "Signing In...";

    try {
      const endpoint = currentMode === "register" ? "/api/register" : "/api/login";
      const payload =
        currentMode === "register"
          ? {
              name: nameInput.value.trim(),
              email: emailInput.value.trim(),
              phone: phoneInput.value.trim(),
              password: passwordInput.value,
              confirmPassword: confirmPasswordInput.value,
            }
          : {
              email: emailInput.value.trim(),
              password: passwordInput.value,
              rememberMe: rememberMeCheckbox.checked,
            };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        let focusTarget = null;

        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          activeFields.forEach((field) => {
            if (data.fieldErrors[field.key]) {
              updateFieldFeedback(
                field.input,
                field.errorEl,
                field.group,
                data.fieldErrors[field.key]
              );
              if (!focusTarget) {
                focusTarget = field.input;
              }
            }
          });
        } else if (response.status === 401 && currentMode === "login") {
          // Clear green valid styling on rejected credentials
          activeFields.forEach((field) => {
            field.group.classList.remove("is-valid");
            field.input.removeAttribute("aria-invalid");
          });
          focusTarget = passwordInput;
        }

        showErrorSummary(
          data.error || "Unable to complete your request. Please check your details."
        );
        if (focusTarget) {
          focusTarget.focus();
        }
        return;
      }

      if (data.user) {
        showAuthenticatedView(data.user, currentMode);
      }
    } catch {
      showErrorSummary("Network error while reaching the server. Please try again.");
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
      clearFormBtn.disabled = false;
      tabRegister.disabled = false;
      tabLogin.disabled = false;
      submitBtn.textContent =
        currentMode === "register" ? "Create Account" : "Sign In";
    }
  });

  forgotPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    touchedFields.resetEmail = true;

    const emailError = validateEmail(resetEmailInput.value);
    const valid = updateFieldFeedback(
      resetEmailInput,
      resetEmailError,
      resetEmailGroup,
      emailError
    );

    if (!valid) {
      resetEmailInput.focus();
      return;
    }

    sendResetBtn.disabled = true;
    sendResetBtn.textContent = "Sending...";

    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmailInput.value.trim() }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        updateFieldFeedback(
          resetEmailInput,
          resetEmailError,
          resetEmailGroup,
          data.error || "Unable to send reset instructions."
        );
        return;
      }

      resetStatusMessage.textContent = data.message;
      resetStatusMessage.hidden = false;
    } catch {
      updateFieldFeedback(
        resetEmailInput,
        resetEmailError,
        resetEmailGroup,
        "Network error. Please try again."
      );
    } finally {
      sendResetBtn.disabled = false;
      sendResetBtn.textContent = "Send Reset Instructions";
    }
  });

  logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      logoutBtn.disabled = false;
      resetAllFormFields();
      setMode("login");
      emailInput.focus();
    }
  });

  async function checkExistingSession() {
    try {
      const response = await fetch("/api/me");
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (data && data.user) {
        showAuthenticatedView(data.user, "login");
      }
    } catch {
      // Ignore network errors during initial session probe
    }
  }

  setMode("register");
  checkExistingSession();
})();
