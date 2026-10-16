import { icons } from "./ui.js";
import { escapeHtml } from "./utils.js";

export function renderConfirmation(state) {
  const submittedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const electionName = escapeHtml(
    state?.election?.name || "Student Union Election",
  );

  return `
    <section class="card card--medium card--confirmation status-screen stack stack--lg" aria-labelledby="confirmTitle">
      <div class="confirmation-banner">
        <div class="status-icon status-icon--success">${icons.check("icon--lg")}</div>

        <div class="confirmation-header">
          <p class="eyebrow confirmation-eyebrow" id="confirmTitle" tabindex="-1" data-screen-heading>BALLOT RECEIVED</p>
          <h2 class="screen-title screen-title--lg">Your ballot has been recorded</h2>
        </div>
      </div>

      <div class="confirmation-receipt" aria-live="polite">
        <div class="receipt_head">
          <span>${electionName}</span>
          <span class="receipt_status">Submitted</span>
        </div>

        <dl class="receipt_grid">
          <div>
            <dt>Submitted</dt>
            <dd class="receipt_mono">${escapeHtml(submittedAt)}</dd>
          </div>
          <div>
            <dt>Privacy</dt>
            <dd>Your selections were submitted anonymously.</dd>
          </div>
        </dl>
      </div>

      <p class="lead confirmation-lead">
        Thank you for voting.
      </p>
    </section>`;
}
