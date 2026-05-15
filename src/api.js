import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { saveUser, getUser, saveFoodEntry, getAllFoodEntries, deleteFoodEntry, getRecentChatHistory } from './db.js';
import { parseNutritionFromText } from './nutriParser.js';
import { handleChatMessage } from './chatService.js';
import { mensagemErroIA } from './errors.js';

// aviso no arranque se a chave da ia não estiver configurada
// (o servidor arranca na mesma — só as rotas /chat e /nutrition/parse é que falham)
if (!process.env.GROQ_API_KEY) {
  console.warn('⚠️  GROQ_API_KEY não definida no .env — /chat e /nutrition/parse vão devolver erro até configurares.');
}

// caminho da pasta deste ficheiro (para servir os estáticos do public)
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
// permite ler json no body dos pedidos
app.use(express.json());
// serve o frontend (html/css/js) a partir da pasta public
app.use(express.static(join(__dirname, '../public')));

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

// chat principal — recebe a mensagem e devolve a resposta em JSON
app.get('/chat', async (req, res) => {
  const message = String(req.query.message || '').trim();
  const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
  if (!message) {
    return res.status(400).json({ error: 'Campo "message" é obrigatório.' });
  }

  try {
    const result = await handleChatMessage(message, userId);
    res.json(result);
  } catch (error) {
    console.error('Erro no chat:', error);
    res.status(500).json({ error: mensagemErroIA(error) });
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
    console.error('Erro em /nutrition/parse:', error);
    // alimento rejeitado pela ia (ex: "tubarão", "pedra") — 400 e nada é gravado
    if (error.code === 'INVALID_FOOD') {
      return res.status(400).json({ error: error.message, invalid_food: true });
    }
    // se o erro veio da ia, devolve 503 (service unavailable) com mensagem amigável
    // 503 indica ao frontend que a falha é temporária / externa, não bug da app
    if (error.code === 'NO_API_KEY' || error.status >= 400) {
      return res.status(503).json({ error: mensagemErroIA(error), ai_unavailable: true });
    }
    // outros erros (ex: bd) — 500 genérico
    res.status(500).json({ error: error.message || String(error) });
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
