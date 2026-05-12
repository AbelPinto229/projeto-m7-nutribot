import { getAllFoodEntries, deleteFoodEntry, deleteAllFoodEntries, getLastFoodEntry } from './db.js';

// ── executar tool call no backend ─────────────────────────────────────────────
// a ia decide qual tool chamar, mas a execução real é cá (segurança + acesso à bd)
async function executeTool(toolName, args, userId) {
  switch (toolName) {

    case 'delete_food_entry': {
      // procura por nome (match parcial em qualquer um dos sentidos)
      const entries = await getAllFoodEntries(userId);
      const nomeProcurado = (args.nome || '').toLowerCase();
      const found = entries.find(e =>
        e.alimento.toLowerCase().includes(nomeProcurado) ||
        nomeProcurado.includes(e.alimento.toLowerCase())
      );
      if (found) {
        await deleteFoodEntry(found.id);
        // devolve o id para o frontend remover o elemento do dom
        return { success: true, deleted: found, action: 'delete_one', id: found.id };
      }
      return { success: false, error: `Não encontrei "${args.nome}" no diário.` };
    }

    case 'delete_last_food_entry': {
      // apaga a refeição mais recente
      const last = await getLastFoodEntry(userId);
      if (last) {
        await deleteFoodEntry(last.id);
        return { success: true, deleted: last, action: 'delete_one', id: last.id };
      }
      return { success: false, error: 'Não há refeições no diário.' };
    }

    case 'delete_all_food_entries': {
      // limpa o diário inteiro do user
      await deleteAllFoodEntries(userId);
      return { success: true, action: 'delete_all' };
    }

    default:
      // segurança: se a ia inventar um nome de função
      return { success: false, error: `Função desconhecida: ${toolName}` };
  }
}

export { executeTool };
