import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { saveUser, getUser, saveFoodEntry, getAllFoodEntries, deleteFoodEntry, saveChatMessage, getRecentChatHistory } from './db.js';
import { chatStream, extractIncrementalText } from './geminiClient.js';
import { parseNutritionFromText } from './nutriParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

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

// Obter últimas 5 mensagens do chat
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

// Streaming chat com contexto persistente
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
    const stream = await chatStream(message, history, user);
    let aiResponse = '';

    for await (const chunk of stream) {
      const textChunk = extractIncrementalText(chunk);
      if (!textChunk) continue;
      aiResponse += textChunk;
      res.write(`data: ${JSON.stringify(textChunk)}\n\n`);
    }

    if (userId) await saveChatMessage(userId, message, aiResponse);
    res.write('event: done\ndata: [DONE]\n\n');
  } catch (error) {
    console.error('Erro no streaming:', error);
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
    await saveFoodEntry(user_id || 1, entry.alimento, entry.kcal, entry.proteina, entry.carboidratos, entry.gordura);
    res.json({ entry });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// Obter diário do utilizador
app.get('/nutrition/diary', async (req, res) => {
  const userId = req.query.user_id ? parseInt(req.query.user_id) : 1;
  try {
    const entries = await getAllFoodEntries(userId);
    res.json({ entries });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// Apagar entrada do diário
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