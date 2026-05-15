// referências aos elementos do dom usados ao longo do ficheiro
const messagesEl = document.getElementById("messages");  // contentor de todas as mensagens
const userInput  = document.getElementById("userInput"); // campo de texto onde o utilizador escreve
const sendBtn    = document.getElementById("sendBtn");   // botão de enviar

// envia a mensagem ao premir enter (sem shift) — shift+enter faz nova linha
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // impede o enter de adicionar uma linha em branco
    sendMessage();
  }
});
sendBtn.addEventListener("click", sendMessage); // o botão também chama sendMessage

// cria e adiciona uma bolha de mensagem ao chat
function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`; // "msg user" ou "msg bot" — o css posiciona à direita ou esquerda

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? currentUser?.nome?.[0] || "U" : "🥗";
  // avatar do utilizador = primeira letra do nome (ex: "A") — avatar do bot = emoji

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = renderTexto(text); // converte newlines em <br> e remove markdown

  msg.appendChild(avatar);                         // adiciona o avatar ao contentor
  msg.appendChild(bubble);                         // adiciona a bolha ao contentor
  messagesEl.appendChild(msg);                     // adiciona a mensagem ao chat
  messagesEl.scrollTop = messagesEl.scrollHeight;  // faz scroll automático para o fundo
  return bubble;                                   // devolve a bolha para poder ser atualizada depois
}

// carrega e repõe as últimas mensagens do histórico ao abrir a app
async function loadChatHistory() {
  if (!currentUser) return; // só carrega se houver utilizador logado
  try {
    const res = await fetch(`/chat/history?user_id=${currentUser.id}`); // GET /chat/history
    const { history } = await res.json();
    if (!history || history.length === 0) return; // se não há histórico, não faz nada

    const divider = document.createElement("div");
    divider.className = "history-divider";
    divider.textContent = "— últimas mensagens —"; // separador visual entre histórico e mensagens novas
    messagesEl.appendChild(divider);

    history.forEach((row) => {
      addMessage("user", row.user_message); // repõe a mensagem do utilizador
      const clean = row.ai_response.replace(/^MOOD:(happy|ok|stressed|angry)\n\n?/, ""); // remove o prefixo mood:
      addMessage("bot", clean); // repõe a resposta da ia sem o prefixo
    });

    messagesEl.scrollTop = messagesEl.scrollHeight; // scroll para o fundo após carregar o histórico
  } catch (_) {} // se falhar a ligação, não bloqueia — o chat arranca vazio
}

// processa e envia a mensagem do utilizador ao servidor
async function sendMessage() {
  const text = userInput.value.trim(); // lê o texto e remove espaços em branco
  if (!text) return;                   // se o campo estiver vazio, não faz nada

  userInput.value = "";      // limpa o campo de texto
  sendBtn.disabled = true;   // desativa o botão para evitar envios duplicados
  addMessage("user", text);  // mostra a mensagem do utilizador no chat imediatamente

  if (looksLikeFood(text)) {
    // se o texto parece descrever comida, tenta registar no diário antes de enviar ao chat
    const valid = await parseAndSaveFood(text);
    if (valid === false) {
      sendBtn.disabled = false; // reativa o botão
      return; // para aqui — alimento inválido ou ia indisponível, não envia ao chat
    }
  }

  const bubble = addMessage("bot", "⏳ A pensar..."); // bolha temporária enquanto aguarda a ia

  try {
    const userId = currentUser?.id || "";
    const res = await fetch(`/chat?message=${encodeURIComponent(text)}&user_id=${userId}`);
    // encodeURIComponent garante que acentos e espaços não corrompem o url

    if (!res.ok) {
      // erro de servidor (4xx ou 5xx)
      bubble.textContent = "Erro ao contactar o servidor.";
      bubble.classList.add("bubble-error"); // classe css para mostrar erro a vermelho
      sendBtn.disabled = false;
      return;
    }

    const { text: resposta, mood, tool_actions } = await res.json();
    // "text: resposta" renomeia o campo "text" para não colidir com a variável local "text"

    if (mood) applyMood(mood); // se a ia devolveu um mood, muda o tema visual

    if (tool_actions?.length) {
      // a ia executou tool calls (apagar/substituir refeições) — atualiza o dom
      for (const action of tool_actions) {

        if (action.action === "delete_all") {
          // remove todos os itens do diário e mostra a mensagem "sem refeições"
          document.querySelectorAll(".diary-item").forEach((el) => el.remove());
          const empty = document.createElement("div");
          empty.className = "empty-diary";
          empty.innerHTML = "Ainda sem refeições.<br/>Descreve o que comeste!";
          document.getElementById("diaryList").appendChild(empty);
          refreshTotal(); // atualiza o total (fica 0 kcal)

        } else if (action.action === "delete_one") {
          // remove um item específico pelo data-id
          let itemEl = document.querySelector(`.diary-item[data-id="${action.id}"]`);

          if (!itemEl && action.deleted?.alimento) {
            // fallback: se não encontrou pelo id, tenta pelo nome do alimento
            const name = action.deleted.alimento.toLowerCase();
            document.querySelectorAll(".diary-item").forEach((el) => {
              const elName = el.querySelector(".diary-item-name")?.textContent?.toLowerCase();
              if (elName && (elName.includes(name) || name.includes(elName))) itemEl = el;
            });
          }
          if (itemEl) { itemEl.remove(); refreshTotal(); } // remove e atualiza o total

        } else if (action.action === "replace_one") {
          // remove o item antigo e adiciona o novo
          const oldEl = document.querySelector(`.diary-item[data-id="${action.old_id}"]`);
          if (oldEl) oldEl.remove();                   // remove a refeição antiga
          if (action.new_entry) addDiaryItem(action.new_entry); // adiciona a nova
          refreshTotal();
        }
      }
    }

    bubble.innerHTML = renderTexto(resposta);        // substitui "⏳ a pensar..." pela resposta real
    messagesEl.scrollTop = messagesEl.scrollHeight;  // scroll para o fundo

  } catch (err) {
    // erro de rede ou exceção inesperada
    bubble.textContent = "Erro ao contactar o servidor.";
    bubble.classList.add("bubble-error");
  }

  sendBtn.disabled = false; // reativa o botão no fim (sucesso ou erro)
}
