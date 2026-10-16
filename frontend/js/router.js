// Screen navigation using browser history.

import { appState, setState, SCREENS } from "./state.js";

function hashFor(screen, index = 0) {
  switch (screen) {
    case SCREENS.BALLOT:
      return `#position-${index + 1}`;
    case SCREENS.OTP:
      return "#verify";
    case SCREENS.REVIEW:
      return "#review";
    case SCREENS.CONFIRMATION:
      return "#confirmation";
    case SCREENS.EDGE:
      return "#status";
    default:
      return "#enter-code";
  }
}

// Keep browser Back from leaving the ballot.
export function pushBallotGuard() {
  history.replaceState({ screen: "guard" }, "", "#start");
}

/**
 * @param {string} screen Screen to show
 * @param {{ index?: number, replace?: boolean, patch?: object }} [options]
 *   State updates to apply while navigating.
 */

export function navigate(screen, { index, replace = false, patch = {} } = {}) {
  const positionIndex =
    index ?? (screen === SCREENS.BALLOT ? appState.currentPositionIndex : 0);
  const historyState = { screen, index: positionIndex };
  const url = hashFor(screen, positionIndex);

  if (replace) history.replaceState(historyState, "", url);
  else history.pushState(historyState, "", url);

  setState({
    ...patch,
    currentScreen: screen,
    currentPositionIndex: positionIndex,
  });
}
