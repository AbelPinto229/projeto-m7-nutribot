// cria e adiciona um item de refeição ao diário visual
function addDiaryItem(entry) {
  const emptyEl = document.querySelector(".empty-diary"); // verifica se existe a mensagem "sem refeições"
  if (emptyEl) emptyEl.remove();                          // se existir, remove — vamos adicionar uma refeição

  const item = document.createElement("div"); // cria o elemento contentor da refeição
  item.className = "diary-item";               // classe css para estilizar o item
  if (entry.id) item.dataset.id = entry.id;   // guarda o id no atributo data-id — necessário para apagar pelo chat

  // constrói o html interno com o nome, calorias e macros
  item.innerHTML = `
    <div class="diary-item-top">
      <span class="diary-item-name">${entry.alimento}</span>
      <div style="display:flex;gap:0.4rem;align-items:center">
        <span class="diary-item-kcal">${entry.kcal} kcal</span>
        <button class="btn-delete" title="Apagar">✕</button>
      </div>
    </div>
    <div class="diary-item-macros">P: ${entry.proteina} · C: ${entry.carboidratos} · G: ${entry.gordura}</div>
  `;

  // associa o evento de clique ao botão ✕
  item.querySelector(".btn-delete").addEventListener("click", () => {
    if (entry.id) deleteEntry(entry.id, item); // se tem id, apaga na bd e no dom
    else { item.remove(); refreshTotal(); }    // se não tem id (improvável), só remove do dom
  });

  document.getElementById("diaryList").prepend(item); // adiciona no topo (mais recente primeiro)
  refreshTotal();                                       // recalcula o total de kcal
}

// envia pedido de apagar uma refeição ao servidor e remove o elemento do dom
async function deleteEntry(id, itemEl) {
  try {
    await fetch(`/nutrition/diary/${id}`, { method: "DELETE" }); // DELETE /nutrition/diary/:id
    itemEl.remove();   // remove o elemento do dom
    refreshTotal();    // atualiza o total de kcal
  } catch (_) {}       // se falhar a ligação, não faz nada (sem alerta)
}

// soma todas as kcal visíveis no diário e atualiza o contador no topo
function refreshTotal() {
  let total = 0;
  document.querySelectorAll(".diary-item-kcal").forEach((el) => {
    const val = parseInt(el.textContent); // extrai o número do texto "350 kcal"
    if (!isNaN(val)) total += val;        // soma apenas se for um número válido
  });
  document.getElementById("totalKcal").textContent = `${total} kcal`; // atualiza o elemento html
}

// carrega do servidor todas as refeições do utilizador e repõe o diário
async function loadDiary() {
  if (!currentUser) return; // só carrega se houver utilizador — currentUser vem do user.js
  try {
    const res = await fetch(`/nutrition/diary?user_id=${currentUser.id}`); // GET /nutrition/diary
    const { entries } = await res.json();                                    // array de refeições
    if (entries && entries.length > 0) entries.forEach((e) => addDiaryItem(e)); // adiciona cada uma
  } catch (_) {} // se falhar, o diário fica vazio — não bloqueia a app
}
