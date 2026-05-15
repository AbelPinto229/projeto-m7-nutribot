import mysql from 'mysql2/promise';
import 'dotenv/config';

// pool de ligações ao mysql (reutiliza ligações em vez de abrir uma nova por pedido)
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'nutribot',
  waitForConnections: true,
  connectionLimit: 10,
});

// cria as tabelas se ainda não existirem (corre uma vez no arranque)
async function initDB() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      nome       VARCHAR(255) NOT NULL,
      idade      INT          NOT NULL,
      peso       FLOAT        NOT NULL,
      altura     FLOAT        NOT NULL,
      objetivo   VARCHAR(255) NOT NULL,
      created_at VARCHAR(50)  NOT NULL
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS food_diary (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      user_id       INT         NOT NULL,
      alimento      TEXT        NOT NULL,
      kcal          INT         NOT NULL,
      proteina      VARCHAR(50) NOT NULL,
      carboidratos  VARCHAR(50) NOT NULL,
      gordura       VARCHAR(50) NOT NULL,
      created_at    VARCHAR(50) NOT NULL
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      user_id      INT  NOT NULL,
      user_message TEXT NOT NULL,
      ai_response  TEXT NOT NULL,
      created_at   VARCHAR(50) NOT NULL
    )
  `);
}

initDB().catch(err => console.error('Erro ao inicializar BD:', err));

// insere um novo utilizador e devolve o id gerado
async function saveUser(nome, idade, peso, altura, objetivo) {
  const createdAt = new Date().toISOString();
  const [result] = await pool.execute(
    `INSERT INTO users (nome, idade, peso, altura, objetivo, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [nome, idade, peso, altura, objetivo, createdAt]
  );
  return { lastID: result.insertId, changes: result.affectedRows };
}

// vai buscar o utilizador pelo id
async function getUser(id) {
  const [rows] = await pool.execute(`SELECT * FROM users WHERE id = ?`, [id]);
  return rows[0];
}

// regista uma refeição no diário do utilizador
async function saveFoodEntry(userId, alimento, kcal, proteina, carboidratos, gordura) {
  const createdAt = new Date().toISOString();
  const [result] = await pool.execute(
    `INSERT INTO food_diary (user_id, alimento, kcal, proteina, carboidratos, gordura, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, alimento, kcal, proteina, carboidratos, gordura, createdAt]
  );
  return { lastID: result.insertId, changes: result.affectedRows };
}

// devolve todas as refeições do user, das mais recentes para as mais antigas
async function getAllFoodEntries(userId) {
  const [rows] = await pool.execute(
    `SELECT * FROM food_diary WHERE user_id = ? ORDER BY id DESC`,
    [userId]
  );
  return rows;
}

// apaga uma refeição pelo id
async function deleteFoodEntry(id) {
  const [result] = await pool.execute(`DELETE FROM food_diary WHERE id = ?`, [id]);
  return { lastID: null, changes: result.affectedRows };
}

// guarda um par (mensagem do user + resposta da ia) no histórico
async function saveChatMessage(userId, userMessage, aiResponse) {
  const createdAt = new Date().toISOString();
  const [result] = await pool.execute(
    `INSERT INTO chat_history (user_id, user_message, ai_response, created_at) VALUES (?, ?, ?, ?)`,
    [userId, userMessage, aiResponse, createdAt]
  );
  return { lastID: result.insertId, changes: result.affectedRows };
}

// vai buscar as últimas n mensagens (e inverte para ficar por ordem cronológica)
async function getRecentChatHistory(userId, limit = 5) {
  const [rows] = await pool.execute(
    `SELECT user_message, ai_response FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT ${parseInt(limit)}`,
    [userId]
  );
  return rows.reverse();
}

// apaga todas as refeições de um utilizador (usado pela tool delete_all)
async function deleteAllFoodEntries(userId) {
  const [result] = await pool.execute(`DELETE FROM food_diary WHERE user_id = ?`, [userId]);
  return { lastID: null, changes: result.affectedRows };
}

// devolve a refeição mais recente (usado pela tool delete_last)
async function getLastFoodEntry(userId) {
  const [rows] = await pool.execute(
    `SELECT * FROM food_diary WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  return rows[0];
}

export { saveUser, getUser, saveFoodEntry, getAllFoodEntries, deleteFoodEntry, saveChatMessage, getRecentChatHistory, deleteAllFoodEntries, getLastFoodEntry };
