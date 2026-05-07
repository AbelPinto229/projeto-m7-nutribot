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
    `CREATE TABLE IF NOT EXISTS food_diary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alimento TEXT NOT NULL,
      kcal INTEGER NOT NULL,
      proteina TEXT NOT NULL,
      carboidratos TEXT NOT NULL,
      gordura TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  );
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

async function saveFoodEntry(alimento, kcal, proteina, carboidratos, gordura) {
  const createdAt = new Date().toISOString();
  return run(
    `INSERT INTO food_diary (alimento, kcal, proteina, carboidratos, gordura, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [alimento, kcal, proteina, carboidratos, gordura, createdAt]
  );
}

async function getAllFoodEntries() {
  return all(`SELECT * FROM food_diary ORDER BY id DESC`);
}

async function deleteFoodEntry(id) {
  return run(`DELETE FROM food_diary WHERE id = ?`, [id]);
}

export { db, saveFoodEntry, getAllFoodEntries, deleteFoodEntry };