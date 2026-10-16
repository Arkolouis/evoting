// Shared UI helpers for rendering, focus, and announcements.

import { escapeHtml, getInitials, avatarColor } from "./utils.js";
import { EDGE_STATES } from "./errors.js";
import { INFO_PANELS } from "../data/election-data.js";

const svg = (paths, extra = "") =>
  `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;

export const icons = {
  check: (extra) => svg('<path d="M5 13l4 4L19 7" />', extra),
  alert: (extra) =>
    svg(
      '<path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />',
      extra,
    ),
  info: (extra) =>
    svg(
      '<path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />',
      extra,
    ),
  arrowRight: (extra) => svg('<path d="M14 5l7 7m0 0l-7 7m7-7H3" />', extra),
  arrowLeft: (extra) => svg('<path d="M10 19l-7-7m0 0l7-7m-7 7h18" />', extra),
  chevronDown: (extra) => svg('<path d="M19 9l-7 7-7-7" />', extra),
  printer: (extra) =>
    svg(
      '<path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />',
      extra,
    ),
  castBallot: (extra) =>
    svg('<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />', extra),
};

export function announce(message) {
  const region = document.getElementById("liveRegion");
  if (!region) return;
  region.textContent = "";
  // Clear first so identical messages are announced again.
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

let lastViewKey = null;

/**
 * Replace the view and restore keyboard focus.
 */
export function mount(root, html, viewKey) {
  const active = document.activeElement;
  const focusKey = root.contains(active) ? active?.dataset?.focusKey : null;

  root.innerHTML = html;
  root.setAttribute("aria-busy", "false");

  if (viewKey !== lastViewKey) {
    lastViewKey = viewKey;
    window.scrollTo(0, 0);
    const target =
      root.querySelector("[data-autofocus]") ??
      root.querySelector("[data-screen-heading]");
    target?.focus({ preventScroll: true });
  } else if (focusKey) {
    root
      .querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)
      ?.focus({ preventScroll: true });
  }
}

export function renderAvatar(candidate, extraClass = "") {
  const label = escapeHtml(getInitials(candidate.name));
  const color = avatarColor(candidate.id);
  // Keep initials visible if the photo fails to load.
  const inner = `<span class="avatar_initials">${label}</span>${
    candidate.image
      ? `<img src="${escapeHtml(candidate.image)}" alt="" loading="lazy" onerror="this.remove()" />`
      : ""
  }`;
  return `<span class="avatar ${extraClass}" style="--avatar-bg:${color}" aria-hidden="true">${inner}</span>`;
}

export function renderErrorAlert(error, extra = "") {
  if (!error) return "";
  return `
    <div class="alert alert--danger" role="alert">
      ${icons.alert()}
      <div class="alert_body">${escapeHtml(error.message)}${extra}</div>
    </div>`;
}

export function renderLoading(message = "Loading…") {
  return `
    <section class="card card--narrow status-screen" aria-labelledby="loadingTitle">
      <div class="loading-state">
        <div class="spinner spinner--lg" aria-hidden="true"></div>
        <h2 class="screen-title screen-title--sm" id="loadingTitle" tabindex="-1" data-screen-heading>${escapeHtml(message)}</h2>
      </div>
    </section>`;
}

export function renderEmptyBallot() {
  return `
    <section class="card card--narrow status-screen stack" aria-labelledby="emptyTitle">
      <div class="status-icon status-icon--warning">${icons.info("icon--lg")}</div>
      <h2 class="screen-title" id="emptyTitle" tabindex="-1" data-screen-heading>No ballot available</h2>
      <p class="lead">There are no portfolios open for voting in this election right now. Please check back later or contact the Electoral Commission.</p>
      <div class="status-actions">
        <button type="button" class="btn btn--primary" data-action="restart">Return to voter portal</button>
      </div>
    </section>`;
}

export function renderEdge(state) {
  const edge = state.edge;
  const content = EDGE_STATES[edge?.kind];
  if (!content) return renderEmptyBallot();

  const canReturnToBallot =
    content.retry && state.voterSession && !edge.preview;
  const retrying = state.isSubmitting;
  const primaryAction = content.retry ? "retry-submission" : "restart";

  return `
    <section class="card card--medium status-screen stack stack--lg" aria-labelledby="edgeTitle">
      <div>
        <div class="status-icon status-icon--warning">${icons.alert("icon--lg")}</div>
        <span class="badge">${escapeHtml(content.badge)}</span>
      </div>
      <div class="stack">
        <h2 class="screen-title" id="edgeTitle" tabindex="-1" data-screen-heading>${escapeHtml(content.title)}</h2>
        <p class="lead">${escapeHtml(content.description)}</p>
      </div>
      <p class="status-detail">${escapeHtml(content.detail)}</p>
      ${edge.preview ? `<p class="muted demo-note">Demo preview of this state.</p>` : ""}
      <div class="status-actions">
        <button type="button" class="btn btn--primary" data-action="${primaryAction}" ${retrying ? "disabled" : ""}>
          ${retrying ? `<span class="spinner" aria-hidden="true"></span> Retrying…` : escapeHtml(content.primaryLabel)}
        </button>
        ${
          canReturnToBallot
            ? `<button type="button" class="btn btn--secondary" data-action="back-to-review" ${retrying ? "disabled" : ""}>Review ballot</button>`
            : ""
        }
        ${
          content.retry
            ? `<button type="button" class="btn btn--secondary" data-action="restart" ${retrying ? "disabled" : ""}>Return to Election Portal</button>`
            : ""
        }
      </div>
    </section>`;
}

export function showInfoDialog(key) {
  const panel = INFO_PANELS[key];
  const dialog = document.getElementById("infoDialog");
  if (!panel || !dialog) return;
  document.getElementById("infoDialogTitle").textContent = panel.title;
  document.getElementById("infoDialogBody").textContent = panel.body;
  if (typeof dialog.showModal === "function") dialog.showModal();
}

export function closeInfoDialog() {
  document.getElementById("infoDialog")?.close();
}
