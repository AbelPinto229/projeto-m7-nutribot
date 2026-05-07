import sqlite3 from 'sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const databasePath = join(__dirname, 'nutribot.db');
const sqlite = sqlite3.verbose();
const db = new sqlite.Database(databasePath, (err) => {
  if (err) {
    console.error('Erro ao abrir a base de dados:', err);
  }
});

db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
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

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function saveUser(nome, idade, peso, altura, objetivo) {
  const createdAt = new Date().toISOString();
  return run(
    `INSERT INTO users (nome, idade, peso, altura, objetivo, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [nome, idade, peso, altura, objetivo, createdAt]
  );
}

async function getUser(id) {
  return get(`SELECT * FROM users WHERE id = ?`, [id]);
}

async function saveFoodEntry(userId, alimento, kcal, proteina, carboidratos, gordura) {
  const createdAt = new Date().toISOString();
  return run(
    `INSERT INTO food_diary (user_id, alimento, kcal, proteina, carboidratos, gordura, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, alimento, kcal, proteina, carboidratos, gordura, createdAt]
  );
}

async function getAllFoodEntries(userId) {
  return all(`SELECT * FROM food_diary WHERE user_id = ? ORDER BY id DESC`, [userId]);
}

async function deleteFoodEntry(id) {
  return run(`DELETE FROM food_diary WHERE id = ?`, [id]);
}

async function saveChatMessage(userId, userMessage, aiResponse) {
  const createdAt = new Date().toISOString();
  return run(
    `INSERT INTO chat_history (user_id, user_message, ai_response, created_at) VALUES (?, ?, ?, ?)`,
    [userId, userMessage, aiResponse, createdAt]
  );
}

async function getRecentChatHistory(userId, limit = 5) {
  const rows = await all(
    `SELECT user_message, ai_response FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    [userId, limit]
  );
  return rows.reverse();
}

async function deleteAllFoodEntries(userId) {
  return run(`DELETE FROM food_diary WHERE user_id = ?`, [userId]);
}

async function getLastFoodEntry(userId) {
  return get(`SELECT * FROM food_diary WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [userId]);
}

export { db, saveUser, getUser, saveFoodEntry, getAllFoodEntries, deleteFoodEntry, saveChatMessage, getRecentChatHistory };