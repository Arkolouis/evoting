// Maps API responses to the shapes used by the UI.

import { config } from "./config.js";
import { mockApi } from "./mock-api.js";
import { ApiError } from "./errors.js";
import { ELECTION } from "../data/election-data.js";

let sessionToken = null;

async function request(method, path, { body, auth = false } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && sessionToken) headers.Authorization = `Bearer ${sessionToken}`;

  let response;
  try {
    response = await fetch(`${config.API_BASE_URL}${path}`, {
      method,
      headers,
      cache: "no-store",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR");
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {}

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.code ?? "HTTP_ERROR",
      payload?.details ?? null,
    );
  }
  return payload;
}

const httpApi = {
  requestOtp: (code, phone) =>
    request("POST", "/voter/request-otp", { body: { code, phone } }),
  verifyOtp: (code, phone, otp) =>
    request("POST", "/voter/verify-otp", { body: { code, phone, otp } }),
  getBallot: () => request("GET", "/voter/ballot", { auth: true }),
  submitBallot: (choices) =>
    request("POST", "/voter/ballot", { body: { choices }, auth: true }),
  getElectionStatus: () => request("GET", "/election/status"),
};

const impl = config.USE_MOCK_API ? mockApi : httpApi;

let armedFailure = null;
export const demoControls = {
  failNextSubmit(kind) {
    armedFailure = kind;
  },
  isFailureArmed: () => armedFailure,
};

export const api = {
  /** @returns {Promise<{ resendInMs: number, devOtp?: string }>} */
  async requestOtp(code, phone) {
    const response = await impl.requestOtp(code, phone);
    return {
      resendInMs: response.resendInMs ?? 60000,
      devOtp: response.devOtp,
    };
  },

  async verifyOtp(code, phone, otp) {
    const { token, expiresInMs } = await impl.verifyOtp(code, phone, otp);
    sessionToken = token;
    // No voter reference: nothing derived from the ID or phone is shown or stored.
    return {
      session: {
        token,
        expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
      },
      reference: "",
    };
  },

  async getElection() {
    return { ...ELECTION };
  },

  /** @returns {Promise<{ status: "open"|"closed" }>} */
  async getElectionStatus() {
    return impl.getElectionStatus();
  },

  /** @returns {Promise<{ positions: object[], candidates: Record<string, object[]> }>} */
  async getBallot() {
    const { portfolios } = await impl.getBallot({ token: sessionToken });
    const positions = portfolios.map((portfolio, index) => ({
      id: String(portfolio.id),
      order: index + 1,
      title: portfolio.title,
    }));
    const candidates = {};
    for (const portfolio of portfolios) {
      candidates[String(portfolio.id)] = portfolio.candidates.map(
        (candidate) => ({
          id: String(candidate.id),
          positionId: String(portfolio.id),
          name: candidate.name,
          image: candidate.avatarUrl ?? null,
        }),
      );
    }
    return { positions, candidates };
  },

  /**
   * @param {{ selections: { positionId: string, candidateId: string }[] }} ballot
   * @returns {Promise<{ success: true }>}
   */
  async submitBallot(ballot) {
    if (armedFailure) {
      const kind = armedFailure;
      armedFailure = null;
      throw kind === "network"
        ? new ApiError(0, "NETWORK_ERROR")
        : new ApiError(500, "INTERNAL_ERROR");
    }
    const choices = ballot.selections.map((selection) => ({
      portfolioId: selection.positionId,
      candidateId: selection.candidateId,
    }));
    return impl.submitBallot(choices, { token: sessionToken });
  },

  setSessionToken(token) {
    sessionToken = token;
  },

  reset() {
    sessionToken = null;
    impl.reset?.();
  },
};
