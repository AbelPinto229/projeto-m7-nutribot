import { getAllFoodEntries, deleteFoodEntry, deleteAllFoodEntries, getLastFoodEntry, saveFoodEntry } from './db.js';
import { parseNutritionFromText } from './nutriParser.js';

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

    case 'replace_food_entry': {
      // substitui uma refeição (procurada pelo nome) por outra nova
      // a ia descreve o novo conteúdo em texto livre — recalculamos macros
      const entries = await getAllFoodEntries(userId);
      const nomeProcurado = (args.nome || '').toLowerCase();
      const found = entries.find(e =>
        e.alimento.toLowerCase().includes(nomeProcurado) ||
        nomeProcurado.includes(e.alimento.toLowerCase())
      );
      if (!found) {
        return { success: false, error: `Não encontrei "${args.nome}" no diário.` };
      }

      try {
        // pede à ia para extrair as macros do novo alimento
        // se for inválido (ex: "tubarão"), lança INVALID_FOOD e nada é alterado
        const novo = await parseNutritionFromText(args.novo_texto || '');
        // só depois de ter os dados novos é que apagamos a refeição antiga
        await deleteFoodEntry(found.id);
        const result = await saveFoodEntry(
          userId,
          novo.alimento,
          novo.kcal,
          novo.proteina,
          novo.carboidratos,
          novo.gordura
        );
        novo.id = result.lastID;
        return {
          success: true,
          action: 'replace_one',
          old_id: found.id,
          old_alimento: found.alimento,
          new_entry: novo,
        };
      } catch (err) {
        if (err.code === 'INVALID_FOOD') {
          return { success: false, error: `"${args.novo_texto}" não é um alimento válido — não alterei nada.` };
        }
        throw err;
      }
    }

    default:
      // segurança: se a ia inventar um nome de função
      return { success: false, error: `Função desconhecida: ${toolName}` };
  }
}

export { executeTool };
