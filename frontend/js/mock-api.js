// Local demo API. It is not secure and must not be used for a real election.

import { config } from "./config.js";
import { ELECTION, POSITIONS } from "../data/election-data.js";
import { CANDIDATES_BY_POSITION } from "../data/candidate-data.js";
import { ApiError } from "./errors.js";
import { delay, normalizeCode, randomBetween } from "./utils.js";

export const DEMO_VOTERS = [
  { code: "STU-8492-VOTE", phone: "+233200000001" },
  { code: "STU-1111-VOTE", phone: "+233200000002" },
  { code: "STU-2222-VOTE", phone: "+233200000003" },
  { code: "STU-3333-VOTE", phone: "+233200000004" },
  { code: "STU-4444-VOTE", phone: "+233200000005" },
];
const MAX_ATTEMPTS = 5;
const MAX_OTP_TRIES = 3;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const MOCK_DB_KEY = "su-evote-mock-db-v3";

function fresh() {
  return {
    usedCodes: new Set(),
    sessions: new Map(),
    otps: new Map(),
    failedAttempts: 0,
    electionStatus: ELECTION.status,
  };
}
function loadDb() {
  const db = fresh();
  try {
    const raw = JSON.parse(sessionStorage.getItem(MOCK_DB_KEY) || "null");
    if (!raw) return db;
    db.usedCodes = new Set(raw.usedCodes);
    db.sessions = new Map(raw.sessions);
    db.otps = new Map(raw.otps);
    db.failedAttempts = raw.failedAttempts ?? 0;
  } catch {}
  return db;
}

let db = loadDb();

function saveDb() {
  try {
    sessionStorage.setItem(
      MOCK_DB_KEY,
      JSON.stringify({
        usedCodes: [...db.usedCodes],
        sessions: [...db.sessions],
        otps: [...db.otps],
        failedAttempts: db.failedAttempts,
      }),
    );
  } catch {}
}

const latency = () =>
  delay(randomBetween(config.MOCK_LATENCY_MS.min, config.MOCK_LATENCY_MS.max));
const randomToken = () =>
  Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join("");
