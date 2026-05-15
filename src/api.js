import express from 'express';
// framework para criar servidores http em node.js

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
// utilitários para construir caminhos de ficheiros (necessário em es modules)

import 'dotenv/config';
// carrega as variáveis do .env (groq_api_key, db_host, db_user, etc.)

import { saveUser, getUser, saveFoodEntry, getAllFoodEntries, deleteFoodEntry, getRecentChatHistory } from './db.js';
// funções de acesso à base de dados

import { parseNutritionFromText } from './nutriParser.js';
// extrai as macros de um texto usando a ia

import { handleChatMessage } from './chatService.js';
// orquestra a conversa com a ia (system prompt, histórico, tools)

import { mensagemErroIA } from './errors.js';
// converte erros técnicos em mensagens amigáveis para o utilizador

// aviso no arranque se a chave da ia não estiver configurada
// o servidor arranca na mesma — só as rotas /chat e /nutrition/parse é que falham
if (!process.env.GROQ_API_KEY) {
  console.warn('⚠️  GROQ_API_KEY não definida no .env — /chat e /nutrition/parse vão devolver erro até configurares.');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
// em es modules __dirname não existe automaticamente — temos de o construir

const app = express();        // cria a aplicação express
app.use(express.json());      // permite ler json no body dos pedidos post
app.use(express.static(join(__dirname, '../public')));
// serve os ficheiros estáticos (html, css, js) da pasta public
// quando o browser pede "/" devolve o index.html automaticamente

// ── rotas de utilizadores ──────────────────────────────────────────────────────

app.post('/users', async (req, res) => {
  // cria um novo utilizador — chamado pelo modal inicial quando o utilizador clica "começar"
  const { nome, idade, peso, altura, objetivo } = req.body;
  // extrai os campos do body json enviado pelo browser

  if (!nome || !idade || !peso || !altura || !objetivo) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    // 400 = bad request — faltam campos obrigatórios
  }

  try {
    const result = await saveUser(nome, idade, peso, altura, objetivo);
    // grava o utilizador na bd e devolve { lastID, changes }

    const user = await getUser(result.lastID);
    // vai buscar o utilizador completo (com todos os campos) pelo id gerado

    res.json({ user }); // devolve o utilizador ao browser — o browser guarda o id no localstorage
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

app.get('/users/:id', async (req, res) => {
  // devolve um utilizador pelo id — usado no auto-login ao abrir a app
  try {
    const user = await getUser(req.params.id);
    // req.params.id = o id que vem na url (ex: /users/3 → id = "3")

    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado.' });
    // 404 = not found — o id não existe na bd (pode ter sido apagado)

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// ── histórico de chat ──────────────────────────────────────────────────────────

app.get('/chat/history', async (req, res) => {
  // devolve as últimas 5 mensagens do utilizador — usado no arranque para repor o chat
  const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
  // parseint converte a string "3" para o número 3

  if (!userId) return res.status(400).json({ error: 'user_id é obrigatório.' });

  try {
    const history = await getRecentChatHistory(userId, 5); // últimas 5 mensagens em ordem cronológica
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// ── rota do chat ───────────────────────────────────────────────────────────────

app.get('/chat', async (req, res) => {
  // recebe a mensagem do utilizador e devolve a resposta da ia em json (http normal)
  const message = String(req.query.message || '').trim();
  // req.query.message = o parâmetro "message" da url (ex: /chat?message=comi+ovos)

  const userId = req.query.user_id ? parseInt(req.query.user_id) : null;

  if (!message) {
    return res.status(400).json({ error: 'Campo "message" é obrigatório.' });
  }

  try {
    const result = await handleChatMessage(message, userId);
    // delega toda a lógica ao chatService.js
    // result = { text, mood?, tool_actions? }

    res.json(result); // devolve a resposta ao browser em json
  } catch (error) {
    console.error('Erro no chat:', error);
    res.status(500).json({ error: mensagemErroIA(error) });
    // mensagemErroIA converte erros técnicos em mensagens amigáveis
  }
});

// ── rotas do diário alimentar ──────────────────────────────────────────────────

app.post('/nutrition/parse', async (req, res) => {
  // extrai as macros de um texto e guarda no diário
  // chamado pelo frontend quando o texto parece descrever comida (looksLikeFood)
  const { text, user_id } = req.body;
  if (!text) return res.status(400).json({ error: 'Campo "text" é obrigatório.' });

  try {
    const entry = await parseNutritionFromText(text);
    // chama a ia para extrair { alimento, kcal, proteina, carboidratos, gordura }

    const result = await saveFoodEntry(user_id || 1, entry.alimento, entry.kcal, entry.proteina, entry.carboidratos, entry.gordura);
    // guarda na bd — user_id || 1 como fallback (não devia acontecer com utilizador logado)

    entry.id = result.lastID; // adiciona o id gerado pela bd ao objeto entry
    res.json({ entry });      // devolve a refeição completa (com id) ao browser

  } catch (error) {
    console.error('Erro em /nutrition/parse:', error);

    if (error.code === 'INVALID_FOOD') {
      return res.status(400).json({ error: error.message, invalid_food: true });
      // alimento rejeitado pela ia (ex: "pedra") — 400 com flag invalid_food para o frontend
    }
    if (error.code === 'NO_API_KEY' || error.status >= 400) {
      return res.status(503).json({ error: mensagemErroIA(error), ai_unavailable: true });
      // 503 = service unavailable — ia indisponível (chave inválida, limite atingido, etc.)
    }
    res.status(500).json({ error: error.message || String(error) }); // erro inesperado
  }
});

app.get('/nutrition/diary', async (req, res) => {
  // devolve todas as refeições do utilizador — usado no arranque para repor o diário
  const userId = req.query.user_id ? parseInt(req.query.user_id) : 1;
  try {
    const entries = await getAllFoodEntries(userId); // array ordenado do mais recente para o mais antigo
    res.json({ entries });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

app.delete('/nutrition/diary/:id', async (req, res) => {
  // apaga uma refeição pelo id — chamado pelo botão ✕ em cada item do diário
  try {
    await deleteFoodEntry(req.params.id);
    // req.params.id = id que vem na url (ex: /nutrition/diary/5 → id = "5")
    res.json({ success: true, deleted_id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error.message || error });
  }
});

// ── arranque do servidor ───────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
// usa a porta definida no .env, ou 3000 por defeito

app.listen(PORT, () => {
  console.log(`NutriBot rodando em http://localhost:${PORT}`);
  // mensagem que aparece no terminal quando o servidor arranca com sucesso
});
