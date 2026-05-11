import sqlite3 from 'sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// caminho absoluto da pasta deste ficheiro (substitui o __dirname dos esm)
const __dirname = dirname(fileURLToPath(import.meta.url));
// localização do ficheiro sqlite no disco
const databasePath = join(__dirname, 'nutribot.db');
// ativa modo verbose para mensagens de erro mais detalhadas
const sqlite = sqlite3.verbose();
// abre (ou cria) a base de dados
const db = new sqlite.Database(databasePath, (err) => {
  if (err) {
    console.error('erro ao abrir a base de dados:', err);
  }
});

// garante a criação das tabelas em série (uma a seguir à outra)
db.serialize(() => {
  // wal melhora concorrência entre leituras e escritas
  db.run('PRAGMA journal_mode = WAL');
  // tabela de utilizadores (perfil para personalizar o bot)
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      idade INTEGER NOT NULL,
      peso REAL NOT NULL,
      altura REAL NOT NULL,
      objetivo TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  );
  // tabela do diário alimentar (refeições registadas)
  db.run(
    `CREATE TABLE IF NOT EXISTS food_diary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      alimento TEXT NOT NULL,
      kcal INTEGER NOT NULL,
      proteina TEXT NOT NULL,
      carboidratos TEXT NOT NULL,
      gordura TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  );
  // histórico de conversa (para dar contexto à ia)
  db.run(
    `CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_message TEXT NOT NULL,
      ai_response TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  );
});

// wrapper de db.run em promessa (insert/update/delete)
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      // lastid = id do registo inserido, changes = nº de linhas afetadas
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// wrapper de db.all em promessa (devolve várias linhas)
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// wrapper de db.get em promessa (devolve uma linha ou undefined)
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// insere um novo utilizador e devolve o id gerado
async function saveUser(nome, idade, peso, altura, objetivo) {
  const createdAt = new Date().toISOString();
  return run(
    `INSERT INTO users (nome, idade, peso, altura, objetivo, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [nome, idade, peso, altura, objetivo, createdAt]
  );
}

// vai buscar o utilizador pelo id
async function getUser(id) {
  return get(`SELECT * FROM users WHERE id = ?`, [id]);
}

// regista uma refeição no diário do utilizador
async function saveFoodEntry(userId, alimento, kcal, proteina, carboidratos, gordura) {
  const createdAt = new Date().toISOString();
  return run(
    `INSERT INTO food_diary (user_id, alimento, kcal, proteina, carboidratos, gordura, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, alimento, kcal, proteina, carboidratos, gordura, createdAt]
  );
}

// devolve todas as refeições do user, das mais recentes para as mais antigas
async function getAllFoodEntries(userId) {
  return all(`SELECT * FROM food_diary WHERE user_id = ? ORDER BY id DESC`, [userId]);
}

// apaga uma refeição pelo id
async function deleteFoodEntry(id) {
  return run(`DELETE FROM food_diary WHERE id = ?`, [id]);
}

// guarda um par (mensagem do user + resposta da ia) no histórico
async function saveChatMessage(userId, userMessage, aiResponse) {
  const createdAt = new Date().toISOString();
  return run(
    `INSERT INTO chat_history (user_id, user_message, ai_response, created_at) VALUES (?, ?, ?, ?)`,
    [userId, userMessage, aiResponse, createdAt]
  );
}

// vai buscar as últimas n mensagens (e inverte para ficar por ordem cronológica)
async function getRecentChatHistory(userId, limit = 5) {
  const rows = await all(
    `SELECT user_message, ai_response FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    [userId, limit]
  );
  return rows.reverse();
}

// apaga todas as refeições de um utilizador (usado pela tool delete_all)
async function deleteAllFoodEntries(userId) {
  return run(`DELETE FROM food_diary WHERE user_id = ?`, [userId]);
}

// devolve a refeição mais recente (usado pela tool delete_last)
async function getLastFoodEntry(userId) {
  return get(`SELECT * FROM food_diary WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [userId]);
}

export { db, saveUser, getUser, saveFoodEntry, getAllFoodEntries, deleteFoodEntry, saveChatMessage, getRecentChatHistory, deleteAllFoodEntries, getLastFoodEntry };
