// App flow: API calls, state updates, and navigation.

import { api } from "./api.js";
import { config } from "./config.js";
import { appState, setState, voterResetPatch, SCREENS } from "./state.js";
import { navigate, pushBallotGuard } from "./router.js";
import { ApiError, classifyError } from "./errors.js";
import { draftStorage } from "./storage.js";
import { shuffle } from "./utils.js";

// Load each position and its candidates.
export async function loadBallotData(savedOrder) {
  const { positions, candidates: byPosition } = await api.getBallot();

  const candidates = {};
  positions.forEach((position) => {
    const list = byPosition[position.id] ?? [];
    const order = savedOrder?.[position.id];
    if (order) {
      const rank = new Map(order.map((id, i) => [id, i]));
      candidates[position.id] = list
        .slice()
        .sort(
          (firstCandidate, secondCandidate) =>
            (rank.get(firstCandidate.id) ?? 999) -
            (rank.get(secondCandidate.id) ?? 999),
        );
    } else {
      candidates[position.id] = config.RANDOMIZE_CANDIDATE_ORDER
        ? shuffle(list)
        : list;
    }
  });

  return { positions, candidates };
}

export function handleApiFailure(error, context) {
  const { kind, message } = classifyError(error, context);
  const settle = { isLoading: false, isSubmitting: false, loadingMessage: "" };

  if (kind === "inline") {
    if (context === "submit") {
      navigate(SCREENS.REVIEW, {
        replace: true,
        patch: { ...settle, error: { message } },
      });
    } else {
      setState({ ...settle, error: { message } });
    }
    return;
  }

  if (kind === "networkFailure") {
    showEdge("networkFailure", { patch: settle });
    return;
  }

  draftStorage.clear();
  api.setSessionToken(null);
  showEdge(kind, { patch: voterResetPatch(settle) });
}

export function showEdge(kind, { preview = false, patch = {} } = {}) {
  navigate(SCREENS.EDGE, {
    patch: { ...patch, error: null, edge: { kind, preview } },
  });
}

export function startOver() {
  draftStorage.clear();
  api.reset();
  navigate(SCREENS.VOTER_CODE, { index: 0, patch: voterResetPatch() });
}

export function persistDraft() {
  if (!config.PERSIST_DRAFT) return;
  const { voterSession, currentScreen } = appState;
  const inProgress =
    voterSession &&
    (currentScreen === SCREENS.BALLOT ||
      currentScreen === SCREENS.REVIEW ||
      (currentScreen === SCREENS.EDGE &&
        appState.edge?.kind === "networkFailure"));
  if (!inProgress) return;

  const order = {};
  for (const [positionId, list] of Object.entries(appState.candidates)) {
    order[positionId] = list.map((candidate) => candidate.id);
  }

  draftStorage.save({
    session: voterSession,
    screen: currentScreen === SCREENS.BALLOT ? SCREENS.BALLOT : SCREENS.REVIEW,
    currentPositionIndex: appState.currentPositionIndex,
    selections: appState.selections,
    order,
  });
}

export async function restoreDraft() {
  const draft = draftStorage.load();
  if (!draft?.session?.token) return false;
  if (!(Date.parse(draft.session.expiresAt) > Date.now())) {
    draftStorage.clear();
    showEdge("sessionExpired", { patch: voterResetPatch() });
    return true;
  }

  try {
    api.setSessionToken(draft.session.token);
    const { positions, candidates } = await loadBallotData(draft.order);

    const selections = {};
    for (const position of positions) {
      const chosen = draft.selections?.[position.id];
      if (
        candidates[position.id].some((candidate) => candidate.id === chosen)
      ) {
        selections[position.id] = chosen;
      }
    }

    const maxIndex = Math.max(positions.length - 1, 0);
    const index = Math.min(Number(draft.currentPositionIndex) || 0, maxIndex);
    pushBallotGuard();
    navigate(
      draft.screen === SCREENS.REVIEW ? SCREENS.REVIEW : SCREENS.BALLOT,
      {
        index,
        patch: {
          positions,
          candidates,
          selections,
          voterSession: draft.session,
        },
      },
    );
    return true;
  } catch (error) {
    draftStorage.clear();
    api.setSessionToken(null);
    if (error instanceof ApiError && [401, 403, 409].includes(error.status)) {
      handleApiFailure(error, "load");
      return true;
    }
    return false;
  }
}
