// Theme switch: sets data-theme="light" or data-theme="dark" on <html>.
const root = document.documentElement;
document.querySelector("#theme-toggle").addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
});
