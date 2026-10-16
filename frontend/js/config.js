// Frontend settings. Use ?mock=1 for the mock API and ?demo=1 for demo tools.


const params = new URLSearchParams(globalThis.location?.search ?? "");

export const config = {
  /** Use the mock API when ?mock=1 is set. */
  USE_MOCK_API: params.get("mock") === "1",

  /** Base URL of the REST API. */
  API_BASE_URL: "/api",

  /** Show demo tools when ?demo=1 is set. */
  ENABLE_DEMO_TOOLS: params.get("demo") === "1",

  /** Mock API delay in milliseconds. */
  MOCK_LATENCY_MS: { min: 150, max: 450 },

  /** Shuffle candidate order for each voter. */
  RANDOMIZE_CANDIDATE_ORDER: true,

  /** Restore the ballot after a page refresh. */
  PERSIST_DRAFT: true,

  /** Mock session duration in milliseconds. */
  SESSION_TTL_MS: 30 * 60 * 1000,
};
