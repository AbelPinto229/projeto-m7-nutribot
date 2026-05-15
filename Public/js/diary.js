function addDiaryItem(entry) {
  const emptyEl = document.querySelector(".empty-diary");
  if (emptyEl) emptyEl.remove();

  const item = document.createElement("div");
  item.className = "diary-item";
  if (entry.id) item.dataset.id = entry.id;

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

  item.querySelector(".btn-delete").addEventListener("click", () => {
    if (entry.id) deleteEntry(entry.id, item);
    else { item.remove(); refreshTotal(); }
  });

  document.getElementById("diaryList").prepend(item);
  refreshTotal();
}

async function deleteEntry(id, itemEl) {
  try {
    await fetch(`/nutrition/diary/${id}`, { method: "DELETE" });
    itemEl.remove();
    refreshTotal();
  } catch (_) {}
}

function refreshTotal() {
  let total = 0;
  document.querySelectorAll(".diary-item-kcal").forEach((el) => {
    const val = parseInt(el.textContent);
    if (!isNaN(val)) total += val;
  });
  document.getElementById("totalKcal").textContent = `${total} kcal`;
}

async function loadDiary() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/nutrition/diary?user_id=${currentUser.id}`);
    const { entries } = await res.json();
    if (entries && entries.length > 0) entries.forEach((e) => addDiaryItem(e));
  } catch (_) {}
}
