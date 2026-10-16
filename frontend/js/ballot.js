// Ballot screen and navigation.

import {
  appState,
  setState,
  SCREENS,
  getCurrentPosition,
  getCandidatesFor,
  getCompletedCount,
  hasSelection,
  isPositionRequired,
} from "./state.js";
import { navigate } from "./router.js";
import { announce, icons, renderAvatar, renderEmptyBallot } from "./ui.js";
import { escapeHtml, pluralize } from "./utils.js";

function renderProgress(state) {
  const items = state.positions
    .map((position, index) => {
      const done = hasSelection(position.id);
      const current = index === state.currentPositionIndex;
      const status = done ? "answered" : "not answered";
      return `<li class="progress_step ${done ? "is-done" : ""} ${current ? "is-current" : ""}" ${current ? 'aria-current="step"' : ""}>
        <span class="sr-only">${escapeHtml(position.title)}: ${status}${current ? ", current portfolio" : ""}</span>
      </li>`;
    })
    .join("");
  return `
    <div class="progress-summary">
      <ol class="progress" aria-label="Ballot progress">${items}</ol>
      <span class="progress-summary_count">${getCompletedCount()} of ${state.positions.length} selected</span>
    </div>`;
}

function renderSidebar(state) {
  const items = state.positions
    .map((position, index) => {
      const done = hasSelection(position.id);
      const current = index === state.currentPositionIndex;
      return `
        <li>
          <button type="button" class="nav-item ${done ? "is-done" : ""} ${current ? "is-current" : ""}"
            data-action="go-to-position" data-index="${index}" data-focus-key="nav-${index}"
            ${current ? 'aria-current="step"' : ""}>
            <span class="nav-item_label">${index + 1}. ${escapeHtml(position.title)}</span>
            <span class="nav-item_mark">
              ${done ? icons.check("icon--sm") : '<span class="nav-item_dot" aria-hidden="true"></span>'}
              <span class="sr-only">${done ? "selected" : "not selected"}</span>
            </span>
          </button>
        </li>`;
    })
    .join("");

  return `
    <aside class="sidebar" aria-label="Portfolios">
      <div class="sidebar_card">
        <div class="sidebar_head">
          <h2 class="sidebar_title">Portfolios</h2>
          <span class="sidebar_count">${state.positions.length} ${pluralize(state.positions.length, "portfolio")}</span>
        </div>
        <ul class="sidebar_list">${items}</ul>
      </div>
    </aside>`;
}

function renderCandidate(candidate, position, selectedId) {
  const selected = candidate.id === selectedId;
  return `
    <button type="button" class="candidate ${selected ? "is-selected" : ""}"
      data-action="select-candidate"
      data-position-id="${escapeHtml(position.id)}" data-candidate-id="${escapeHtml(candidate.id)}"
      data-focus-key="cand-${escapeHtml(candidate.id)}"
      aria-pressed="${selected}">
      <span class="candidate_top">
        ${renderAvatar(candidate)}
        <span class="candidate_radio" aria-hidden="true">${selected ? icons.check("icon--sm") : ""}</span>
      </span>
      <span class="candidate_body">
        <span class="candidate_name">${escapeHtml(candidate.name)}</span>
        ${candidate.affiliation ? `<span class="candidate_affiliation">${escapeHtml(candidate.affiliation)}</span>` : ""}
      </span>
      <span class="candidate_state">
        <span class="candidate_state-icon">${selected ? icons.check("icon--sm") : icons.castBallot("icon--sm")}</span>
        <span>${selected ? "Voted" : "Vote"}</span>
      </span>
    </button>`;
}

