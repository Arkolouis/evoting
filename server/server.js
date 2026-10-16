/**
 * Demo backend for the multi-portfolio secret ballot.
 *
 * Voter API
 *   POST /api/voter/request-otp  { code, phone }       -> { sent, expiresInMs, resendInMs, devOtp? }
 *   POST /api/voter/verify-otp   { code, phone, otp }  -> { token, expiresInMs }
 *   GET  /api/voter/ballot       (token)               -> { portfolios: [{ id, title, candidates: [{ id, name, avatarUrl }] }] }
 *   POST /api/voter/ballot       (token, choices[])    -> { success: true }
 *   GET  /api/election/status    (optional)            -> { status }
 *
 * Flow: the voter ID is tied to a phone number on the register. ID + phone gets an OTP by SMS;
 * a correct OTP marks the ID used (it can never be used again) and issues a one-time session token.
 * From that point nothing identifies the voter: the token row and the vote rows share no column,
 * timestamp or reference with the register.
 */
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const {
  db,
  REGISTRATION_FEE,
  CONTEST_FEE,
  normalizeCode,
  normalizePhone,
  addVoter,
  recordPayment,
  reissue,
  setSetting,
  isVotingOpen,
  seedIfEmpty,
  resetElection,
  candidateAvatarUrl,
} = require("./db");
const avatarSvg = require("./avatar");
const sms = require("./sms");

const PORT = Number(process.env.PORT) || 3000;
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 30 * 60 * 1000; // spec: 30 min
const OTP_TTL_MS = Number(process.env.OTP_TTL_MS) || 5 * 60 * 1000;
const OTP_RESEND_MS = Number(process.env.OTP_RESEND_MS) || 60 * 1000;
const MAX_OTP_ATTEMPTS = Number(process.env.MAX_OTP_ATTEMPTS) || 3;
// Demo convenience: return the OTP in the API response so the screen can show it. Turn OFF with a real SMS provider.
const SHOW_OTP = process.env.SHOW_OTP
  ? process.env.SHOW_OTP === "1"
  : sms.provider === "console";
const ADMIN_KEY = process.env.ADMIN_KEY || "demo-admin";
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS) || 5;
const ATTEMPT_WINDOW_MS =
  Number(process.env.ATTEMPT_WINDOW_MS) || 10 * 60 * 1000;
const OTP_PEPPER =
  process.env.OTP_PEPPER || crypto.randomBytes(16).toString("hex");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

class HttpError extends Error {
  constructor(status, code, details) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const wrap = (fn) => (req, res, next) => {
  Promise.resolve()
    .then(() => fn(req, res))
    .catch(next);
};

/* ---------- failed-attempt counting (in memory, per client, never tied to an ID) ---------- */
const attempts = new Map(); // ip -> { count, first }
function attemptState(ip) {
  const now = Date.now();
  let a = attempts.get(ip);
  if (!a || now - a.first > ATTEMPT_WINDOW_MS) {
    a = { count: 0, first: now };
    attempts.set(ip, a);
  }
  return a;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, a] of attempts)
    if (now - a.first > ATTEMPT_WINDOW_MS) attempts.delete(ip);
}, 60_000).unref();

/* ---------- helpers ---------- */
function tokenFrom(req) {
  const h = req.get("authorization") || "";
  if (/^bearer /i.test(h)) return h.slice(7).trim();
  return req.body?.token || req.query.token || "";
}
function requireOpen() {
  if (!isVotingOpen()) throw new HttpError(403, "VOTING_CLOSED");
}
const hashOtp = (otp, voterId) =>
  crypto
    .createHash("sha256")
    .update(`${OTP_PEPPER}:${voterId}:${otp}`)
    .digest("hex");
const safeEqual = (a, b) =>
  a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function credentials(req) {
  const code = normalizeCode(req.body?.code);
  const phone = normalizePhone(req.body?.phone);
  if (!code || code.length > 40)
    throw new HttpError(422, "INVALID_INPUT", { field: "code" });
  if (!phone) throw new HttpError(422, "INVALID_INPUT", { field: "phone" });
  return { code, phone };
}
function notRecognised(req) {
  const att = attemptState(req.ip);
  att.count += 1;
  return new HttpError(404, "NOT_RECOGNISED", {
    attemptsRemaining: Math.max(MAX_ATTEMPTS - att.count, 0),
  });
}
function checkLockout(req, res) {
  const att = attemptState(req.ip);
  if (att.count >= MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil(
      (att.first + ATTEMPT_WINDOW_MS - Date.now()) / 1000,
    );
    res.set("Retry-After", String(retryAfterSec));
    throw new HttpError(429, "TOO_MANY_ATTEMPTS", { retryAfterSec });
  }
}

