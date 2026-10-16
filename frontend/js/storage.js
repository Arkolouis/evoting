const THEME_KEY = "su-evote-theme";
const DRAFT_KEY = "su-evote-draft-v1";

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const themeStorage = {
  get: () => safe(() => localStorage.getItem(THEME_KEY)),
  set: (theme) => safe(() => localStorage.setItem(THEME_KEY, theme)),
};

export const draftStorage = {
  load() {
    return safe(() => JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"));
  },
  save(draft) {
    safe(() => sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)));
  },
  clear() {
    safe(() => sessionStorage.removeItem(DRAFT_KEY));
  },
};
