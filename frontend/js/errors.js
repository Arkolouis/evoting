export class ApiError extends Error {
  /**
   * @param {number} status HTTP status, or 0 for network errors
   * @param {string} code Error code from the API
   * @param {object} [details] Extra error details
   */
  constructor(status, code = "UNKNOWN", details = null) {
    super(`${status} ${code}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function messageForStatus(status) {
  switch (status) {
    case 0:
      return "Unable to reach the ballot service. Check your connection and try again.";
    case 400:
      return "The request could not be understood. Please try again.";
    case 401:
      return "Your voting session is no longer valid.";
    case 403:
      return "Voting is currently closed.";
    case 404:
      return "We could not find what was requested. Please try again.";
    case 409:
      return "This voter code has already been used.";
    case 422:
      return "Some of the information provided is not valid. Please review it and try again.";
    case 429:
      return "Too many attempts. Please wait a moment before trying again.";
    case 500:
      return "Something went wrong on our side. Your selections are kept, so please try again.";
    case 502:
      return "We could not send the SMS. Please try again shortly.";
    case 503:
      return "The election system is temporarily unavailable. Please try again shortly.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export const EDGE_STATES = {
  codeUsed: {
    badge: "HTTP 409 Conflict",
    title: "Voter code already used",
    description:
      "This code has already been used. Each voter code works only once.",
    detail:
      "If you did not use this code yourself, present your student ID to the Chief Returning Officer.",
    primaryLabel: "Return to voter portal",
  },
  alreadySubmitted: {
    badge: "Ballot already submitted",
    title: "This ballot was already submitted",
    description:
      "This voting session has already been used to submit a ballot, for example in another tab or window.",
    detail:
      "Only the first submission counts. If you did not submit it yourself, contact the Chief Returning Officer.",
    primaryLabel: "Return to voter portal",
  },
  votingClosed: {
    badge: "Election status: closed",
    title: "Ballot polls are closed",
    description: "The voting period for this election has ended.",
    detail:
      "No new ballots can be accepted. Results will be announced by the Electoral Commission.",
    primaryLabel: "Return to voter portal",
  },
  sessionExpired: {
    badge: "Session timeout",
    title: "Voting session expired",
    description:
      "To protect shared lab terminals, voting sessions end after 30 minutes. Nothing from this session was saved.",
    detail:
      "Your voter code was already used when this session started, so it cannot be entered again. Please see the Chief Returning Officer: they will void it and issue you a new code.",
    primaryLabel: "Return to voter portal",
  },
  networkFailure: {
    badge: "Connectivity error",
    title: "Unable to reach ballot",
    description:
      "Your connection dropped while sending your ballot. Your selections are still saved.",
    detail: "Check connection, then retry.",
    primaryLabel: "Retry submission",
    retry: true,
  },
};

/**
 * @param {unknown} error
 * @param {"validate"|"otp"|"load"|"submit"} context
 * @returns {{ kind: "codeUsed"|"alreadySubmitted"|"votingClosed"|"sessionExpired"|"networkFailure"|"inline", message: string }}
 */
export function classifyError(error, context) {
  const api = error instanceof ApiError ? error : null;
  const status = api ? api.status : 0;
  const code = api?.code;
  const details = api?.details;
  const message = messageForStatus(status);
  const loginStep = context === "validate" || context === "otp";
  const inline = (text) => ({ kind: "inline", message: text });
  const attemptsText = (left) =>
    typeof left === "number"
      ? left > 0
        ? ` ${left} ${left === 1 ? "attempt" : "attempts"} left.`
        : " No attempts left."
      : "";

  if (status === 0) {
    return {
      kind: context === "submit" ? "networkFailure" : "inline",
      message,
    };
  }
  if (status === 409) {
    // At login this means the ID was used; later it means the ballot was submitted.
    return { kind: loginStep ? "codeUsed" : "alreadySubmitted", message };
  }
  if (status === 403) return { kind: "votingClosed", message };

  if (status === 401) {
    if (context === "otp") {
      if (code === "OTP_EXPIRED")
        return inline("That OTP has expired. Request a new one.");
      return inline(
        `Incorrect OTP.${attemptsText(details?.attemptsRemaining)}`,
      );
    }
    if (context === "validate")
      return inline("Voter ID could not be verified. Try again.");
    return { kind: "sessionExpired", message };
  }

  if (status === 404 && loginStep) {
    if (code === "NO_OTP_REQUEST")
      return inline("Please request an OTP first.");
    return inline(
      `That voter ID and phone number do not match the voter register. Check both and try again.${attemptsText(details?.attemptsRemaining)}`,
    );
  }

  if (status === 429) {
    if (code === "OTP_LOCKED")
      return inline("Too many wrong OTPs. Go back and request a new OTP.");
    if (code === "OTP_COOLDOWN") {
      return inline(
        `Please wait ${details?.retryAfterSec ?? "a few"} seconds before requesting another OTP.`,
      );
    }
    const secs = details?.retryAfterSec;
    const wait = secs
      ? ` Try again in about ${Math.max(1, Math.ceil(secs / 60))} minute(s).`
      : "";
    return inline(
      `Too many incorrect attempts.${wait} See the Helpdesk if you need help.`,
    );
  }

  if (status === 422 && loginStep) {
    const field = details?.field;
    if (field === "phone")
      return inline("Enter a valid phone number, for example 024 123 4567.");
    if (field === "otp") return inline("Enter the 6-digit OTP from the SMS.");
    return inline("Voter ID is invalid. Try again.");
  }

  if (status === 422 && context === "submit") {
    return inline(
      "Ballot could not be accepted. Review every portfolio and try again.",
    );
  }

  return inline(message);
}
