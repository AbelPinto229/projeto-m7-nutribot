const messagesEl = document.getElementById("messages");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
sendBtn.addEventListener("click", sendMessage);

function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? currentUser?.nome?.[0] || "U" : "🥗";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = renderTexto(text);

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function addBotStreamBubble() {
  const msg = document.createElement("div");
  msg.className = "msg bot";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "🥗";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const cursor = document.createElement("span");
  cursor.className = "cursor";
  bubble.appendChild(cursor);

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return { bubble, cursor };
}

async function loadChatHistory() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/chat/history?user_id=${currentUser.id}`);
    const { history } = await res.json();
    if (!history || history.length === 0) return;

    const divider = document.createElement("div");
    divider.className = "history-divider";
    divider.textContent = "— últimas mensagens —";
    messagesEl.appendChild(divider);

    history.forEach((row) => {
      addMessage("user", row.user_message);
      const clean = row.ai_response.replace(/^MOOD:(happy|ok|stressed|angry)\n\n?/, "");
      addMessage("bot", clean);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (_) {}
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;
  userInput.value = "";
  sendBtn.disabled = true;
  addMessage("user", text);

  if (looksLikeFood(text)) {
    const valid = await parseAndSaveFood(text);
    if (valid === false) {
      sendBtn.disabled = false;
      return;
    }
  }

  const { bubble, cursor } = addBotStreamBubble();
  let fullResponse = "";
  let pendingEventType = null;

  const controller = new AbortController();
  let timeoutId = setTimeout(() => controller.abort(), IA_TIMEOUT_MS);
  const resetTimeout = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => controller.abort(), IA_TIMEOUT_MS);
  };

  try {
    const userId = currentUser?.id || "";
    const res = await fetch(
      `/chat?message=${encodeURIComponent(text)}&user_id=${userId}`,
      { signal: controller.signal },
    );
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetTimeout();

      const raw = decoder.decode(value, { stream: true });
      const lines = raw.split("\n");

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          pendingEventType = line.slice(7).trim();
          continue;
        }

        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (!data) continue;

          if (pendingEventType === "mood") {
            try { applyMood(JSON.parse(data)); } catch (_) {}
            pendingEventType = null;
            continue;
          }

          if (pendingEventType === "error") {
            try {
              bubble.textContent = JSON.parse(data);
              bubble.classList.add("bubble-error");
            } catch (_) {}
            pendingEventType = null;
            continue;
          }

          if (pendingEventType === "tool_action") {
            try {
              const action = JSON.parse(data);
              if (action.action === "delete_all") {
                document.querySelectorAll(".diary-item").forEach((el) => el.remove());
                const empty = document.createElement("div");
                empty.className = "empty-diary";
                empty.innerHTML = "Ainda sem refeições.<br/>Descreve o que comeste!";
                document.getElementById("diaryList").appendChild(empty);
                refreshTotal();
              } else if (action.action === "delete_one") {
                let itemEl = document.querySelector(`.diary-item[data-id="${action.id}"]`);
                if (!itemEl && action.deleted?.alimento) {
                  const name = action.deleted.alimento.toLowerCase();
                  document.querySelectorAll(".diary-item").forEach((el) => {
                    const elName = el.querySelector(".diary-item-name")?.textContent?.toLowerCase();
                    if (elName && (elName.includes(name) || name.includes(elName))) itemEl = el;
                  });
                }
                if (itemEl) { itemEl.remove(); refreshTotal(); }
              } else if (action.action === "replace_one") {
                const oldEl = document.querySelector(`.diary-item[data-id="${action.old_id}"]`);
                if (oldEl) oldEl.remove();
                if (action.new_entry) addDiaryItem(action.new_entry);
                refreshTotal();
              }
            } catch (_) {}
            pendingEventType = null;
            continue;
          }

          if (data === "[DONE]") { pendingEventType = null; break; }
          pendingEventType = null;

          try {
            const chunk = JSON.parse(data);
            fullResponse += chunk;
            bubble.innerHTML = renderTexto(fullResponse);
            bubble.appendChild(cursor);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          } catch (_) {}
        }
      }
    }

    clearTimeout(timeoutId);
    cursor.remove();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      bubble.textContent = "⏱️ A IA demorou demasiado a responder. Tenta novamente.";
      bubble.classList.add("bubble-error");
    } else {
      bubble.textContent = "Erro ao contactar o servidor.";
    }
    cursor.remove();
  }

  sendBtn.disabled = false;
}