/** Returns the session row, or throws. Missing row => 409 (consumed or never issued); expired => 401. */
function sessionFor(token) {
  if (!token || typeof token !== "string")
    throw new HttpError(401, "INVALID_TOKEN");
  const s = db
    .prepare("SELECT token, expires_at FROM vote_session WHERE token = ?")
    .get(token);
  if (!s) throw new HttpError(409, "TOKEN_USED");
  if (Date.now() > s.expires_at) throw new HttpError(401, "SESSION_EXPIRED");
  return s;
}

/* ---------- voter API: OTP login ---------- */
app.post(
  "/api/voter/request-otp",
  wrap(async (req, res) => {
    requireOpen();
    const { code, phone } = credentials(req);
    checkLockout(req, res);

    // The ID must be on the register AND belong to this phone number.
    const row = db
      .prepare("SELECT id, used FROM voter_code WHERE code = ? AND phone = ?")
      .get(code, phone);
    if (!row) throw notRecognised(req);
    if (row.used) throw new HttpError(409, "CODE_USED");

    const last = db
      .prepare("SELECT sent_at FROM otp_challenge WHERE voter_id = ?")
      .get(row.id);
    if (last && Date.now() - last.sent_at < OTP_RESEND_MS) {
      const retryAfterSec = Math.ceil(
        (last.sent_at + OTP_RESEND_MS - Date.now()) / 1000,
      );
      res.set("Retry-After", String(retryAfterSec));
      throw new HttpError(429, "OTP_COOLDOWN", { retryAfterSec });
    }

    const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const now = Date.now();
    db.prepare(
      `INSERT INTO otp_challenge (voter_id, otp_hash, expires_at, sent_at, attempts) VALUES (?, ?, ?, ?, 0)
              ON CONFLICT(voter_id) DO UPDATE SET otp_hash = excluded.otp_hash, expires_at = excluded.expires_at, sent_at = excluded.sent_at, attempts = 0`,
    ).run(row.id, hashOtp(otp, row.id), now + OTP_TTL_MS, now);
    try {
      await sms.send(
        phone,
        `Your voting OTP is ${otp}. It expires in ${Math.max(1, Math.round(OTP_TTL_MS / 60000))} minutes. Do not share it.`,
      );
    } catch (e) {
      db.prepare("DELETE FROM otp_challenge WHERE voter_id = ?").run(row.id);
      console.error("SMS failed:", e.message);
      throw new HttpError(502, "SMS_FAILED");
    }
    res.json({
      sent: true,
      expiresInMs: OTP_TTL_MS,
      resendInMs: OTP_RESEND_MS,
      ...(SHOW_OTP ? { devOtp: otp } : {}),
    });
  }),
);

const verifyTx = db.transaction((code, phone, otp) => {
  const row = db
    .prepare("SELECT id, used FROM voter_code WHERE code = ? AND phone = ?")
    .get(code, phone);
  if (!row) return { err: [404, "NOT_RECOGNISED"] };
  if (row.used) return { err: [409, "CODE_USED"] };
  const ch = db
    .prepare(
      "SELECT otp_hash, expires_at, attempts FROM otp_challenge WHERE voter_id = ?",
    )
    .get(row.id);
  if (!ch) return { err: [404, "NO_OTP_REQUEST"] };
  if (Date.now() > ch.expires_at) {
    db.prepare("DELETE FROM otp_challenge WHERE voter_id = ?").run(row.id);
    return { err: [401, "OTP_EXPIRED"] };
  }
  if (!safeEqual(ch.otp_hash, hashOtp(otp, row.id))) {
    const attemptsNow = ch.attempts + 1;
    if (attemptsNow >= MAX_OTP_ATTEMPTS) {
      db.prepare("DELETE FROM otp_challenge WHERE voter_id = ?").run(row.id);
      return { err: [429, "OTP_LOCKED"] };
    }
    db.prepare("UPDATE otp_challenge SET attempts = ? WHERE voter_id = ?").run(
      attemptsNow,
      row.id,
    );
    return {
      err: [
        401,
        "INVALID_OTP",
        { attemptsRemaining: MAX_OTP_ATTEMPTS - attemptsNow },
      ],
    };
  }
  // Success: the ID is used up, the OTP is gone, and the token row carries no voter reference.
  if (
    db
      .prepare("UPDATE voter_code SET used = 1 WHERE id = ? AND used = 0")
      .run(row.id).changes !== 1
  )
    return { err: [409, "CODE_USED"] };
  db.prepare("DELETE FROM otp_challenge WHERE voter_id = ?").run(row.id);
  const token = crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT INTO vote_session (token, expires_at) VALUES (?, ?)").run(
    token,
    Date.now() + SESSION_TTL_MS,
  );
  return { token };
});

