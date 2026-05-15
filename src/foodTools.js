import { getAllFoodEntries, deleteFoodEntry, deleteAllFoodEntries, getLastFoodEntry, saveFoodEntry } from './db.js';
// funções de acesso à bd — listar, apagar, apagar tudo, última refeição, guardar

import { parseNutritionFromText } from './nutriParser.js';
// usado no replace para extrair macros do novo alimento antes de guardar

// a ia decide qual tool chamar — este ficheiro executa a operação real na bd
async function executeTool(toolName, args, userId) {
  // toolName = nome da função que a ia pediu (ex: 'delete_food_entry')
  // args = argumentos que a ia passou (ex: { nome: 'ovos' })
  // userId = id do utilizador — garante que só se mexe nos dados dele

  switch (toolName) {

    case 'delete_food_entry': {
      // apaga uma refeição pelo nome (match parcial, sem distinguir maiúsculas/minúsculas)
      const entries = await getAllFoodEntries(userId); // vai buscar todas as refeições do utilizador
      const nomeProcurado = (args.nome || '').toLowerCase(); // normaliza para minúsculas
      const found = entries.find(e =>
        e.alimento.toLowerCase().includes(nomeProcurado) || // ex: "ovos" encontra "2 ovos mexidos"
        nomeProcurado.includes(e.alimento.toLowerCase())    // ex: "2 ovos mexidos" encontra "ovos"
      );
      if (found) {
        await deleteFoodEntry(found.id); // apaga pelo id (mais seguro que pelo nome)
        return { success: true, deleted: found, action: 'delete_one', id: found.id };
        // action: 'delete_one' → o frontend sabe qual elemento do dom remover
      }
      return { success: false, error: `Não encontrei "${args.nome}" no diário.` };
      // a ia vai informar o utilizador que não encontrou a refeição
    }

    case 'delete_last_food_entry': {
      // apaga a refeição mais recente do diário
      const last = await getLastFoodEntry(userId); // select ... order by id desc limit 1
      if (last) {
        await deleteFoodEntry(last.id);
        return { success: true, deleted: last, action: 'delete_one', id: last.id };
        // mesmo formato que delete_food_entry — o frontend trata igual
      }
      return { success: false, error: 'Não há refeições no diário.' };
    }

    case 'delete_all_food_entries': {
      // limpa todo o diário do utilizador — delete from food_diary where user_id = ?
      await deleteAllFoodEntries(userId);
      return { success: true, action: 'delete_all' };
      // action: 'delete_all' → o frontend remove todos os elementos do diário de uma vez
    }

    case 'replace_food_entry': {
      // substitui uma refeição por outra — encontra a antiga, valida a nova, troca
      const entries = await getAllFoodEntries(userId);
      const nomeProcurado = (args.nome || '').toLowerCase();
      const found = entries.find(e =>
        e.alimento.toLowerCase().includes(nomeProcurado) ||
        nomeProcurado.includes(e.alimento.toLowerCase())
      ); // mesmo match parcial que o delete

      if (!found) {
        return { success: false, error: `Não encontrei "${args.nome}" no diário.` };
        // não encontrou a refeição antiga — não faz nada
      }

      try {
        const novo = await parseNutritionFromText(args.novo_texto || '');
        // pede à ia as macros do novo alimento — se for inválido lança INVALID_FOOD

        await deleteFoodEntry(found.id);
        // só apaga a refeição antiga DEPOIS de confirmar que a nova é válida
        // evita perder a refeição se o novo texto for inválido

        const result = await saveFoodEntry(
          userId,
          novo.alimento,
          novo.kcal,
          novo.proteina,
          novo.carboidratos,
          novo.gordura
        ); // guarda a nova refeição e obtém o id gerado pela bd

        novo.id = result.lastID; // adiciona o id ao objeto para o frontend identificar o novo elemento
        return {
          success: true,
          action: 'replace_one',
          old_id: found.id,          // id do elemento dom a remover
          old_alimento: found.alimento,
          new_entry: novo,           // objeto completo da nova refeição (com id e macros)
        };

      } catch (err) {
        if (err.code === 'INVALID_FOOD') {
          return { success: false, error: `"${args.novo_texto}" não é um alimento válido — não alterei nada.` };
          // informa a ia que o novo alimento foi rejeitado — a ia transmite ao utilizador
        }
        throw err; // outros erros (bd, rede) propagam-se normalmente
      }
    }

    default:
      // segurança: se a ia inventar um nome de função que não existe, não faz nada
      return { success: false, error: `Função desconhecida: ${toolName}` };
  }
}

export { executeTool };
