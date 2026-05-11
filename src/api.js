import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { saveUser, getUser, saveFoodEntry, getAllFoodEntries, deleteFoodEntry, saveChatMessage, getRecentChatHistory, deleteAllFoodEntries, getLastFoodEntry } from './db.js';
import { chatWithTools, generateJson } from './groqClient.js';
import { parseNutritionFromText } from './nutriParser.js';

// caminho da pasta deste ficheiro (para servir os estáticos do public)
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
// permite ler json no body dos pedidos
app.use(express.json());
// serve o frontend (html/css/js) a partir da pasta public
app.use(express.static(join(__dirname, '../public')));

// ── limpar markdown da resposta ───────────────────────────────────────────────
// a ia às vezes mete **negrito** ou # títulos — tiramos antes de mostrar
function limparMarkdown(texto) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, '$1')   // tira **bold**
    .replace(/\*(.*?)\*/g, '$1')       // tira *itálico*
    .replace(/#{1,6}\s/g, '')          // tira # títulos
    .trim();
}

// criar utilizador (chamado pelo modal inicial)
app.post('/users', async (req, res) => {
  const { nome, idade, peso, altura, objetivo } = req.body;
  // validação: todos os campos são obrigatórios
  if (!nome || !idade || !peso || !altura || !objetivo) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }
  try {
    // grava o user e devolve o registo completo (já com id)
    const result = await saveUser(nome, idade, peso, altura, objetivo);
    const user = await getUser(result.lastID);
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// obter utilizador (auto-login via localstorage)
app.get('/users/:id', async (req, res) => {
  try {
    const user = await getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado.' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// obter histórico do chat (últimas 5 mensagens) para repor no ecrã
app.get('/chat/history', async (req, res) => {
  const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
  if (!userId) return res.status(400).json({ error: 'user_id é obrigatório.' });
  try {
    const history = await getRecentChatHistory(userId, 5);
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

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

// ── chat principal ─────────────────────────────────────────────────────────────
// usa server-sent events (sse) para fazer streaming da resposta para o frontend
app.get('/chat', async (req, res) => {
  const message = String(req.query.message || '').trim();
  const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
  if (!message) {
    return res.status(400).json({ error: 'Campo "message" é obrigatório.' });
  }

  // headers obrigatórios para abrir um stream sse
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    // perfil do user + histórico recente para dar contexto à ia
    const user = userId ? await getUser(userId) : null;
    const history = userId ? await getRecentChatHistory(userId, 5) : [];

    // chamada à ia (pode devolver texto OU pedido de tool call)
    const result = await chatWithTools(message, history, user);

    // ── tool call: eliminar refeição ─────────────────────────────────────
    if (result.type === 'tool_call') {
      let confirmText = '';

      for (const tc of result.tool_calls) {
        // executa a função pedida pela ia
        const toolResult = await executeTool(tc.name, tc.args, userId);

        // notifica o frontend para atualizar o dom (remover item do diário)
        res.write(`event: tool_action\ndata: ${JSON.stringify(toolResult)}\n\n`);

        // monta a mensagem de confirmação a mostrar no chat
        if (!toolResult.success) {
          confirmText = toolResult.error;
        } else if (toolResult.action === 'delete_all') {
          confirmText = 'Eliminei todas as refeições do teu diário de hoje.';
        } else if (toolResult.action === 'delete_one') {
          confirmText = `Eliminei "${toolResult.deleted.alimento}" do teu diário.`;
        }
      }

      // envia a confirmação como mensagem normal
      res.write(`data: ${JSON.stringify(confirmText)}\n\n`);
      if (userId) await saveChatMessage(userId, message, confirmText);
      // sinal de fim do stream
      res.write('event: done\ndata: [DONE]\n\n');
      return;
    }

    // ── resposta normal: extrai mood e envia ─────────────────────────────
    const fullText = result.text;
    const lines = fullText.split('\n');
    const firstLine = lines[0].trim();
    // a primeira linha deve estar no formato "MOOD:happy" (ou ok/stressed/angry)
    const moodMatch = firstLine.match(/^MOOD:(happy|ok|stressed|angry)$/);

    if (moodMatch) {
      // envia o mood como evento separado (o frontend muda o tema visual)
      res.write(`event: mood\ndata: ${JSON.stringify(moodMatch[1])}\n\n`);
      // envia o resto do texto (sem a linha do mood) já sem markdown
      const rest = limparMarkdown(lines.slice(1).join('\n').trimStart());
      if (rest) res.write(`data: ${JSON.stringify(rest)}\n\n`);
    } else {
      // se não tiver mood, manda o texto todo
      res.write(`data: ${JSON.stringify(limparMarkdown(fullText))}\n\n`);
    }

    // persiste a conversa para reaparecer numa próxima sessão
    if (userId) await saveChatMessage(userId, message, fullText);
    res.write('event: done\ndata: [DONE]\n\n');

  } catch (error) {
    console.error('Erro no chat:', error);
    // avisa o frontend que algo correu mal
    res.write(`event: error\ndata: ${JSON.stringify(error.message || 'Erro interno')}\n\n`);
  } finally {
    // fecha sempre o stream no fim
    res.end();
  }
});

// extrair macros e guardar no diário
// chamado pelo frontend quando o texto parece descrever comida
app.post('/nutrition/parse', async (req, res) => {
  const { text, user_id } = req.body;
  if (!text) return res.status(400).json({ error: 'Campo "text" é obrigatório.' });
  try {
    // a ia devolve { alimento, kcal, proteina, carboidratos, gordura }
    const entry = await parseNutritionFromText(text);
    const result = await saveFoodEntry(user_id || 1, entry.alimento, entry.kcal, entry.proteina, entry.carboidratos, entry.gordura);
    // junta o id gerado para o frontend o usar no botão de apagar
    entry.id = result.lastID;
    res.json({ entry });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// obter diário (chamado no arranque para repor as refeições do dia)
app.get('/nutrition/diary', async (req, res) => {
  const userId = req.query.user_id ? parseInt(req.query.user_id) : 1;
  try {
    const entries = await getAllFoodEntries(userId);
    res.json({ entries });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// apagar entrada manual (botão ✕ ao lado de cada item)
app.delete('/nutrition/diary/:id', async (req, res) => {
  try {
    await deleteFoodEntry(req.params.id);
    res.json({ success: true, deleted_id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// arranque do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NutriBot rodando em http://localhost:${PORT}`);
});