app.post(
  "/api/voter/verify-otp",
  wrap((req, res) => {
    requireOpen();
    const { code, phone } = credentials(req);
    const otp = String(req.body?.otp ?? "").trim();
    if (!/^\d{6}$/.test(otp))
      throw new HttpError(422, "INVALID_INPUT", { field: "otp" });
    const r = verifyTx(code, phone, otp);
    if (r.err) {
      if (r.err[1] === "NOT_RECOGNISED") throw notRecognised(req);
      throw new HttpError(r.err[0], r.err[1], r.err[2]);
    }
    attempts.delete(req.ip);
    res.json({ token: r.token, expiresInMs: SESSION_TTL_MS });
  }),
);

/* ---------- voter API: ballot ---------- */
// Only portfolios that have at least one candidate are on the ballot.
const contested = () =>
  db
    .prepare(
      "SELECT id, title FROM portfolio WHERE id IN (SELECT portfolio_id FROM candidate) ORDER BY position",
    )
    .all();

app.get(
  "/api/voter/ballot",
  wrap((req, res) => {
    requireOpen();
    sessionFor(tokenFrom(req));
    const cands = db
      .prepare(
        "SELECT id, portfolio_id, name, avatar_url FROM candidate ORDER BY id",
      )
      .all();
    res.json({
      portfolios: contested().map((p) => ({
        id: p.id,
        title: p.title,
        candidates: cands
          .filter((c) => c.portfolio_id === p.id)
          .map((c) => ({
            id: c.id,
            name: c.name,
            avatarUrl: c.avatar_url?.startsWith("/assets/images/")
              ? c.avatar_url
              : candidateAvatarUrl(c.id),
          })),
      })),
    });
  }),
);

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const submitTx = db.transaction((token, choices) => {
  // Single transaction: consume the token (fail if nothing deleted), then insert every vote.
  if (
    db.prepare("DELETE FROM vote_session WHERE token = ?").run(token)
      .changes !== 1
  )
    throw new HttpError(409, "TOKEN_USED");
  const insert = db.prepare(
    "INSERT INTO vote (id, portfolio_id, candidate_id) VALUES (?, ?, ?)",
  );
  // Random ids + shuffled insert order: nothing about row order is meaningful.
  for (const c of shuffled(choices))
    insert.run(crypto.randomUUID(), c.portfolioId, c.candidateId);
});

app.post(
  "/api/voter/ballot",
  wrap((req, res) => {
    requireOpen();
    const token = tokenFrom(req);
    sessionFor(token);

    const portfolios = contested().map((p) => p.id);
    const owner = new Map(
      db
        .prepare("SELECT id, portfolio_id FROM candidate")
        .all()
        .map((c) => [c.id, c.portfolio_id]),
    );
    const raw = req.body?.choices;
    const problems = [];
    if (!Array.isArray(raw) || raw.length !== portfolios.length) {
      throw new HttpError(422, "INVALID_BALLOT", [
        { issue: "wrong_choice_count", expected: portfolios.length },
      ]);
    }
    const seen = new Set();
    const choices = [];
    for (const c of raw) {
      const portfolioId = Number(c?.portfolioId),
        candidateId = Number(c?.candidateId);
      if (
        !Number.isInteger(portfolioId) ||
        !Number.isInteger(candidateId) ||
        !portfolios.includes(portfolioId)
      ) {
        problems.push({
          issue: "unknown_portfolio",
          portfolioId: c?.portfolioId,
        });
        continue;
      }
      if (seen.has(portfolioId)) {
        problems.push({ portfolioId, issue: "duplicate_portfolio" });
        continue;
      }
      seen.add(portfolioId);
      if (owner.get(candidateId) !== portfolioId) {
        problems.push({ portfolioId, issue: "candidate_not_in_portfolio" });
        continue;
      }
      choices.push({ portfolioId, candidateId });
    }
    for (const id of portfolios)
      if (!seen.has(id)) problems.push({ portfolioId: id, issue: "missing" });
    if (problems.length) throw new HttpError(422, "INVALID_BALLOT", problems);

    submitTx(token, choices); // throws (and rolls back) on any failure
    res.json({ success: true });
  }),
);

