#!/usr/bin/env node
/**
 * node seed.js            -> make sure ballot + sample register exist, print IDs with phones
 * node seed.js --reset    -> clear votes/sessions/OTPs, every issued ID usable again
 */
const { db, seedIfEmpty, resetElection } = require("./db");
seedIfEmpty();
if (process.argv.includes("--reset")) { resetElection(); console.log("Votes, sessions and OTPs cleared; all IDs usable again."); }
const rows = db.prepare("SELECT name, phone, code, used, paid_amount paid FROM voter_code ORDER BY id").all();
console.log(`\nRegister (${rows.length} voters):`);
for (const r of rows) console.log(`  ${(r.code ?? "(no ID: unpaid)").padEnd(12)} ${r.phone}  ${r.name}${r.used ? "  (used)" : ""}`);
