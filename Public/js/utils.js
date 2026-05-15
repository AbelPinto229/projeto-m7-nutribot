// tempo máximo de espera pela ia (20 segundos) — usado no nutrition.js e chat.js
const IA_TIMEOUT_MS = 20000;

// converte o texto da ia para html seguro — remove markdown e transforma newlines em quebras
function renderTexto(texto) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, "$1") // remove **negrito** — fica só o texto
    .replace(/\*(.*?)\*/g, "$1")      // remove *itálico* — fica só o texto
    .replace(/#{1,6}\s/g, "")         // remove # títulos (# ## ### etc.)
    .replace(/\n\n/g, "<br><br>")     // dois newlines = parágrafo no html
    .replace(/\n/g, "<br>");          // um newline = quebra de linha no html
}
