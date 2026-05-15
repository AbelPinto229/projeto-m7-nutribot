import mysql from 'mysql2/promise';
// mysql2 é o driver node.js para mysql — /promise dá a versão com async/await

import 'dotenv/config';
// carrega as variáveis do ficheiro .env (db_host, db_user, db_password, db_name)

// pool = conjunto de ligações reutilizáveis ao mysql
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost', // endereço do servidor mysql
  user:     process.env.DB_USER     || 'root',      // utilizador mysql
  password: process.env.DB_PASSWORD || '',          // password mysql
  database: process.env.DB_NAME     || 'nutribot',  // nome da base de dados
  waitForConnections: true, // se não houver ligações disponíveis, espera em vez de dar erro
  connectionLimit: 10,      // máximo de 10 ligações simultâneas no pool
});
// em vez de abrir/fechar uma ligação por cada pedido, o pool reutiliza-as (mais eficiente)

// ── criação das tabelas ────────────────────────────────────────────────────────

// cria as tabelas se ainda não existirem — corre uma vez no arranque do servidor
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
  // tabela de utilizadores — id gerado automaticamente pelo mysql (auto_increment)

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
  // tabela do diário alimentar — cada linha é uma refeição de um utilizador

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      user_id      INT  NOT NULL,
      user_message TEXT NOT NULL,
      ai_response  TEXT NOT NULL,
      created_at   VARCHAR(50) NOT NULL
    )
  `);
  // tabela do histórico de chat — guarda pares (mensagem, resposta) para contexto da ia
}

initDB().catch(err => console.error('Erro ao inicializar BD:', err));
// chama a função no arranque — se falhar, mostra o erro mas o servidor continua

// ── funções de utilizadores ───────────────────────────────────────────────────

// insere um novo utilizador na bd e devolve o id gerado
async function saveUser(nome, idade, peso, altura, objetivo) {
  const createdAt = new Date().toISOString(); // data atual em formato iso (ex: "2026-05-15t10:30:00.000z")
  const [result] = await pool.execute(
    `INSERT INTO users (nome, idade, peso, altura, objetivo, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [nome, idade, peso, altura, objetivo, createdAt]
    // os ? são substituídos pelos valores — evita sql injection
  );
  return { lastID: result.insertId, changes: result.affectedRows };
  // insertId = id gerado automaticamente pelo mysql para o novo registo
}

// vai buscar um utilizador pelo id — devolve undefined se não existir
async function getUser(id) {
  const [rows] = await pool.execute(`SELECT * FROM users WHERE id = ?`, [id]);
  return rows[0]; // rows é um array — [0] devolve o primeiro resultado ou undefined
}

// ── funções do diário alimentar ───────────────────────────────────────────────

// regista uma refeição no diário do utilizador e devolve o id gerado
async function saveFoodEntry(userId, alimento, kcal, proteina, carboidratos, gordura) {
  const createdAt = new Date().toISOString();
  const [result] = await pool.execute(
    `INSERT INTO food_diary (user_id, alimento, kcal, proteina, carboidratos, gordura, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, alimento, kcal, proteina, carboidratos, gordura, createdAt]
  );
  return { lastID: result.insertId, changes: result.affectedRows };
}

// devolve todas as refeições do utilizador, das mais recentes para as mais antigas
async function getAllFoodEntries(userId) {
  const [rows] = await pool.execute(
    `SELECT * FROM food_diary WHERE user_id = ? ORDER BY id DESC`,
    // order by id desc = mais recentes primeiro
    [userId]
  );
  return rows; // array com todas as refeições do utilizador
}

// apaga uma refeição pelo id
async function deleteFoodEntry(id) {
  const [result] = await pool.execute(`DELETE FROM food_diary WHERE id = ?`, [id]);
  return { lastID: null, changes: result.affectedRows };
}

// apaga todas as refeições de um utilizador — usado pela tool delete_all_food_entries
async function deleteAllFoodEntries(userId) {
  const [result] = await pool.execute(`DELETE FROM food_diary WHERE user_id = ?`, [userId]);
  // apaga todas as refeições do utilizador de uma vez
  return { lastID: null, changes: result.affectedRows };
}

// devolve a refeição mais recente — usado pela tool delete_last_food_entry
async function getLastFoodEntry(userId) {
  const [rows] = await pool.execute(
    `SELECT * FROM food_diary WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    // limit 1 = só o registo mais recente
    [userId]
  );
  return rows[0]; // a refeição mais recente, ou undefined se o diário estiver vazio
}

// ── funções do histórico de chat ──────────────────────────────────────────────

// guarda um par (mensagem do utilizador + resposta da ia) no histórico
async function saveChatMessage(userId, userMessage, aiResponse) {
  const createdAt = new Date().toISOString();
  const [result] = await pool.execute(
    `INSERT INTO chat_history (user_id, user_message, ai_response, created_at) VALUES (?, ?, ?, ?)`,
    [userId, userMessage, aiResponse, createdAt]
  );
  return { lastID: result.insertId, changes: result.affectedRows };
}

// vai buscar as últimas n mensagens e devolve-as por ordem cronológica
async function getRecentChatHistory(userId, limit = 5) {
  const [rows] = await pool.execute(
    `SELECT user_message, ai_response FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT ${parseInt(limit)}`,
    // limit está embutido diretamente (não como ?) porque o mysql2 não aceita limit como parâmetro preparado
    // parseint() garante que é sempre um número inteiro — segurança contra injeção
    [userId]
  );
  return rows.reverse();
  // reverse() porque buscámos as mais recentes primeiro (desc)
  // mas queremos devolver por ordem cronológica (mais antigas primeiro) para contexto da ia
}

export { saveUser, getUser, saveFoodEntry, getAllFoodEntries, deleteFoodEntry, saveChatMessage, getRecentChatHistory, deleteAllFoodEntries, getLastFoodEntry };
