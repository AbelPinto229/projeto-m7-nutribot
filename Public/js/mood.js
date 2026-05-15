// muda o tema visual da app consoante a avaliação da ia à refeição
function applyMood(mood) {
  const themeLabel = document.getElementById("themeLabel"); // elemento onde aparece a mensagem do mood

  // mapa de mood → classe css e texto a mostrar no header
  const map = {
    happy:   { theme: "theme-happy",    label: "Estás lá! 💪" },
    ok:      { theme: "theme-ok",       label: "Não está mauzito! 👌" },
    stressed:{ theme: "theme-stressed", label: "Epa tu me digas mais nada... 😮‍💨" },
    angry:   { theme: "theme-angry",    label: "Desisto de ti. 🤦" },
  };

  const m = map[mood] ?? { theme: "", label: "neutro" }; // ?? = se o mood não existir, usa neutro
  document.body.className = m.theme;                     // aplica a classe css no body (muda as cores)
  themeLabel.className = `theme-label mood-${mood}`;     // classe específica do mood no label
  themeLabel.textContent = m.label;                      // mostra o texto do mood no header
}
