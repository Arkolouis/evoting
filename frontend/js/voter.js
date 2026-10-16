// Login and OTP flow.

import { api } from "./api.js";
import { config } from "./config.js";
import { appState, setState, SCREENS } from "./state.js";
import { navigate, pushBallotGuard } from "./router.js";
import { handleApiFailure, loadBallotData } from "./flow.js";
import { escapeHtml, normalizeCode, validateCodeFormat } from "./utils.js";
import { icons } from "./ui.js";

// Demo values for the mock API only.
export const DEMO_VALID_CODE = "STU-8492-VOTE";
export const DEMO_VALID_PHONE = "020 000 0001";

const maskPhone = (phone) => {
  const digits = String(phone).replace(/\D/g, "");
  return `•••• ••• ${digits.slice(-3)}`;
};

export function renderVoterCode(state) {
  const { isLoading, error, voterCodeDraft, phoneDraft, loadingMessage } =
    state;

  return `
    <section class="card card--narrow stack stack--lg" aria-labelledby="codeTitle">
      <div class="stack">
        <h2 class="screen-title" id="codeTitle" tabindex="-1" data-screen-heading>Enter your voter ID</h2>
        <p class="lead">Use the ID you were given and the phone number you registered with. We will text you a one-time PIN (OTP).</p>
      </div>

      <form class="stack stack--lg" id="voterCodeForm" data-form="voter-code" novalidate>
        <div class="field">
          <label class="field_label" for="phoneInput">Phone number</label>
          <input
            class="input"
            id="phoneInput"
            name="phone"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="054 123 4567"
            value="${escapeHtml(phoneDraft)}"
            aria-describedby="${error ? "codeError" : ""}"
            aria-invalid="${error ? "true" : "false"}"
            data-autofocus
            data-focus-key="phone-input"
            ${isLoading ? "readonly" : ""}
          />
        </div>

        <div class="field">
          <div class="field_label-row">
            <label class="field_label" for="voterCodeInput">Voter ID</label>
            ${
              config.ENABLE_DEMO_TOOLS && config.USE_MOCK_API
                ? `<button type="button" class="link-btn" data-action="fill-demo-code" ${isLoading ? "disabled" : ""}>Use demo ID</button>`
                : ""
            }
          </div>
          <input
            class="input"
            id="voterCodeInput"
            name="code"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="XXXXX-XXXXX"
            value="${escapeHtml(voterCodeDraft)}"
            aria-describedby="${error ? "codeError" : ""}"
            aria-invalid="${error ? "true" : "false"}"
            data-focus-key="voter-code-input"
            ${isLoading ? "readonly" : ""}
          />
          <p class="field_error" id="codeError" role="alert">${error ? escapeHtml(error.message) : ""}</p>
        </div>

        <button type="submit" class="btn btn--primary btn--lg btn--block" ${isLoading ? "disabled" : ""}>
          ${
            isLoading
              ? `<span class="spinner" aria-hidden="true"></span> ${escapeHtml(loadingMessage || "Sending OTP…")}`
              : `Send OTP ${icons.arrowRight()}`
          }
        </button>
      </form>
    </section>`;
}

export function fillDemoCode() {
  const input = document.getElementById("voterCodeInput");
  const phone = document.getElementById("phoneInput");
  if (input) input.value = DEMO_VALID_CODE;
  if (phone) phone.value = DEMO_VALID_PHONE;
  (phone ?? input)?.focus();
  setState({
    voterCodeDraft: DEMO_VALID_CODE,
    phoneDraft: DEMO_VALID_PHONE,
    error: null,
  });
}

export async function submitVoterCode(form) {
  if (appState.isLoading) return;

  const rawCode = form.elements.code.value;
  const rawPhone = form.elements.phone.value;
  const formatError = validateCodeFormat(rawCode);
  if (formatError) {
    setState({
      voterCodeDraft: rawCode,
      phoneDraft: rawPhone,
      error: { message: "Please enter your voter ID." },
    });
    return;
  }
  if (!rawPhone.trim()) {
    setState({
      voterCodeDraft: rawCode,
      phoneDraft: rawPhone,
      error: { message: "Please enter your phone number." },
    });
    return;
  }

  const code = normalizeCode(rawCode);
  setState({
    voterCodeDraft: code,
    phoneDraft: rawPhone,
    error: null,
    isLoading: true,
    loadingMessage: "Sending OTP…",
  });

  try {
    const { resendInMs, devOtp } = await api.requestOtp(code, rawPhone);
    showOtpScreen({ resendInMs, devOtp });
  } catch (error) {
    handleApiFailure(error, "validate");
  }
}

function showOtpScreen({ resendInMs, devOtp }) {
  navigate(SCREENS.OTP, {
    patch: {
      isLoading: false,
      loadingMessage: "",
      error: null,
      otpInfo: { resendAt: Date.now() + resendInMs, devOtp: devOtp ?? null },
    },
  });
  startResendTicker();
}

