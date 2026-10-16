/**
 * SQLite layer. Schema follows the spec (section 4):
 *  - portfolio / candidate / vote are the ballot tables.
 *  - voter_code (the register: name, phone, fee paid, ID) and vote_session have NO
 *    relationship to the vote tables. otp_challenge belongs to the voter side only
 *    and is deleted the moment the OTP is verified.
 *  - vote has no timestamp, IP, ballot id or auto-increment id.
 *    It is WITHOUT ROWID with a random primary key, so physical row order
 *    cannot be matched to the order in which codes were used.
 *  - setting holds the open/closed switch (the spec requires a "voting open"
 *    check but does not say where it lives).
 */
const { DatabaseSync } = require("node:sqlite"); // built into Node 22.13+; nothing to compile
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "data", "evoting.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const raw = new DatabaseSync(DB_PATH);
raw.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

/** Thin wrapper giving node:sqlite the small API the rest of the server uses. */
let txDepth = 0;
const db = {
  exec: (sql) => raw.exec(sql),
  prepare(sql) {
    const st = raw.prepare(sql);
    return {
      get: (...a) => st.get(...a),
      all: (...a) => st.all(...a),
      run(...a) {
        const r = st.run(...a);
        return {
          changes: Number(r.changes),
          lastInsertRowid: Number(r.lastInsertRowid),
        };
      },
    };
  },
  /** BEGIN IMMEDIATE ... COMMIT; any throw rolls everything back. Nested calls join the outer transaction. */
  transaction:
    (fn) =>
    (...args) => {
      if (txDepth > 0) return fn(...args);
      raw.exec("BEGIN IMMEDIATE");
      txDepth++;
      try {
        const result = fn(...args);
        raw.exec("COMMIT");
        return result;
      } catch (err) {
        raw.exec("ROLLBACK");
        throw err;
      } finally {
        txDepth--;
      }
    },
};

// Old demo databases had anonymous codes without phones: start the register fresh.
{
  const cols = db.prepare("PRAGMA table_info(voter_code)").all();
  if (cols.length && !cols.some((c) => c.name === "phone"))
    db.exec("DROP TABLE voter_code");
}

