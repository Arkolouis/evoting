/** Spec + OTP/register/fee rules against a throwaway database: `npm test` */
const os = require("os"),
  path = require("path"),
  fs = require("fs"),
  assert = require("assert");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "evote-"));
process.env.DB_PATH = path.join(tmp, "t.db");
process.env.SESSION_TTL_MS = "3000";
process.env.MAX_ATTEMPTS = "4";
process.env.OTP_RESEND_MS = "300";
process.env.OTP_TTL_MS = "800";
process.env.SHOW_OTP = "1";
const { db, seedIfEmpty, setSetting, normalizePhone } = require("./db");
const { app } = require("./server");

(async () => {
  const voters = seedIfEmpty(12);
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const call = async (method, p, body, token, headers = {}) => {
    const r = await fetch(base + p, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };
  const adminCall = (m, p, b) =>
    call(m, "/admin" + p, b, null, { "x-admin-key": "demo-admin" });
  let n = 0;
  const ok = (name) => console.log(`  ok  ${++n}. ${name}`);
  const reqOtp = (v, phone) =>
    call("POST", "/voter/request-otp", {
      code: v.code,
      phone: phone ?? v.phone,
    });
  const login = async (v) => {
    const a = await reqOtp(v);
    assert.equal(a.status, 200, JSON.stringify(a));
    const b = await call("POST", "/voter/verify-otp", {
      code: v.code,
      phone: v.phone,
      otp: a.body.devOtp,
    });
    assert.equal(b.status, 200, JSON.stringify(b));
    return b.body.token;
  };
  const fullChoices = (ballot, pick = 0) =>
    ballot.portfolios.map((p) => ({
      portfolioId: p.id,
      candidateId: p.candidates[pick].id,
    }));

  // phone normalisation
  assert.equal(normalizePhone("024 123 4567"), "+233241234567");
  assert.equal(normalizePhone("+233241234567"), "+233241234567");
  assert.equal(normalizePhone("233241234567"), "+233241234567");
  assert.equal(normalizePhone("12345"), null);
  ok("phone numbers normalised to +233…");

  // OTP login
  let r = await reqOtp(voters[0], "0200000999");
  assert.equal(r.status, 404);
  assert.equal(r.body.code, "NOT_RECOGNISED");
  assert.equal(r.body.details.attemptsRemaining, 3);
  ok("right ID with someone else's phone => 404 (counted)");
  r = await call("POST", "/voter/request-otp", {
    code: voters[0].code,
    phone: "abc",
  });
  assert.equal(r.status, 422);
  ok("bad phone => 422");
  r = await reqOtp(voters[0]);
  assert.equal(r.status, 200);
  assert(/^\d{6}$/.test(r.body.devOtp));
  const otp1 = r.body.devOtp;
  ok("ID + matching phone => OTP sent (6 digits)");
  assert.equal((await reqOtp(voters[0])).status, 429);
  ok("OTP resend inside cooldown => 429");
  const wrong = otp1 === "000000" ? "111111" : "000000";
  r = await call("POST", "/voter/verify-otp", {
    code: voters[0].code,
    phone: voters[0].phone,
    otp: wrong,
  });
  assert.equal(r.status, 401);
  assert.equal(r.body.details.attemptsRemaining, 2);
  ok("wrong OTP => 401 with attempts left");
  r = await call("POST", "/voter/verify-otp", {
    code: voters[0].code,
    phone: voters[0].phone,
    otp: otp1,
  });
  assert.equal(r.status, 200);
  const tokenA = r.body.token;
  assert.equal(r.body.expiresInMs, 3000);
  ok("correct OTP => token + expiresInMs");
  assert.equal(
    db.prepare("SELECT used FROM voter_code WHERE code = ?").get(voters[0].code)
      .used,
    1,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM otp_challenge WHERE voter_id = (SELECT id FROM voter_code WHERE code = ?)",
      )
      .get(voters[0].code).n,
    0,
  );
  ok("ID marked used and OTP deleted on success");
  assert.equal((await reqOtp(voters[0])).status, 409);
  assert.equal(
    (
      await call("POST", "/voter/verify-otp", {
        code: voters[0].code,
        phone: voters[0].phone,
        otp: otp1,
      })
    ).status,
    409,
  );
  ok("used ID cannot get another OTP or log in again => 409");
  assert.equal(
    (await call("POST", "/voter/validate-code", { code: voters[0].code }))
      .status,
    404,
  );
  ok("old code-only endpoint is gone (no OTP bypass)");

  // OTP expiry and lock
  await sleep(350);
  r = await reqOtp(voters[1]);
  const otp2 = r.body.devOtp;
  await sleep(900);
  r = await call("POST", "/voter/verify-otp", {
    code: voters[1].code,
    phone: voters[1].phone,
    otp: otp2,
  });
  assert.equal(r.status, 401);
  assert.equal(r.body.code, "OTP_EXPIRED");
  ok("expired OTP => 401 OTP_EXPIRED");
  await sleep(350);
  r = await reqOtp(voters[1]);
  const otp3 = r.body.devOtp;
  const bad = otp3 === "000000" ? "111111" : "000000";
  for (let i = 0; i < 2; i++)
    await call("POST", "/voter/verify-otp", {
      code: voters[1].code,
      phone: voters[1].phone,
      otp: bad,
    });
  r = await call("POST", "/voter/verify-otp", {
    code: voters[1].code,
    phone: voters[1].phone,
    otp: bad,
  });
  assert.equal(r.status, 429);
  assert.equal(r.body.code, "OTP_LOCKED");
  r = await call("POST", "/voter/verify-otp", {
    code: voters[1].code,
    phone: voters[1].phone,
    otp: otp3,
  });
  assert.equal(r.status, 404);
  ok(
    "3 wrong OTPs lock that OTP (even the right one then fails); a new one must be requested",
  );

  // ballot
  r = await call("GET", "/voter/ballot", null, tokenA);
  assert.equal(r.status, 200);
  assert.equal(r.body.portfolios.length, 11);
  assert(
    r.body.portfolios.every(
      (p) =>
        p.candidates.length === 3 &&
        p.candidates.every((c) => c.name && c.avatarUrl),
    ),
  );
  assert(
    r.body.portfolios[0].candidates[0].avatarUrl.startsWith(
      "/assets/images/image",
    ),
  );
  ok("ballot: 11 portfolios x 3 candidates with asset image avatarUrl");
  const ballot = r.body;
  assert.equal((await call("GET", "/voter/ballot")).status, 401);
  ok("ballot without token => 401");
  const bad2 = [
    ["too few", fullChoices(ballot).slice(0, 10)],
    [
      "duplicate portfolio",
      [...fullChoices(ballot).slice(0, 10), fullChoices(ballot)[0]],
    ],
    [
      "candidate from another portfolio",
      fullChoices(ballot).map((c, i) =>
        i === 0
          ? { ...c, candidateId: ballot.portfolios[1].candidates[0].id }
          : c,
      ),
    ],
    [
      "unknown portfolio",
      [
        ...fullChoices(ballot).slice(0, 10),
        { portfolioId: 999, candidateId: 1 },
      ],
    ],
    ["too many", [...fullChoices(ballot), fullChoices(ballot)[0]]],
    ["not an array", "nope"],
  ];
  for (const [name, choices] of bad2)
    assert.equal(
      (await call("POST", "/voter/ballot", { choices }, tokenA)).status,
      422,
      name,
    );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM vote").get().n, 0);
  ok("6 invalid ballots => 422, nothing saved");
  r = await call(
    "POST",
    "/voter/ballot",
    { choices: fullChoices(ballot, 1) },
    tokenA,
  );
  assert.equal(r.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM vote").get().n, 11);
  ok("valid ballot: 11 vote rows inserted");
  assert.equal(
    (
      await call(
        "POST",
        "/voter/ballot",
        { choices: fullChoices(ballot, 2) },
        tokenA,
      )
    ).status,
    409,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM vote").get().n, 11);
  ok("same token twice: 409, no extra votes");

  // secrecy
  const cols = (t) =>
    db
      .prepare(`PRAGMA table_info(${t})`)
      .all()
      .map((c) => c.name);
  assert.deepEqual(cols("vote"), ["id", "portfolio_id", "candidate_id"]);
  assert.deepEqual(cols("vote_session"), ["token", "expires_at"]);
  assert(
    /WITHOUT ROWID/.test(
      db.prepare("SELECT sql FROM sqlite_master WHERE name='vote'").get().sql,
    ),
  );
  assert(
    db
      .prepare("SELECT id FROM vote")
      .all()
      .every((v) => /^[0-9a-f-]{36}$/.test(v.id)),
  );
  ok(
    "secrecy: vote and session tables hold no voter/phone/time reference; random ids; WITHOUT ROWID",
  );

  // session expiry
  await sleep(350);
  const tokenB = await login(voters[2]);
  await sleep(3100);
  r = await call(
    "POST",
    "/voter/ballot",
    { choices: fullChoices(ballot) },
    tokenB,
  );
  assert.equal(r.status, 401);
  assert.equal(r.body.code, "SESSION_EXPIRED");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM vote").get().n, 11);
  ok("expired session: 401, nothing saved");
  const id2 = db
    .prepare("SELECT id FROM voter_code WHERE code = ?")
    .get(voters[2].code).id;
  r = await adminCall("POST", `/voters/${id2}/reissue`);
  assert.equal(r.status, 200);
  assert.notEqual(r.body.code, voters[2].code);
  assert.equal(
    (await reqOtp({ code: r.body.code, phone: voters[2].phone })).status,
    200,
  );
  ok("admin void & reissue gives a new unused ID for the same phone");

  // closed
  await sleep(350);
  const tokenC = await login(voters[3]);
  setSetting("voting_open", "0");
  assert.equal(
    (
      await call(
        "POST",
        "/voter/ballot",
        { choices: fullChoices(ballot) },
        tokenC,
      )
    ).status,
    403,
  );
  assert.equal((await reqOtp(voters[4])).status, 403);
  setSetting("voting_open", "1");
  assert.equal(
    (
      await call(
        "POST",
        "/voter/ballot",
        { choices: fullChoices(ballot) },
        tokenC,
      )
    ).status,
    200,
  );
  ok(
    "voting closed: OTP and submit => 403, nothing saved; token survives re-open",
  );

  // register + fees (admin)
  assert.equal((await fetch(base + "/admin/summary")).status, 401);
  ok("admin API needs the key");
  r = await adminCall("POST", "/voters", {
    voters: [
      { name: "Ama", phone: "0241112222", amount: 50 },
      { name: "Kofi", phone: "0241113333", amount: 20 },
      { name: "Dup", phone: "024 111 2222", amount: 50 },
      { name: "Bad", phone: "12", amount: 50 },
    ],
  });
  assert(r.body.results[0].code && !r.body.results[1].code);
  assert.equal(r.body.results[2].error, "PHONE_EXISTS");
  assert.equal(r.body.results[3].error, "INVALID_PHONE");
  ok(
    "register: 50+ cedis gets an ID, under 50 gets none; duplicate and invalid phones rejected",
  );
  const kofi = r.body.results[1].id;
  assert.equal(
    (await adminCall("POST", `/voters/${kofi}/payment`, { amount: 30 })).body
      .paid,
    50,
  );
  assert(
    (await adminCall("GET", "/voters")).body.voters.find((v) => v.id === kofi)
      .code,
  );
  ok("topping up to 50 cedis issues the ID");
  const pid = ballot.portfolios[0].id;
  r = await adminCall("POST", "/candidates", {
    portfolioId: pid,
    name: "New Person",
    amount: 150,
  });
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "FEE_TOO_LOW");
  r = await adminCall("POST", "/candidates", {
    portfolioId: pid,
    name: "New Person",
    amount: 200,
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "VOTING_STARTED");
  ok(
    "candidate needs 200 cedis (422), and cannot be added once votes exist (409)",
  );
  const sum = (await adminCall("GET", "/summary")).body;
  assert.equal(sum.ballotsCast, 2);
  assert.equal(sum.fees.contest, 200);
  assert(sum.collected.total >= 33 * 200);
  ok("admin summary: ballots cast and fees collected");

  // contest flow on a clean slate
  await adminCall("POST", "/reset");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM vote").get().n, 0);
  r = await adminCall("POST", "/candidates", {
    portfolioId: pid,
    name: "New Person",
    amount: 200,
  });
  assert.equal(r.status, 200);
  const t2 = await login(voters[5]);
  r = await call("GET", "/voter/ballot", null, t2);
  assert(
    r.body.portfolios
      .find((p) => p.id === pid)
      .candidates.some((c) => c.name === "New Person"),
  );
  ok("after reset a paid candidate appears on the ballot");

  srv.close();
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (err) {
    if (err && err.code !== "EPERM") throw err;
    console.warn(`Cleanup warning: ${err.message}`);
  }
  console.log(`\nAll ${n} checks passed.`);
  process.exit(0);
})().catch((e) => {
  console.error("\nFAILED:", e);
  process.exit(1);
});