export function renderOtp(state) {
  const { isLoading, error, otpInfo, phoneDraft, loadingMessage } = state;
  if (!otpInfo) return renderVoterCode(state);
  const waitSec = Math.max(
    0,
    Math.ceil((otpInfo.resendAt - Date.now()) / 1000),
  );

  return `
    <section class="card card--narrow stack stack--lg" aria-labelledby="otpTitle">
      <div class="stack">
        <h2 class="screen-title" id="otpTitle" tabindex="-1" data-screen-heading>Enter the OTP</h2>
        <p class="lead">We sent a 6-digit code by SMS to ${escapeHtml(maskPhone(phoneDraft))}. It expires in 5 minutes.</p>
      </div>

      ${
        otpInfo.devOtp
          ? `<div class="alert alert--info">${icons.info()}<div class="alert_body"><strong>Demo mode:</strong> SMS is simulated. Your OTP is <strong class="otp-demo">${escapeHtml(otpInfo.devOtp)}</strong>.</div></div>`
          : ""
      }

      <form class="stack stack--lg" id="otpForm" data-form="otp" novalidate>
        <div class="field">
          <label class="field_label" for="otpInput">One-time PIN</label>
          <div class="otp-entry${error ? " is-invalid" : ""}">
            <div class="otp-boxes" aria-hidden="true">
              ${Array.from({ length: 6 }, () => '<span class="otp-box" data-otp-box></span>').join("")}
            </div>
            <input
              class="otp-input-overlay"
              id="otpInput"
              name="otp"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              pattern="[0-9]*"
              aria-describedby="${error ? "otpError" : ""}"
              aria-invalid="${error ? "true" : "false"}"
              data-autofocus
              data-focus-key="otp-input"
              ${isLoading ? "readonly" : ""}
            />
          </div>
          <p class="field_error" id="otpError" role="alert">${error ? escapeHtml(error.message) : ""}</p>
        </div>

        <button type="submit" class="btn btn--primary btn--lg btn--block" ${isLoading ? "disabled" : ""}>
          ${
            isLoading
              ? `<span class="spinner" aria-hidden="true"></span> ${escapeHtml(loadingMessage || "Verifying…")}`
              : `Verify and continue ${icons.arrowRight()}`
          }
        </button>

        <div class="otp-links">
          <button type="button" class="link-btn" id="resendBtn" data-action="resend-otp" ${waitSec > 0 || isLoading ? "disabled" : ""}>${waitSec > 0 ? `Resend OTP in ${waitSec}s` : "Resend OTP"}</button>
          <button type="button" class="link-btn" data-action="back-to-code" ${isLoading ? "disabled" : ""}>Use a different ID or number</button>
        </div>
      </form>
    </section>`;
}

document.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.id !== "otpInput") return;

  const digits = input.value.replace(/\D/g, "").slice(0, 6);
  if (input.value !== digits) input.value = digits;
  document.querySelectorAll("[data-otp-box]").forEach((box, index) => {
    box.textContent = digits[index] ?? "";
  });
});

let resendTimer = null;
// Update the timer without re-rendering the form.
function startResendTicker() {
  window.clearInterval(resendTimer);
  resendTimer = window.setInterval(() => {
    const button = document.getElementById("resendBtn");
    if (!button || !appState.otpInfo) {
      window.clearInterval(resendTimer);
      return;
    }
    const left = Math.ceil((appState.otpInfo.resendAt - Date.now()) / 1000);
    if (left > 0) {
      button.disabled = true;
      button.textContent = `Resend OTP in ${left}s`;
    } else {
      button.disabled = appState.isLoading;
      button.textContent = "Resend OTP";
      window.clearInterval(resendTimer);
    }
  }, 500);
}

export async function resendOtp() {
  if (appState.isLoading || !appState.otpInfo) return;
  setState({ isLoading: true, loadingMessage: "Sending OTP…", error: null });
  try {
    const { resendInMs, devOtp } = await api.requestOtp(
      appState.voterCodeDraft,
      appState.phoneDraft,
    );
    setState({
      isLoading: false,
      loadingMessage: "",
      otpInfo: { resendAt: Date.now() + resendInMs, devOtp: devOtp ?? null },
    });
    startResendTicker();
  } catch (error) {
    handleApiFailure(error, "validate");
  }
}

export function backToCode() {
  navigate(SCREENS.VOTER_CODE, {
    patch: { otpInfo: null, error: null, isLoading: false },
  });
}

export async function submitOtp(form) {
  if (appState.isLoading) return;
  const otp = form.elements.otp.value.replace(/\s/g, "");
  if (!/^\d{6}$/.test(otp)) {
    setState({ error: { message: "Enter the 6-digit OTP from the SMS." } });
    return;
  }

  setState({ error: null, isLoading: true, loadingMessage: "Verifying…" });

  let context = "otp";
  try {
    const { session, reference } = await api.verifyOtp(
      appState.voterCodeDraft,
      appState.phoneDraft,
      otp,
    );
    context = "load";
    setState({ loadingMessage: "Loading your ballot…" });
    const { positions, candidates } = await loadBallotData();

    pushBallotGuard();
    navigate(SCREENS.BALLOT, {
      index: 0,
      patch: {
        voterSession: { ...session, reference },
        positions,
        candidates,
        selections: {},
        returnToReview: false,
        isLoading: false,
        loadingMessage: "",
        voterCodeDraft: "",
        phoneDraft: "",
        otpInfo: null,
        error: null,
      },
    });
  } catch (error) {
    handleApiFailure(error, context);
  }
}