db.exec(`
CREATE TABLE IF NOT EXISTS portfolio (
  id       INTEGER PRIMARY KEY,
  title    TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS candidate (
  id           INTEGER PRIMARY KEY,
  portfolio_id INTEGER NOT NULL REFERENCES portfolio(id),
  name         TEXT NOT NULL,
  avatar_url   TEXT
);
CREATE TABLE IF NOT EXISTS vote (
  id           TEXT PRIMARY KEY,
  portfolio_id INTEGER NOT NULL REFERENCES portfolio(id),
  candidate_id INTEGER NOT NULL REFERENCES candidate(id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS voter_code (
  id          INTEGER PRIMARY KEY,
  code        TEXT UNIQUE,                    -- the voter ID; NULL until the registration fee is paid
  used        INTEGER NOT NULL DEFAULT 0,     -- 1 once the OTP was verified (the ID can never be used again)
  name        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL,                  -- normalised +233...
  paid_amount INTEGER NOT NULL DEFAULT 0      -- cedis
);
CREATE UNIQUE INDEX IF NOT EXISTS voter_phone ON voter_code(phone);
CREATE TABLE IF NOT EXISTS otp_challenge (
  voter_id   INTEGER PRIMARY KEY REFERENCES voter_code(id),
  otp_hash   TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  sent_at    INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vote_session (
  token      TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);
if (
  !db
    .prepare("PRAGMA table_info(candidate)")
    .all()
    .some((c) => c.name === "paid_amount")
) {
  db.exec(
    "ALTER TABLE candidate ADD COLUMN paid_amount INTEGER NOT NULL DEFAULT 0",
  );
}

/* ---------- fees ---------- */
const REGISTRATION_FEE = Number(process.env.REGISTRATION_FEE) || 50; // cedis: minimum to be on the register
const CONTEST_FEE = Number(process.env.CONTEST_FEE) || 200; // cedis: to contest for a position

/* ---------- helpers ---------- */

// No 0/O/1/I/L so IDs can be read aloud and typed without confusion.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function randomCode() {
  const pick = () => ALPHABET[crypto.randomInt(ALPHABET.length)];
  const part = () => Array.from({ length: 5 }, pick).join("");
  return `${part()}-${part()}`;
}
const normalizeCode = (raw) =>
  String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

/** 024 123 4567 / +233241234567 / 233241234567 -> "+233241234567". Returns null if it is not a plausible number. */
function normalizePhone(raw) {
  let s = String(raw ?? "").replace(/[\s\-().]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (s.startsWith("0")) s = "233" + s.slice(1);
  else if (/^\d{9}$/.test(s)) s = "233" + s;
  if (!/^\d{9,15}$/.test(s)) return null;
  if (s.startsWith("233") && s.length !== 12) return null;
  return "+" + s;
}

function assignCode(voterId) {
  for (;;) {
    const code = randomCode();
    try {
      db.prepare("UPDATE voter_code SET code = ? WHERE id = ?").run(
        code,
        voterId,
      );
      return code;
    } catch (e) {
      if (!/UNIQUE/i.test(String(e.message))) throw e; // collision: try another
    }
  }
}

/** Register a voter. An ID is issued only when the fee is paid. */
function addVoter({ name, phone, amount }) {
  const p = normalizePhone(phone);
  if (!p) return { error: "INVALID_PHONE" };
  const paid = Math.max(0, Math.floor(Number(amount) || 0));
  if (db.prepare("SELECT 1 x FROM voter_code WHERE phone = ?").get(p))
    return { error: "PHONE_EXISTS" };
  const id = db
    .prepare(
      "INSERT INTO voter_code (name, phone, paid_amount) VALUES (?, ?, ?)",
    )
    .run(
      String(name ?? "")
        .trim()
        .slice(0, 80),
      p,
      paid,
    ).lastInsertRowid;
  const code = paid >= REGISTRATION_FEE ? assignCode(id) : null;
  return { id, phone: p, code };
}

/** Record a payment; issues the ID as soon as the total reaches the registration fee. */
function recordPayment(id, amount) {
  const add = Math.floor(Number(amount) || 0);
  if (add <= 0) return { error: "INVALID_AMOUNT" };
  const row = db
    .prepare("SELECT id, code, paid_amount FROM voter_code WHERE id = ?")
    .get(id);
  if (!row) return { error: "NOT_FOUND" };
  const total = row.paid_amount + add;
  db.prepare("UPDATE voter_code SET paid_amount = ? WHERE id = ?").run(
    total,
    id,
  );
  const code = row.code ?? (total >= REGISTRATION_FEE ? assignCode(id) : null);
  return { id, paid: total, code };
}

/** Void the old ID and issue a fresh, unused one (spec: expired session => admin voids and reissues). */
function reissue(id) {
  const row = db
    .prepare("SELECT id, paid_amount FROM voter_code WHERE id = ?")
    .get(id);
  if (!row) return { error: "NOT_FOUND" };
  if (row.paid_amount < REGISTRATION_FEE) return { error: "NOT_PAID" };
  db.transaction(() => {
    db.prepare("UPDATE voter_code SET used = 0, code = NULL WHERE id = ?").run(
      id,
    );
    db.prepare("DELETE FROM otp_challenge WHERE voter_id = ?").run(id);
  })();
  return { id, code: assignCode(id) };
}

function getSetting(key, fallback) {
  const row = db.prepare("SELECT value FROM setting WHERE key = ?").get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare(
    "INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, String(value));
}
const isVotingOpen = () => getSetting("voting_open", "1") === "1";

/* ---------- seed ---------- */

function candidateAvatarUrl(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) return "/assets/images/image1.jpeg";
  return `/assets/images/image${((n - 1) % 57) + 1}.jpeg`;
}

function seedBallot() {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, "seed-data.json"), "utf8"),
  );
  const addP = db.prepare(
    "INSERT INTO portfolio (title, position) VALUES (?, ?)",
  );
  const addC = db.prepare(
    "INSERT INTO candidate (portfolio_id, name, paid_amount) VALUES (?, ?, ?)",
  );
  const setAvatar = db.prepare(
    "UPDATE candidate SET avatar_url = ? WHERE id = ?",
  );
  db.transaction(() => {
    data.forEach((p, i) => {
      const pid = addP.run(p.title, i + 1).lastInsertRowid;
      for (const name of p.candidates) {
        const cid = addC.run(pid, name, CONTEST_FEE).lastInsertRowid;
        setAvatar.run(candidateAvatarUrl(cid), cid);
      }
    });
  })();
}

/** First run: ballot plus a sample register. Returns the sample voters (or null if a register already exists). */
function seedIfEmpty(voterCount = 12) {
  if (db.prepare("SELECT COUNT(*) n FROM portfolio").get().n === 0)
    seedBallot();
  if (db.prepare("SELECT COUNT(*) n FROM voter_code").get().n > 0) return null;
  const made = [];
  db.transaction(() => {
    for (let i = 1; i <= voterCount; i++) {
      const r = addVoter({
        name: `Demo Voter ${i}`,
        phone: `0200000${String(i).padStart(3, "0")}`,
        amount: REGISTRATION_FEE,
      });
      made.push({ name: `Demo Voter ${i}`, phone: r.phone, code: r.code });
    }
  })();
  return made;
}

/** Demo rehearsal reset: clears votes, sessions and OTPs; every issued ID is usable again. */
function resetElection() {
  db.transaction(() => {
    db.prepare("DELETE FROM vote").run();
    db.prepare("DELETE FROM vote_session").run();
    db.prepare("DELETE FROM otp_challenge").run();
    db.prepare("UPDATE voter_code SET used = 0").run();
  })();
}

module.exports = {
  db,
  REGISTRATION_FEE,
  CONTEST_FEE,
  randomCode,
  normalizeCode,
  normalizePhone,
  addVoter,
  recordPayment,
  reissue,
  getSetting,
  setSetting,
  isVotingOpen,
  seedIfEmpty,
  seedBallot,
  resetElection,
  candidateAvatarUrl,
  DB_PATH,
};