const normalizePhone = (raw) => {
  let phone = String(raw ?? "").replace(/[\s\-().]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  else if (phone.startsWith("0")) phone = "233" + phone.slice(1);
  return /^\d{9,15}$/.test(phone) ? "+" + phone : null;
};

const portfolioId = (position) => position.order;
const candidateNumericId = (position, index) => position.order * 10 + index + 1;

function sessionFor(token) {
  if (!token) throw new ApiError(401, "INVALID_TOKEN");
  const session = db.sessions.get(token);
  if (!session) throw new ApiError(409, "TOKEN_USED");
  if (Date.now() > session.expiresAt)
    throw new ApiError(401, "SESSION_EXPIRED");
  return session;
}

function recognise(rawCode, rawPhone) {
  if (db.electionStatus !== "open") throw new ApiError(403, "VOTING_CLOSED");
  const code = normalizeCode(rawCode);
  const phone = normalizePhone(rawPhone);
  if (!code || !phone) throw new ApiError(422, "INVALID_INPUT");
  if (db.failedAttempts >= MAX_ATTEMPTS)
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", { retryAfterSec: 600 });
  if (!DEMO_VOTERS.some((v) => v.code === code && v.phone === phone)) {
    db.failedAttempts += 1;
    saveDb();
    throw new ApiError(404, "NOT_RECOGNISED", {
      attemptsRemaining: Math.max(MAX_ATTEMPTS - db.failedAttempts, 0),
    });
  }
  if (db.usedCodes.has(code)) throw new ApiError(409, "CODE_USED");
  return code;
}

export const mockApi = {
  async requestOtp(rawCode, rawPhone) {
    await latency();
    const code = recognise(rawCode, rawPhone);
    const last = db.otps.get(code);
    if (last && Date.now() - last.sentAt < OTP_RESEND_MS) {
      throw new ApiError(429, "OTP_COOLDOWN", {
        retryAfterSec: Math.ceil(
          (last.sentAt + OTP_RESEND_MS - Date.now()) / 1000,
        ),
      });
    }
    const otp = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    db.otps.set(code, {
      otp,
      sentAt: Date.now(),
      expiresAt: Date.now() + OTP_TTL_MS,
      tries: 0,
    });
    saveDb();
    return {
      sent: true,
      expiresInMs: OTP_TTL_MS,
      resendInMs: OTP_RESEND_MS,
      devOtp: otp,
    };
  },

  async verifyOtp(rawCode, rawPhone, rawOtp) {
    await latency();
    const code = recognise(rawCode, rawPhone);
    const ch = db.otps.get(code);
    if (!ch) throw new ApiError(404, "NO_OTP_REQUEST");
    if (Date.now() > ch.expiresAt) {
      db.otps.delete(code);
      saveDb();
      throw new ApiError(401, "OTP_EXPIRED");
    }
    if (String(rawOtp).trim() !== ch.otp) {
      ch.tries += 1;
      if (ch.tries >= MAX_OTP_TRIES) {
        db.otps.delete(code);
        saveDb();
        throw new ApiError(429, "OTP_LOCKED");
      }
      saveDb();
      throw new ApiError(401, "INVALID_OTP", {
        attemptsRemaining: MAX_OTP_TRIES - ch.tries,
      });
    }
    db.otps.delete(code);
    db.usedCodes.add(code); // the ID is used up as soon as the OTP is accepted
    db.failedAttempts = 0;
    const token = randomToken();
    db.sessions.set(token, { expiresAt: Date.now() + config.SESSION_TTL_MS }); // no voter reference stored
    saveDb();
    return { token, expiresInMs: config.SESSION_TTL_MS };
  },

  async getElectionStatus() {
    await latency();
    return { status: db.electionStatus };
  },

  async getBallot(auth) {
    await latency();
    if (db.electionStatus !== "open") throw new ApiError(403, "VOTING_CLOSED");
    sessionFor(auth?.token);
    const portfolios = [...POSITIONS]
      .sort((first, second) => first.order - second.order)
      .map((position) => ({
        id: portfolioId(position),
        title: position.title,
        candidates: (CANDIDATES_BY_POSITION[position.id] ?? []).map(
          (candidate, index) => ({
            id: candidateNumericId(position, index),
            name: candidate.name,
            avatarUrl: candidate.image ?? null,
          }),
        ),
      }));
    return { portfolios };
  },

  async submitBallot(choices, auth) {
    await delay(900);
    if (db.electionStatus !== "open") throw new ApiError(403, "VOTING_CLOSED");
    sessionFor(auth?.token);

    const problems = [];
    if (!Array.isArray(choices) || choices.length !== POSITIONS.length) {
      throw new ApiError(422, "INVALID_BALLOT", [
        { issue: "wrong_choice_count", expected: POSITIONS.length },
      ]);
    }
    const seen = new Set();
    for (const choice of choices) {
      const pid = Number(choice?.portfolioId);
      const cid = Number(choice?.candidateId);
      const position = POSITIONS.find((p) => portfolioId(p) === pid);
      if (!position) {
        problems.push({ issue: "unknown_portfolio" });
        continue;
      }
      if (seen.has(pid)) {
        problems.push({ portfolioId: pid, issue: "duplicate_portfolio" });
        continue;
      }
      seen.add(pid);
      const valid = (CANDIDATES_BY_POSITION[position.id] ?? []).some(
        (_, i) => candidateNumericId(position, i) === cid,
      );
      if (!valid)
        problems.push({
          portfolioId: pid,
          issue: "candidate_not_in_portfolio",
        });
    }
    if (problems.length) throw new ApiError(422, "INVALID_BALLOT", problems);

    db.sessions.delete(auth.token);
    saveDb();
    return { success: true };
  },

  reset() {
    db = fresh();
    try {
      sessionStorage.removeItem(MOCK_DB_KEY);
    } catch {}
  },
};
