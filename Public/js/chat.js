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

  // bolha temporária enquanto aguarda resposta da ia
  const bubble = addMessage("bot", "⏳ A pensar...");

  try {
    const userId = currentUser?.id || "";
    const res = await fetch(`/chat?message=${encodeURIComponent(text)}&user_id=${userId}`);

    if (!res.ok) {
      bubble.textContent = "Erro ao contactar o servidor.";
      bubble.classList.add("bubble-error");
      sendBtn.disabled = false;
      return;
    }

    const { text: resposta, mood, tool_actions } = await res.json();

    // aplica o mood se vier na resposta (muda o tema visual)
    if (mood) applyMood(mood);

    // atualiza o diário se a ia executou tool calls
    if (tool_actions?.length) {
      for (const action of tool_actions) {
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
      }
    }

    // mostra a resposta final na bolha
    bubble.innerHTML = renderTexto(resposta);
    messagesEl.scrollTop = messagesEl.scrollHeight;

  } catch (err) {
    bubble.textContent = "Erro ao contactar o servidor.";
    bubble.classList.add("bubble-error");
  }

  sendBtn.disabled = false;
}
