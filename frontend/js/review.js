import { api } from "./api.js";
import {
  appState,
  setState,
  SCREENS,
  getCandidatesFor,
  getMissingPositions,
  getSelectedCandidate,
  hasSelection,
  isBallotComplete,
  voterResetPatch,
} from "./state.js";
import { navigate } from "./router.js";
import { handleApiFailure } from "./flow.js";
import { draftStorage } from "./storage.js";
import { announce, icons, renderAvatar, renderErrorAlert } from "./ui.js";
import { escapeHtml } from "./utils.js";

function renderRow(position, index) {
  const candidate = getSelectedCandidate(position.id);
  const hasCandidates = getCandidatesFor(position.id).length > 0;

  if (!candidate) {
    return `
      <li class="review-row ${hasCandidates ? "is-missing" : ""}">
        <span class="review-row_index">${index + 1}</span>
        <div>
          <div class="review-row_position">${escapeHtml(position.title)}</div>
          <p class="review-row_missing">${hasCandidates ? "No candidate selected yet" : "No candidates standing"}</p>
        </div>
        ${
          hasCandidates
            ? `<button type="button" class="link-btn" data-action="change-vote" data-index="${index}" aria-label="Select a candidate for ${escapeHtml(position.title)}">Select</button>`
            : "<span></span>"
        }
      </li>`;
  }

  return `
    <li class="review-row">
      <span class="review-row_index">${index + 1}</span>
      <div>
        <div class="review-row_position">${escapeHtml(position.title)}</div>
        <div class="review-row_choice">
          ${renderAvatar(candidate, "avatar--sm")}
          <div>
            <span class="review-row_name">${escapeHtml(candidate.name)}</span>
            ${candidate.affiliation ? `<span class="review-row_affiliation">${escapeHtml(candidate.affiliation)}</span>` : ""}
          </div>
        </div>
      </div>
      <button type="button" class="link-btn" data-action="change-vote" data-index="${index}" data-focus-key="change-${index}" aria-label="Change vote for ${escapeHtml(position.title)}">Change</button>
    </li>`;
}

export function renderReview(state) {
  const missing = getMissingPositions();
  const complete = missing.length === 0;
  const total = state.positions.length;
  const submitting = state.isSubmitting;

  return `
    <section class="card card--medium card--review stack stack--lg" aria-labelledby="reviewTitle">
      <div class="review-head">
        <div class="stack">
          <h2 class="screen-title" id="reviewTitle" tabindex="-1" data-screen-heading>Review your ballot</h2>
          <p class="lead review-note">Check each position before casting. Use “Change” to edit a single vote.</p>
        </div>
        <span class="badge badge--pill ${complete ? "badge--success" : "badge--demo"}">
          ${complete ? `All ${total} portfolios selected` : `${missing.length} missing`}
        </span>
      </div>

      <ol class="review-list" aria-label="Your selections">
        ${state.positions.map((position, index) => renderRow(position, index)).join("")}
      </ol>

      ${renderErrorAlert(state.error)}

      <div class="alert alert--info">
        ${icons.info()}
        <div class="alert_body">
          <strong>Note:</strong> once you cast your ballot you cannot change it.
        </div>
      </div>

      <div class="review-footer">
        <button type="button" class="btn btn--secondary btn--lg" data-action="edit-ballot" ${submitting ? "disabled" : ""}>
          ${icons.arrowLeft()} Edit votes
        </button>
        <button type="button" class="btn btn--success btn--lg" data-action="cast-ballot" data-focus-key="cast"
          ${!complete || submitting ? "disabled" : ""} ${complete ? "" : 'aria-describedby="castHelp"'}>
          ${
            submitting
              ? `<span class="spinner" aria-hidden="true"></span> Casting ballot…`
              : `${icons.castBallot()} ${state.error ? "Retry submission" : "Cast ballot"}`
          }
        </button>
        ${!complete ? `<p class="muted review-footer_help" id="castHelp">Choose a candidate for every portfolio to enable casting.</p>` : ""}
      </div>
    </section>`;
}

export function changeVote(index) {
  if (index < 0 || index >= appState.positions.length) return;
  navigate(SCREENS.BALLOT, {
    index,
    patch: { returnToReview: true, error: null },
  });
}

export function editBallot() {
  const firstMissing = appState.positions.findIndex(
    (position) => !hasSelection(position.id),
  );
  const index =
    firstMissing >= 0 ? firstMissing : appState.positions.length - 1;
  navigate(SCREENS.BALLOT, {
    index: Math.max(index, 0),
    patch: { returnToReview: false, error: null },
  });
}

export async function castBallot() {
  if (appState.isSubmitting) return;

  if (!appState.voterSession || !isBallotComplete()) {
    setState({
      error: {
        message: "Please choose a candidate for each portfolio.",
      },
    });
    return;
  }

  setState({ isSubmitting: true, error: null });
  announce("Casting your vote…");

  const ballot = {
    selections: appState.positions
      .filter((position) => hasSelection(position.id))
      .map((position) => ({
        positionId: position.id,
        candidateId: appState.selections[position.id],
      })),
  };

  try {
    const receipt = await api.submitBallot(ballot);
    draftStorage.clear();
    api.setSessionToken(null);
    navigate(SCREENS.CONFIRMATION, {
      replace: true,
      patch: voterResetPatch({ receipt, election: appState.election }),
    });
    announce("Your vote has been submitted.");
  } catch (error) {
    handleApiFailure(error, "submit");
  }
}
