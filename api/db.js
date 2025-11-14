const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'rocket_trainer.db');
const db = new Database(dbPath);

db.prepare(
  `CREATE TABLE IF NOT EXISTS mmr_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    playlist TEXT NOT NULL,
    mmr INTEGER NOT NULL,
    games_played_diff INTEGER NOT NULL,
    source TEXT NOT NULL
  );`
).run();

db.prepare(
  `CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    tags TEXT,
    notes TEXT
  );`
).run();

db.prepare(
  `CREATE TABLE IF NOT EXISTS presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );`
).run();

db.prepare(
  `CREATE TABLE IF NOT EXISTS preset_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    preset_id INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    skill_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    notes TEXT,
    FOREIGN KEY (preset_id) REFERENCES presets (id),
    FOREIGN KEY (skill_id) REFERENCES skills (id)
  );`
).run();

const selectSkillsStmt = db.prepare(
  'SELECT id, name, category, tags, notes FROM skills ORDER BY id ASC;'
);
const selectSkillByIdStmt = db.prepare(
  'SELECT id, name, category, tags, notes FROM skills WHERE id = ?;'
);
const insertSkillStmt = db.prepare(
  'INSERT INTO skills (name, category, tags, notes) VALUES (?, ?, ?, ?);'
);
const updateSkillStmt = db.prepare(
  'UPDATE skills SET name = ?, category = ?, tags = ?, notes = ? WHERE id = ?;'
);
const clearSkillsStmt = db.prepare('DELETE FROM skills;');

const insertStmt = db.prepare(
  'INSERT INTO mmr_logs (timestamp, playlist, mmr, games_played_diff, source) VALUES (?, ?, ?, ?, ?);'
);
const selectStmt = db.prepare(
  'SELECT id, timestamp, playlist, mmr, games_played_diff AS gamesPlayedDiff, source FROM mmr_logs ORDER BY id ASC;'
);
const clearStmt = db.prepare('DELETE FROM mmr_logs;');

function saveMmrLog({ timestamp, playlist, mmr, gamesPlayedDiff, source = 'bakkes' }) {
  insertStmt.run(timestamp, playlist, mmr, gamesPlayedDiff, source || 'bakkes');
}

function getAllMmrLogs() {
  return selectStmt.all();
}

function clearMmrLogs() {
  clearStmt.run();
}

function getAllSkills() {
  return selectSkillsStmt.all();
}

function upsertSkill({ id, name, category = null, tags = null, notes = null }) {
  if (!name) {
    throw new Error('name is required');
  }

  if (id) {
    updateSkillStmt.run(name, category, tags, notes, id);
    return selectSkillByIdStmt.get(id);
  }

  const info = insertSkillStmt.run(name, category, tags, notes);
  return selectSkillByIdStmt.get(info.lastInsertRowid);
}

function clearSkills() {
  clearSkillsStmt.run();
}

module.exports = {
  saveMmrLog,
  getAllMmrLogs,
  clearMmrLogs,
  getAllSkills,
  upsertSkill,
  clearSkills,
};