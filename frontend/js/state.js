// Shared state for the voter flow.

export const SCREENS = {
  LOADING: "loading",
  VOTER_CODE: "voter-code",
  OTP: "otp",
  BALLOT: "ballot",
  REVIEW: "review",
  CONFIRMATION: "confirmation",
  EDGE: "edge",
};

function initialState() {
  return {
    election: null,
    positions: [],
    candidates: {}, // positionId -> candidate[]
    currentPositionIndex: 0,
    selections: {}, // positionId -> candidateId
    voterSession: null, // { token, expiresAt, reference }
    currentScreen: SCREENS.LOADING,
    returnToReview: false, // true while changing a vote from the review screen
    isLoading: false,
    loadingMessage: "",
    isSubmitting: false,
    error: null, // { message } shown inline on the current screen
    edge: null, // { kind, preview } for SCREENS.EDGE
    receipt: null,
    voterCodeDraft: "", // typed ID kept across re-renders (never persisted)
    phoneDraft: "", // typed phone number (never persisted)
    otpInfo: null, // { phone, resendAt, devOtp? } while waiting for the SMS code
  };
}

export const appState = initialState();

const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(patch) {
  Object.assign(appState, patch);
  listeners.forEach((listener) => listener(appState));
}

// Clear voter data but keep election details.
export function voterResetPatch(extra = {}) {
  return {
    positions: [],
    candidates: {},
    currentPositionIndex: 0,
    selections: {},
    voterSession: null,
    returnToReview: false,
    isLoading: false,
    loadingMessage: "",
    isSubmitting: false,
    error: null,
    edge: null,
    receipt: null,
    voterCodeDraft: "",
    phoneDraft: "",
    otpInfo: null,
    ...extra,
  };
}

export const getCurrentPosition = () =>
  appState.positions[appState.currentPositionIndex] ?? null;

export const getCandidatesFor = (positionId) =>
  appState.candidates[positionId] ?? [];

export const getSelectedCandidate = (positionId) => {
  const id = appState.selections[positionId];
  return (
    getCandidatesFor(positionId).find((candidate) => candidate.id === id) ??
    null
  );
};

// Every portfolio requires one choice.
export const isPositionRequired = () => true;

export const hasSelection = (positionId) =>
  Boolean(getSelectedCandidate(positionId));

export const getMissingPositions = () =>
  appState.positions.filter(
    (position) => isPositionRequired(position) && !hasSelection(position.id),
  );

export const isBallotComplete = () => getMissingPositions().length === 0;

export const getCompletedCount = () =>
  appState.positions.filter((position) => hasSelection(position.id)).length;
