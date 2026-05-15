const IA_TIMEOUT_MS = 20000;

function renderTexto(texto) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
}
