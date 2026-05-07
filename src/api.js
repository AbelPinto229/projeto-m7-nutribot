import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { saveFoodEntry, getAllFoodEntries, deleteFoodEntry } from './db.js';
import { chatStream, extractIncrementalText } from './geminiClient.js';
import { parseNutritionFromText } from './nutriParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

const conversationHistory = [];

// Streaming chat com contexto
app.get('/chat', async (req, res) => {
  const message = String(req.query.message || '').trim();
  if (!message) {
    return res.status(400).json({ error: 'Campo "message" é obrigatório.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = await chatStream(message, conversationHistory.slice(-5));
    let aiResponse = '';

    for await (const chunk of stream) {
      const textChunk = extractIncrementalText(chunk);
      if (!textChunk) continue;
      aiResponse += textChunk;
      res.write(`data: ${JSON.stringify(textChunk)}\n\n`);
    }

    conversationHistory.push({ user_message: message, ai_response: aiResponse });
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
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Campo "text" é obrigatório.' });
  try {
    const entry = await parseNutritionFromText(text);
    await saveFoodEntry(entry.alimento, entry.kcal, entry.proteina, entry.carboidratos, entry.gordura);
    res.json({ entry });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// Obter todo o diário alimentar
app.get('/nutrition/diary', async (req, res) => {
  try {
    const entries = await getAllFoodEntries();
    res.json({ entries });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// Apagar entrada do diário
app.delete('/nutrition/diary/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await deleteFoodEntry(id);
    res.json({ success: true, deleted_id: id });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NutriBot rodando em http://localhost:${PORT}`);
});