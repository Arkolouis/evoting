export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

export function normalizeCode(raw) {
  return String(raw ?? "")
    .trim()
    .toUpperCase();
}

// The server checks whether the code is valid.
export function validateCodeFormat(raw) {
  const code = normalizeCode(raw);
  if (!code) return "Please enter your voter code.";
  return "";
}

export function getInitials(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// These colors keep white initials readable.
const AVATAR_COLORS = [
  "#3730a3",
  "#1d4ed8",
  "#0f766e",
  "#b45309",
  "#047857",
  "#7e22ce",
  "#be123c",
  "#0369a1",
  "#334155",
  "#a21caf",
  "#0e7490",
];

export function avatarColor(seed) {
  let hash = 0;
  const text = String(seed ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function formatTimestamp(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toUTCString();
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}
