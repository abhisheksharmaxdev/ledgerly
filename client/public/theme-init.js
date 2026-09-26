(function () {
  try {
    var theme = localStorage.getItem("ledgerly.theme") || "dark";
    if (theme === "system") {
      theme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    if (localStorage.getItem("ledgerly.animations") === "reduced") {
      document.documentElement.setAttribute("data-motion", "reduced");
    }
  } catch (e) {
    /* storage unavailable: keep defaults */
  }
})();