app.get(
  "/api/election/status",
  wrap((_req, res) => res.json({ status: isVotingOpen() ? "open" : "closed" })),
);

/* ---------- demo-only admin API ---------- */
function admin(req, _res, next) {
  const given = Buffer.from(String(req.get("x-admin-key") || ""));
  const want = Buffer.from(ADMIN_KEY);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want))
    return next(new HttpError(401, "ADMIN_KEY_REQUIRED"));
  next();
}
const A = (method, p, fn) => app[method]("/api/admin" + p, admin, wrap(fn));

A("get", "/summary", (_req, res) => {
  const reg = db
    .prepare(
      `SELECT COUNT(*) registered,
      COALESCE(SUM(paid_amount >= ?),0) eligible,
      COALESCE(SUM(code IS NOT NULL AND used = 0),0) idsAvailable,
      COALESCE(SUM(used),0) idsUsed,
      COALESCE(SUM(paid_amount),0) voterFees FROM voter_code`,
    )
    .get(REGISTRATION_FEE);
  const candFees = db
    .prepare(
      "SELECT COUNT(*) n, COALESCE(SUM(paid_amount),0) fees FROM candidate",
    )
    .get();
  const tally = db
    .prepare(
      `
    SELECT p.id pid, p.title, c.id cid, c.name, COUNT(v.id) votes
    FROM portfolio p JOIN candidate c ON c.portfolio_id = p.id LEFT JOIN vote v ON v.candidate_id = c.id
    GROUP BY c.id ORDER BY p.position, c.id`,
    )
    .all();
  const results = [];
  for (const r of tally) {
    let p = results.find((x) => x.id === r.pid);
    if (!p) results.push((p = { id: r.pid, title: r.title, candidates: [] }));
    p.candidates.push({ id: r.cid, name: r.name, votes: r.votes });
  }
  res.json({
    open: isVotingOpen(),
    fees: { registration: REGISTRATION_FEE, contest: CONTEST_FEE },
    register: {
      registered: reg.registered,
      eligible: reg.eligible,
      idsAvailable: reg.idsAvailable,
      idsUsed: reg.idsUsed,
    },
    collected: {
      voters: reg.voterFees,
      candidates: candFees.fees,
      total: reg.voterFees + candFees.fees,
    },
    candidates: candFees.n,
    activeSessions: db
      .prepare("SELECT COUNT(*) n FROM vote_session WHERE expires_at > ?")
      .get(Date.now()).n,
    ballotsCast: db
      .prepare(
        "SELECT COALESCE(MAX(n),0) n FROM (SELECT COUNT(*) n FROM vote GROUP BY portfolio_id)",
      )
      .get().n,
    sms: { provider: sms.provider, showOtp: SHOW_OTP },
    results,
  });
});

// Register
A("get", "/voters", (_req, res) => {
  res.json({
    voters: db
      .prepare(
        "SELECT id, name, phone, paid_amount paid, code, used FROM voter_code ORDER BY id",
      )
      .all(),
    fee: REGISTRATION_FEE,
  });
});
A("post", "/voters", (req, res) => {
  const list = Array.isArray(req.body?.voters)
    ? req.body.voters.slice(0, 1000)
    : [];
  if (!list.length) throw new HttpError(422, "NO_ROWS");
  const results = db.transaction(() =>
    list.map((v, i) => ({
      row: i + 1,
      name: v?.name ?? "",
      ...addVoter(v ?? {}),
    })),
  )();
  res.json({ results, created: results.filter((r) => !r.error).length });
});
A("post", "/voters/:id/payment", (req, res) => {
  const r = recordPayment(Number(req.params.id), req.body?.amount);
  if (r.error)
    throw new HttpError(r.error === "NOT_FOUND" ? 404 : 422, r.error);
  res.json(r);
});
A("post", "/voters/:id/reissue", (req, res) => {
  const r = reissue(Number(req.params.id));
  if (r.error)
    throw new HttpError(
      r.error === "NOT_FOUND" ? 404 : 422,
      r.error,
      r.error === "NOT_PAID" ? { fee: REGISTRATION_FEE } : undefined,
    );
  res.json(r);
});