export function renderBallot(state) {
  const position = getCurrentPosition();
  if (!position) return renderEmptyBallot();

  const candidates = getCandidatesFor(position.id);
  const selectedId = state.selections[position.id];
  const required = isPositionRequired(position);
  const total = state.positions.length;
  const index = state.currentPositionIndex;
  const isLast = index === total - 1;
  const canContinue = !required || Boolean(selectedId);
  const editing = state.returnToReview;

  const nextLabel = editing
    ? "Save &amp; return to review"
    : isLast
      ? "Review ballot"
      : "Next portfolio";
  const backLabel = editing ? "Back to review" : "Back";
  const backAction = editing ? "go-review" : "prev-position";
  const showBack = editing || index > 0;

  const hint = !canContinue
    ? "Choose one candidate"
    : candidates.length === 0
      ? "No candidates for this portfolio"
      : "Your choice is saved. You can change it before casting.";

  return `
    <div class="ballot-layout">
      ${renderSidebar(state)}

      <section class="ballot-main card" aria-labelledby="positionTitle">
        <div class="position-meta">
          <span class="position-meta_step">Portfolio ${index + 1} of ${total}</span>
        </div>
        ${renderProgress(state)}

        ${
          editing
            ? `<div class="alert alert--info edit-banner">${icons.info()}<div class="alert_body">You are changing one vote. All your other selections are kept.</div></div>`
            : ""
        }

        <h2 class="position-title" id="positionTitle" tabindex="-1" data-screen-heading>${escapeHtml(position.title)}</h2>
        ${position.description ? `<p class="position-desc">${escapeHtml(position.description)}</p>` : ""}

        ${
          candidates.length
            ? `<div class="candidate-grid" role="group" aria-labelledby="positionTitle">
                ${candidates.map((candidate) => renderCandidate(candidate, position, selectedId)).join("")}
              </div>`
            : `<p class="no-candidates">No candidates are standing for this portfolio.</p>`
        }

        <div class="step-actions">
          ${
            showBack
              ? `<button type="button" class="btn btn--secondary step-actions_back" data-action="${backAction}">${icons.arrowLeft()} ${backLabel}</button>`
              : `<span class="step-actions_spacer"></span>`
          }
          <p class="step-actions_hint" id="stepHint">${hint}</p>
          <button type="button" class="btn btn--primary step-actions_next" data-action="next-position" data-focus-key="next" aria-describedby="stepHint" ${canContinue ? "" : "disabled"}>
            ${nextLabel} ${icons.arrowRight()}
          </button>
        </div>
      </section>
    </div>
    `;
}

let advanceLocked = false;

export function selectCandidate(positionId, candidateId) {
  if (advanceLocked) return;
  const position = appState.positions.find((item) => item.id === positionId);
  const candidate = getCandidatesFor(positionId).find(
    (item) => item.id === candidateId,
  );
  if (!position || !candidate) return;

  advanceLocked = true;
  const fromScreen = appState.currentScreen;
  const fromIndex = appState.currentPositionIndex;

  setState({
    selections: { ...appState.selections, [positionId]: candidateId },
    error: null,
  });
  announce(`${candidate.name} selected for ${position.title}.`);

  setTimeout(() => {
    advanceLocked = false;
    // Don't advance if the voter navigated away during the transition.
    if (
      appState.currentScreen !== fromScreen ||
      appState.currentPositionIndex !== fromIndex
    ) {
      return;
    }
    if (appState.returnToReview) {
      navigate(SCREENS.REVIEW, { patch: { returnToReview: false } });
      return;
    }

    if (appState.currentPositionIndex < appState.positions.length - 1) {
      goToPosition(appState.currentPositionIndex + 1);
    } else {
      navigate(SCREENS.REVIEW);
    }
  }, 450);
}

export function goToPosition(index) {
  if (index < 0 || index >= appState.positions.length) return;
  navigate(SCREENS.BALLOT, { index });
}

export function previousPosition() {
  if (appState.currentPositionIndex > 0)
    goToPosition(appState.currentPositionIndex - 1);
}

export function nextPosition() {
  const position = getCurrentPosition();
  if (!position) return;
  if (isPositionRequired(position) && !hasSelection(position.id)) return;

  if (appState.returnToReview) {
    navigate(SCREENS.REVIEW, { patch: { returnToReview: false } });
  } else if (appState.currentPositionIndex < appState.positions.length - 1) {
    goToPosition(appState.currentPositionIndex + 1);
  } else {
    navigate(SCREENS.REVIEW);
  }
}

export function goToReview() {
  navigate(SCREENS.REVIEW, { patch: { returnToReview: false } });
}
