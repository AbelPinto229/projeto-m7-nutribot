let currentUser = null; // variável global com o perfil do utilizador — null enquanto não há sessão

// ── auto-login (próximas visitas) ─────────────────────────────────────────────

const savedUserId = localStorage.getItem("nutribot_user_id");
// tenta ler o id guardado no browser (localstorage persiste entre sessões)

if (savedUserId) {
  // se existe um id guardado, tenta fazer login automático
  fetch(`/users/${savedUserId}`)    // GET /users/:id — pede o perfil ao servidor
    .then((r) => r.json())          // converte a resposta em json
    .then(({ user }) => {
      if (user) {
        // o utilizador ainda existe na base de dados
        currentUser = user;                                                  // guarda o perfil na variável global
        document.getElementById("modalOverlay").classList.add("hidden");    // esconde o modal de boas-vindas
        document.getElementById("userBadge").textContent = user.nome;       // mostra o nome no header
        loadChatHistory(); // carrega as últimas mensagens (definido em chat.js)
        loadDiary();       // carrega as refeições do diário (definido em diary.js)
      }
      // se user for null (id inválido ou apagado), o modal continua visível
    })
    .catch(() => {}); // se der erro de rede, o modal aparece normalmente
}

// ── registo de novo utilizador ────────────────────────────────────────────────

document.getElementById("btnGuardarUser").addEventListener("click", async () => {
  // quando o utilizador clica em "Começar →" no modal

  const nome    = document.getElementById("inputNome").value.trim();        // nome do utilizador
  const idade   = parseInt(document.getElementById("inputIdade").value);    // idade em anos (inteiro)
  const peso    = parseFloat(document.getElementById("inputPeso").value);   // peso em kg (decimal)
  const altura  = parseFloat(document.getElementById("inputAltura").value); // altura em cm (decimal)
  const objetivo = document.getElementById("inputObjetivo").value;           // objetivo selecionado no select

  if (!nome || !idade || !peso || !altura || !objetivo) {
    alert("Preenche todos os campos.");
    return; // para aqui se algum campo estiver vazio ou inválido
  }

  try {
    const res = await fetch("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, idade, peso, altura, objetivo }), // envia os dados em json
    });

    const { user } = await res.json(); // o servidor devolve o utilizador com o id gerado pela bd

    currentUser = user; // guarda o perfil na variável global
    localStorage.setItem("nutribot_user_id", user.id); // guarda o id para auto-login nas próximas visitas
    document.getElementById("modalOverlay").classList.add("hidden"); // fecha o modal
    document.getElementById("userBadge").textContent = user.nome;    // mostra o nome no header
    loadDiary(); // carrega o diário (vazio para um utilizador novo)

  } catch (err) {
    alert("Erro ao guardar. Tenta novamente."); // erro de rede ou resposta inválida
  }
});
