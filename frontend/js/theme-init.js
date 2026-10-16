// Apply the theme before the page renders.

(function () {
  var theme = "light";
  try {
    localStorage.setItem("su-evote-theme", theme);
  } catch (e) {}
  document.documentElement.setAttribute("data-theme", theme);
})();
