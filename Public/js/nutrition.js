// verifica se o texto parece descrever uma refeição ou bebida
function looksLikeFood(text) {
  const words = [
    "comi", "comer", "almocei", "jantei", "pequeno-almoço",
    "refeição", "almoço", "jantar", "café", "snack", "lanche", "bebi",
  ];
  return words.some((w) => text.toLowerCase().includes(w)); // true se alguma palavra existir no texto
}

// envia o texto ao servidor para extrair as macros e guarda no diário
async function parseAndSaveFood(text) {
  const controller = new AbortController(); // permite cancelar o fetch se demorar demasiado
  const timeoutId = setTimeout(() => controller.abort(), IA_TIMEOUT_MS); // aborta ao fim de 20s

  try {
    const res = await fetch("/nutrition/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, user_id: currentUser?.id || 1 }), // envia o texto e o id do utilizador
      signal: controller.signal, // liga o abort controller ao fetch
    });
    clearTimeout(timeoutId); // cancelar o timeout — a resposta chegou a tempo

    if (res.status === 503) {
      // 503 = ia indisponível (chave inválida, limite atingido, etc.)
      const { error } = await res.json().catch(() => ({}));
      addMessage("bot", error || "⚠️ Não consegui registar a refeição (IA indisponível).");
      return false; // false = para o fluxo no sendMessage (não envia ao chat)
    }

    if (res.status === 400) {
      // 400 = alimento rejeitado pela ia (ex: "pedra", "papel")
      const { error, invalid_food } = await res.json().catch(() => ({}));
      if (invalid_food) {
        addMessage("bot", `⚠️ Não posso registar isso no diário: ${error}`);
        return false; // false = para o fluxo — alimento inválido não vai ao chat
      }
      return true; // 400 sem invalid_food = erro de validação normal, continua
    }

    if (!res.ok) return true; // outro erro inesperado — continua para o chat na mesma

    const { entry } = await res.json();
    if (entry) addDiaryItem(entry); // adiciona a refeição ao diário visual
    return true; // true = continua para enviar a mensagem ao chat
  } catch (err) {
    clearTimeout(timeoutId); // limpa o timeout mesmo em caso de erro
    if (err.name === "AbortError") {
      // o fetch foi cancelado pelo AbortController (timeout de 20s)
      addMessage("bot", "⏱️ Não consegui registar a refeição no diário (IA demasiado lenta).");
    }
    return true; // mesmo com timeout, continua para o chat
  }
}
