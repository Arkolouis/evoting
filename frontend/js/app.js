// App entry point: rendering, events, and startup.

import { api } from "./api.js";
import { config } from "./config.js";
import {
  appState,
  setState,
  subscribe,
  SCREENS,
  voterResetPatch,
} from "./state.js";
import { navigate } from "./router.js";
import { initTheme } from "./theme.js";
import {
  closeInfoDialog,
  mount,
  renderEdge,
  renderLoading,
  showInfoDialog,
} from "./ui.js";
import {
  backToCode,
  fillDemoCode,
  renderOtp,
  renderVoterCode,
  resendOtp,
  submitOtp,
  submitVoterCode,
} from "./voter.js";
import {
  goToPosition,
  goToReview,
  nextPosition,
  previousPosition,
  renderBallot,
  selectCandidate,
} from "./ballot.js";
import { castBallot, changeVote, editBallot, renderReview } from "./review.js";
import { renderConfirmation } from "./confirmation.js";
import { persistDraft, restoreDraft, startOver } from "./flow.js";

const appRoot = document.getElementById("app");
let confirmationTimer = null;

const VIEWS = {
  [SCREENS.LOADING]: (state) =>
    renderLoading(state.loadingMessage || "Loading…"),
  [SCREENS.VOTER_CODE]: renderVoterCode,
  [SCREENS.OTP]: renderOtp,
  [SCREENS.BALLOT]: renderBallot,
  [SCREENS.REVIEW]: renderReview,
  [SCREENS.CONFIRMATION]: renderConfirmation,
  [SCREENS.EDGE]: renderEdge,
};

// Used to detect when focus should move to a new screen.
function viewKey(state) {
  const extra =
    state.currentScreen === SCREENS.BALLOT
      ? state.currentPositionIndex
      : state.currentScreen === SCREENS.EDGE
        ? state.edge?.kind
        : "";
  return `${state.currentScreen}:${extra}`;
}

function updateChrome(state) {
  const title = document.getElementById("electionTitle");
  if (title && state.election?.name) title.textContent = state.election.name;
  if (state.election?.name)
    document.title = `${state.election.name} · Ballot Portal`;

  const badge = document.getElementById("voterBadge");
  const value = document.getElementById("voterBadgeValue");
  const reference = state.voterSession?.reference;
  if (badge && value) {
    badge.hidden = !reference;
    value.textContent = reference ?? "";
  }
}

function render(state) {
  const view = VIEWS[state.currentScreen] ?? VIEWS[SCREENS.VOTER_CODE];
  mount(appRoot, view(state), viewKey(state));
  updateChrome(state);

  if (state.currentScreen === SCREENS.CONFIRMATION) {
    if (confirmationTimer === null) {
      confirmationTimer = window.setTimeout(() => {
        confirmationTimer = null;
        if (appState.currentScreen === SCREENS.CONFIRMATION) startOver();
      }, 10_000);
    }
  } else if (confirmationTimer !== null) {
    window.clearTimeout(confirmationTimer);
    confirmationTimer = null;
  }
}

const ACTIONS = {
  "show-info": (el) => showInfoDialog(el.dataset.info),
  "close-info": () => closeInfoDialog(),
  "fill-demo-code": () => fillDemoCode(),
  "resend-otp": () => resendOtp(),
  "back-to-code": () => backToCode(),
  "select-candidate": (el) =>
    selectCandidate(el.dataset.positionId, el.dataset.candidateId),
  "next-position": () => nextPosition(),
  "prev-position": () => previousPosition(),
  "go-to-position": (el) => goToPosition(Number(el.dataset.index)),
  "go-review": () => goToReview(),
  "change-vote": (el) => changeVote(Number(el.dataset.index)),
  "edit-ballot": () => editBallot(),
  "cast-ballot": () => castBallot(),
  "retry-submission": () =>
    appState.voterSession ? castBallot() : startOver(),
  "back-to-review": () => navigate(SCREENS.REVIEW, { patch: { error: null } }),
  "print-receipt": () => window.print(),
  restart: () => startOver(),
};

document.addEventListener("click", (event) => {
  const element = event.target.closest("[data-action]");
  if (!element || element.disabled) return;
  ACTIONS[element.dataset.action]?.(element, event);
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  if (form.dataset.form === "voter-code") submitVoterCode(form);
  if (form.dataset.form === "otp") submitOtp(form);
});

window.addEventListener("popstate", (event) => {
  const target = event.state;

  // Keep a submitted ballot on the confirmation screen.
  if (appState.receipt) {
    navigate(SCREENS.CONFIRMATION, { replace: true });
    return;
  }

  // Keep Back navigation inside the ballot and review screens.
  const inVoting =
    appState.voterSession &&
    appState.positions.length > 0 &&
    (appState.currentScreen === SCREENS.BALLOT ||
      appState.currentScreen === SCREENS.REVIEW);
  const targetIsVoting =
    target?.screen === SCREENS.BALLOT || target?.screen === SCREENS.REVIEW;
  if (inVoting && !targetIsVoting) {
    navigate(appState.currentScreen, { index: appState.currentPositionIndex });
    return;
  }

  const needsSession =
    target?.screen === SCREENS.BALLOT || target?.screen === SCREENS.REVIEW;
  const valid =
    target?.screen &&
    target.screen !== SCREENS.EDGE &&
    target.screen !== SCREENS.CONFIRMATION &&
    (!needsSession || (appState.voterSession && appState.positions.length > 0));

  if (!valid) {
    if (appState.currentScreen !== SCREENS.VOTER_CODE) {
      navigate(SCREENS.VOTER_CODE, {
        replace: true,
        patch: { error: null, returnToReview: false },
      });
    }
    return;
  }

  setState({
    currentScreen: target.screen,
    currentPositionIndex: Number(target.index) || 0,
    error: null,
    returnToReview: false,
  });
});

function initChrome() {
  const header = document.querySelector(".site-header");
  const onScroll = () =>
    header?.classList.toggle("is-scrolled", window.scrollY > 4);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

async function boot() {
  initTheme();
  initChrome();

  if (config.ENABLE_DEMO_TOOLS) {
    // Load demo tools only when they are enabled.
    const { initDemoTools } = await import("./demo.js");
    initDemoTools();
  }

  subscribe(render);
  subscribe(persistDraft);
  setState({
    currentScreen: SCREENS.LOADING,
    loadingMessage: "Loading election…",
  });

  // Election details are optional; the voter screen handles connection errors.
  const [electionResult, statusResult] = await Promise.allSettled([
    api.getElection(),
    api.getElectionStatus(),
  ]);
  if (electionResult.status === "fulfilled")
    setState({ election: electionResult.value });

  if (
    statusResult.status === "fulfilled" &&
    statusResult.value.status !== "open"
  ) {
    const kind = "votingClosed";
    navigate(SCREENS.EDGE, {
      replace: true,
      patch: { loadingMessage: "", edge: { kind, preview: false } },
    });
    return;
  }

  if (await restoreDraft()) {
    setState({ loadingMessage: "" });
    return;
  }

  navigate(SCREENS.VOTER_CODE, {
    index: 0,
    replace: true,
    patch: { ...voterResetPatch(), election: appState.election },
  });
}

boot();
