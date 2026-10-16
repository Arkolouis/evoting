const root = document.documentElement;

export function getTheme() {
  return "light";
}

// Keep the demo light-only.
export function initTheme() {
  root.setAttribute("data-theme", "light");
  try {
    localStorage.setItem("su-evote-theme", "light");
  } catch {}
}
