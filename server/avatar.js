/** Deterministic placeholder avatar (SVG) per candidate id. Real images come from the admin dashboard. */
const BG = ["#3d5a80", "#6a994e", "#bc6c25", "#7b2cbf", "#0f7b8a", "#c1445e"];
const SKIN = ["#f1c9a5", "#d9a066", "#a86f45", "#6e4a30"];
const HAIR = ["#2b2118", "#5a3825", "#1c1c1c", "#8a6b3d"];
const SHIRT = ["#f2f2f2", "#264653", "#e9c46a", "#457b9d"];

module.exports = function avatarSvg(seed) {
  const s = Number(seed) || 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="${BG[s % 6]}"/><path d="M12 80c0-16 12-24 28-24s28 8 28 24z" fill="${SHIRT[(s + 1) % 4]}"/><circle cx="40" cy="34" r="14" fill="${SKIN[(s * 3) % 4]}"/><path d="M25 32c0-12 6-18 15-18s15 6 15 18c-4-6-10-8-15-8s-11 2-15 8z" fill="${HAIR[(s * 7) % 4]}"/></svg>`;
};
