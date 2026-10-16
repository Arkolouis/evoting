/**
 * SMS sending. Choose with SMS_PROVIDER:
 *   console (default)  nothing is sent; messages are logged and kept in an in-memory outbox
 *                      that the admin page shows (demo only: it contains OTPs).
 *   arkesel            sends through Arkesel's HTTP API (needs ARKESEL_API_KEY, SMS_SENDER).
 *                      UNTESTED skeleton: check the provider's current docs before relying on it.
 * Add another provider by adding a function to PROVIDERS.
 */
const provider = (process.env.SMS_PROVIDER || "console").toLowerCase();
const outbox = [];

const PROVIDERS = {
  async console(phone, text) {
    outbox.unshift({ phone, text, at: Date.now() });
    outbox.length = Math.min(outbox.length, 30);
    console.log(`[sms:console] to ${phone}: ${text}`);
  },
  async arkesel(phone, text) {
    const key = process.env.ARKESEL_API_KEY;
    if (!key) throw new Error("ARKESEL_API_KEY is not set");
    const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ sender: process.env.SMS_SENDER || "EVOTE", message: text, recipients: [phone.replace(/^\+/, "")] }),
    });
    if (!res.ok) throw new Error(`Arkesel responded ${res.status}`);
  },
};

if (!PROVIDERS[provider]) throw new Error(`Unknown SMS_PROVIDER "${provider}"`);

module.exports = {
  provider,
  send: (phone, text) => PROVIDERS[provider](phone, text),
  outbox: () => (provider === "console" ? outbox : []),
};
