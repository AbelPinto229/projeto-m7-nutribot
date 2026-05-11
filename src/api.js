import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { saveUser, getUser, saveFoodEntry, getAllFoodEntries, deleteFoodEntry, saveChatMessage, getRecentChatHistory, deleteAllFoodEntries, getLastFoodEntry } from './db.js';
import { chatWithTools, generateJson } from './groqClient.js';
import { parseNutritionFromText } from './nutriParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

// ── Limpar markdown da resposta ───────────────────────────────────────────────
function limparMarkdown(texto) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .trim();
}

// Criar utilizador
app.post('/users', async (req, res) => {
  const { nome, idade, peso, altura, objetivo } = req.body;
  if (!nome || !idade || !peso || !altura || !objetivo) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }
  try {
    const result = await saveUser(nome, idade, peso, altura, objetivo);
    const user = await getUser(result.lastID);
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// Obter utilizador
app.get('/users/:id', async (req, res) => {
  try {
    const user = await getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado.' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// Obter histórico do chat
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

// ── Executar tool call no backend ─────────────────────────────────────────────
async function executeTool(toolName, args, userId) {
  switch (toolName) {

    case 'delete_food_entry': {
      const entries = await getAllFoodEntries(userId);
      const nomeProcurado = (args.nome || '').toLowerCase();
      const found = entries.find(e =>
        e.alimento.toLowerCase().includes(nomeProcurado) ||
        nomeProcurado.includes(e.alimento.toLowerCase())
      );
      if (found) {
        await deleteFoodEntry(found.id);
        return { success: true, deleted: found, action: 'delete_one', id: found.id };
      }
      return { success: false, error: `Não encontrei "${args.nome}" no diário.` };
    }

    case 'delete_last_food_entry': {
      const last = await getLastFoodEntry(userId);
      if (last) {
        await deleteFoodEntry(last.id);
        return { success: true, deleted: last, action: 'delete_one', id: last.id };
      }
      return { success: false, error: 'Não há refeições no diário.' };
    }

    case 'delete_all_food_entries': {
      await deleteAllFoodEntries(userId);
      return { success: true, action: 'delete_all' };
    }

    default:
      return { success: false, error: `Função desconhecida: ${toolName}` };
  }
}

// ── Chat principal ─────────────────────────────────────────────────────────────
app.get('/chat', async (req, res) => {
  const message = String(req.query.message || '').trim();
  const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
  if (!message) {
    return res.status(400).json({ error: 'Campo "message" é obrigatório.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const user = userId ? await getUser(userId) : null;
    const history = userId ? await getRecentChatHistory(userId, 5) : [];

    const result = await chatWithTools(message, history, user);

    // ── Tool call: eliminar refeição ─────────────────────────────────────
    if (result.type === 'tool_call') {
      let confirmText = '';

      for (const tc of result.tool_calls) {
        const toolResult = await executeTool(tc.name, tc.args, userId);

        // Notifica o frontend para atualizar o DOM
        res.write(`event: tool_action\ndata: ${JSON.stringify(toolResult)}\n\n`);

        if (!toolResult.success) {
          confirmText = toolResult.error;
        } else if (toolResult.action === 'delete_all') {
          confirmText = 'Eliminei todas as refeições do teu diário de hoje.';
        } else if (toolResult.action === 'delete_one') {
          confirmText = `Eliminei "${toolResult.deleted.alimento}" do teu diário.`;
        }
      }

      res.write(`data: ${JSON.stringify(confirmText)}\n\n`);
      if (userId) await saveChatMessage(userId, message, confirmText);
      res.write('event: done\ndata: [DONE]\n\n');
      return;
    }

    // ── Resposta normal: extrai MOOD e envia ─────────────────────────────
    const fullText = result.text;
    const lines = fullText.split('\n');
    const firstLine = lines[0].trim();
    const moodMatch = firstLine.match(/^MOOD:(happy|ok|stressed|angry)$/);

    if (moodMatch) {
      res.write(`event: mood\ndata: ${JSON.stringify(moodMatch[1])}\n\n`);
      const rest = limparMarkdown(lines.slice(1).join('\n').trimStart());
      if (rest) res.write(`data: ${JSON.stringify(rest)}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify(limparMarkdown(fullText))}\n\n`);
    }

    if (userId) await saveChatMessage(userId, message, fullText);
    res.write('event: done\ndata: [DONE]\n\n');

  } catch (error) {
    console.error('Erro no chat:', error);
    res.write(`event: error\ndata: ${JSON.stringify(error.message || 'Erro interno')}\n\n`);
  } finally {
    res.end();
  }
});

// Extrair macros e guardar no diário
app.post('/nutrition/parse', async (req, res) => {
  const { text, user_id } = req.body;
  if (!text) return res.status(400).json({ error: 'Campo "text" é obrigatório.' });
  try {
    const entry = await parseNutritionFromText(text);
    const result = await saveFoodEntry(user_id || 1, entry.alimento, entry.kcal, entry.proteina, entry.carboidratos, entry.gordura);
    entry.id = result.lastID;
    res.json({ entry });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// Obter diário
app.get('/nutrition/diary', async (req, res) => {
  const userId = req.query.user_id ? parseInt(req.query.user_id) : 1;
  try {
    const entries = await getAllFoodEntries(userId);
    res.json({ entries });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// Apagar entrada manual (botão ✕)
app.delete('/nutrition/diary/:id', async (req, res) => {
  try {
    await deleteFoodEntry(req.params.id);
    res.json({ success: true, deleted_id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NutriBot rodando em http://localhost:${PORT}`);
});