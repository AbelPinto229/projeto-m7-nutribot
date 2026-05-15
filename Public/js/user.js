let currentUser = null;

const savedUserId = localStorage.getItem("nutribot_user_id");
if (savedUserId) {
  fetch(`/users/${savedUserId}`)
    .then((r) => r.json())
    .then(({ user }) => {
      if (user) {
        currentUser = user;
        document.getElementById("modalOverlay").classList.add("hidden");
        document.getElementById("userBadge").textContent = user.nome;
        loadChatHistory();
        loadDiary();
      }
    })
    .catch(() => {});
}

document.getElementById("btnGuardarUser").addEventListener("click", async () => {
  const nome = document.getElementById("inputNome").value.trim();
  const idade = parseInt(document.getElementById("inputIdade").value);
  const peso = parseFloat(document.getElementById("inputPeso").value);
  const altura = parseFloat(document.getElementById("inputAltura").value);
  const objetivo = document.getElementById("inputObjetivo").value;

  if (!nome || !idade || !peso || !altura || !objetivo) {
    alert("Preenche todos os campos.");
    return;
  }

  try {
    const res = await fetch("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, idade, peso, altura, objetivo }),
    });
    const { user } = await res.json();
    currentUser = user;
    localStorage.setItem("nutribot_user_id", user.id);
    document.getElementById("modalOverlay").classList.add("hidden");
    document.getElementById("userBadge").textContent = user.nome;
    loadDiary();
  } catch (err) {
    alert("Erro ao guardar. Tenta novamente.");
  }
});
