function applyMood(mood) {
  const themeLabel = document.getElementById("themeLabel");
  const map = {
    happy:   { theme: "theme-happy",    label: "Estás lá! 💪" },
    ok:      { theme: "theme-ok",       label: "Não está mauzito! 👌" },
    stressed:{ theme: "theme-stressed", label: "Epa tu me digas mais nada... 😮‍💨" },
    angry:   { theme: "theme-angry",    label: "Desisto de ti. 🤦" },
  };
  const m = map[mood] ?? { theme: "", label: "neutro" };
  document.body.className = m.theme;
  themeLabel.className = `theme-label mood-${mood}`;
  themeLabel.textContent = m.label;
}
