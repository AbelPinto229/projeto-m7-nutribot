function looksLikeFood(text) {
  const words = [
    "comi", "comer", "almocei", "jantei", "pequeno-almoço",
    "refeição", "almoço", "jantar", "café", "snack", "lanche", "bebi",
  ];
  return words.some((w) => text.toLowerCase().includes(w));
}

async function parseAndSaveFood(text) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IA_TIMEOUT_MS);

  try {
    const res = await fetch("/nutrition/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, user_id: currentUser?.id || 1 }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 503) {
      const { error } = await res.json().catch(() => ({}));
      addMessage("bot", error || "⚠️ Não consegui registar a refeição (IA indisponível).");
      return false;
    }
    if (res.status === 400) {
      const { error, invalid_food } = await res.json().catch(() => ({}));
      if (invalid_food) {
        addMessage("bot", `⚠️ Não posso registar isso no diário: ${error}`);
        return false;
      }
      return true;
    }
    if (!res.ok) return true;
    const { entry } = await res.json();
    if (entry) addDiaryItem(entry);
    return true;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      addMessage("bot", "⏱️ Não consegui registar a refeição no diário (IA demasiado lenta).");
    }
    return true;
  }
}