// Candidates (contesting fee)
const votesExist = () =>
  db.prepare("SELECT 1 x FROM vote LIMIT 1").get() !== undefined;
A("get", "/portfolios", (_req, res) => {
  const cands = db
    .prepare(
      "SELECT id, portfolio_id, name, paid_amount paid FROM candidate ORDER BY id",
    )
    .all();
  res.json({
    fee: CONTEST_FEE,
    portfolios: db
      .prepare("SELECT id, title FROM portfolio ORDER BY position")
      .all()
      .map((p) => ({
        ...p,
        candidates: cands.filter((c) => c.portfolio_id === p.id),
      })),
  });
});
A("post", "/candidates", (req, res) => {
  const portfolioId = Number(req.body?.portfolioId);
  const name = String(req.body?.name ?? "")
    .trim()
    .slice(0, 80);
  const amount = Math.floor(Number(req.body?.amount) || 0);
  if (!db.prepare("SELECT 1 x FROM portfolio WHERE id = ?").get(portfolioId))
    throw new HttpError(404, "PORTFOLIO_NOT_FOUND");
  if (!name) throw new HttpError(422, "NAME_REQUIRED");
  if (amount < CONTEST_FEE)
    throw new HttpError(422, "FEE_TOO_LOW", { required: CONTEST_FEE });
  if (votesExist()) throw new HttpError(409, "VOTING_STARTED"); // the ballot is frozen once votes exist
  const id = db
    .prepare(
      "INSERT INTO candidate (portfolio_id, name, paid_amount) VALUES (?, ?, ?)",
    )
    .run(portfolioId, name, amount).lastInsertRowid;
  db.prepare("UPDATE candidate SET avatar_url = ? WHERE id = ?").run(
    candidateAvatarUrl(id),
    id,
  );
  res.json({ id });
});
A("delete", "/candidates/:id", (req, res) => {
  if (votesExist()) throw new HttpError(409, "VOTING_STARTED");
  db.prepare("DELETE FROM candidate WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

A("get", "/outbox", (_req, res) =>
  res.json({ provider: sms.provider, messages: sms.outbox() }),
);
A("post", "/voting", (req, res) => {
  const open = !!req.body?.open;
  if (open && contested().length === 0)
    throw new HttpError(409, "NO_CANDIDATES");
  setSetting("voting_open", open ? "1" : "0");
  res.json({ open: isVotingOpen() });
});
A("post", "/reset", (_req, res) => {
  resetElection();
  setSetting("voting_open", "1");
  res.json({ ok: true });
});

/* ---------- static: avatars, admin page, frontend ---------- */
app.get("/avatars/:id.svg", (req, res) => {
  res
    .type("image/svg+xml")
    .set("Cache-Control", "public, max-age=86400")
    .send(avatarSvg(req.params.id));
});
app.get("/admin", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "admin.html")),
);
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.use("/api", (_req, _res, next) => next(new HttpError(404, "NOT_FOUND")));
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError)
    return res
      .status(err.status)
      .json({ code: err.code, details: err.details ?? null });
  if (err.type === "entity.parse.failed")
    return res.status(400).json({ code: "BAD_JSON", details: null });
  console.error(err);
  res.status(500).json({ code: "INTERNAL_ERROR", details: null });
});

/* ---------- start ---------- */
if (require.main === module) {
  const fresh = seedIfEmpty();
  db.prepare("DELETE FROM vote_session WHERE expires_at < ?").run(
    Date.now() - 24 * 3600 * 1000,
  );
  app.listen(PORT, () => {
    console.log(`\nE-voting demo running:  http://localhost:${PORT}`);
    console.log(
      `Admin page:             http://localhost:${PORT}/admin   (key: ${ADMIN_KEY})`,
    );
    console.log(
      `SMS provider: ${sms.provider}${SHOW_OTP ? "  (demo: the OTP is also shown on screen)" : ""}`,
    );
    if (fresh) {
      console.log(
        `\nCreated a sample register of ${fresh.length} voters. Log in with an ID and its phone number:`,
      );
      for (const v of fresh.slice(0, 5))
        console.log(`   ${v.code}   ${v.phone}   (${v.name})`);
      console.log(
        "   ... the full register is on the admin page, or run: npm run seed",
      );
    }
    console.log(`Voting is ${isVotingOpen() ? "OPEN" : "CLOSED"}.\n`);
  });
}
module.exports = { app, HttpError };
