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

db.prepare(
  `CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_time TEXT NOT NULL,
    finished_time TEXT,
    source TEXT NOT NULL,
    preset_id INTEGER,
    notes TEXT,
    actual_duration INTEGER DEFAULT 0,
    skill_ids TEXT
  );`
).run();

db.prepare(
  `CREATE TABLE IF NOT EXISTS session_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    block_type TEXT NOT NULL,
    skill_ids TEXT,
    planned_duration INTEGER NOT NULL,
    actual_duration INTEGER NOT NULL,
    notes TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions (id)
  );`
).run();

function ensureColumn(tableName, columnDefinition) {
  const columnName = columnDefinition.split(' ')[0];
  const existingColumns = db
    .prepare(`PRAGMA table_info('${tableName}');`)
    .all()
    .map((column) => column.name);

  if (!existingColumns.includes(columnName)) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition};`).run();
  }
}

ensureColumn('sessions', 'actual_duration INTEGER DEFAULT 0');
ensureColumn('sessions', 'skill_ids TEXT');

const selectPresetsStmt = db.prepare('SELECT id, name FROM presets ORDER BY id ASC;');
const selectPresetByIdStmt = db.prepare('SELECT id, name FROM presets WHERE id = ?;');
const insertPresetStmt = db.prepare('INSERT INTO presets (name) VALUES (?);');
const updatePresetStmt = db.prepare('UPDATE presets SET name = ? WHERE id = ?;');
const deletePresetBlocksStmt = db.prepare('DELETE FROM preset_blocks WHERE preset_id = ?;');
const insertBlockStmt = db.prepare(
  'INSERT INTO preset_blocks (preset_id, order_index, skill_id, type, duration_seconds, notes) VALUES (?, ?, ?, ?, ?, ?);'
);
const selectBlocksStmt = db.prepare(
  'SELECT id, preset_id AS presetId, order_index AS orderIndex, skill_id AS skillId, type, duration_seconds AS durationSeconds, notes FROM preset_blocks WHERE preset_id = ? ORDER BY order_index ASC;'
);
const clearPresetBlocksStmt = db.prepare('DELETE FROM preset_blocks;');
const clearPresetsStmt = db.prepare('DELETE FROM presets;');
const deletePresetStmt = db.prepare('DELETE FROM presets WHERE id = ?;');
const insertSessionStmt = db.prepare(
  'INSERT INTO sessions (started_time, finished_time, source, preset_id, notes, actual_duration, skill_ids) VALUES (?, ?, ?, ?, ?, ?, ?);'
);
const insertSessionBlockStmt = db.prepare(
  'INSERT INTO session_blocks (session_id, block_type, skill_ids, planned_duration, actual_duration, notes) VALUES (?, ?, ?, ?, ?, ?);'
);
const selectSessionBlocksStmt = db.prepare(
  'SELECT id, session_id AS sessionId, block_type AS type, skill_ids AS skillIdsJson, planned_duration AS plannedDuration, actual_duration AS actualDuration, notes FROM session_blocks WHERE session_id = ? ORDER BY id ASC;'
);
const clearSessionBlocksStmt = db.prepare('DELETE FROM session_blocks;');
const clearSessionsStmt = db.prepare('DELETE FROM sessions;');

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
const selectPresetUsageStmt = db.prepare('SELECT COUNT(*) AS count FROM preset_blocks WHERE skill_id = ?;');
const selectSessionBlocksUsageStmt = db.prepare(
  `SELECT COUNT(*) AS count
  FROM session_blocks
  JOIN json_each(session_blocks.skill_ids) AS skill
  WHERE skill.value = ?
    AND session_blocks.skill_ids IS NOT NULL
    AND json_valid(session_blocks.skill_ids)`
);
const selectSessionsUsageStmt = db.prepare(
  `SELECT COUNT(*) AS count
  FROM sessions
  JOIN json_each(sessions.skill_ids) AS skill
  WHERE skill.value = ?
    AND sessions.skill_ids IS NOT NULL
    AND json_valid(sessions.skill_ids)`
);
const deleteSkillStmt = db.prepare('DELETE FROM skills WHERE id = ?;');
const clearSkillsStmt = db.prepare('DELETE FROM skills;');

const insertStmt = db.prepare(
  'INSERT INTO mmr_logs (timestamp, playlist, mmr, games_played_diff, source) VALUES (?, ?, ?, ?, ?);'
);
const selectStmt = db.prepare(
  'SELECT id, timestamp, playlist, mmr, games_played_diff AS gamesPlayedDiff, source FROM mmr_logs ORDER BY timestamp ASC;'
);
const clearStmt = db.prepare('DELETE FROM mmr_logs;');

function saveMmrLog({ timestamp, playlist, mmr, gamesPlayedDiff, source = 'bakkes' }) {
  insertStmt.run(timestamp, playlist, mmr, gamesPlayedDiff, source || 'bakkes');
}

function getAllMmrLogs() {
  return selectStmt.all();
}

function getMmrLogs({ playlist, from, to } = {}) {
  if (!playlist && !from && !to) {
    return getAllMmrLogs();
  }

  const conditions = [];
  const params = [];

  if (playlist) {
    conditions.push('playlist = ?');
    params.push(playlist);
  }

  if (from) {
    conditions.push('timestamp >= ?');
    params.push(from);
  }

  if (to) {
    conditions.push('timestamp <= ?');
    params.push(to);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT
      id,
      timestamp,
      playlist,
      mmr,
      games_played_diff AS gamesPlayedDiff,
      source
    FROM mmr_logs
    ${whereClause}
    ORDER BY timestamp ASC;
  `;

  return db.prepare(query).all(...params);
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

function getSkillReferenceCount(skillId) {
  const presetUsage = selectPresetUsageStmt.get(skillId)?.count ?? 0;
  const sessionBlocksUsage = selectSessionBlocksUsageStmt.get(skillId)?.count ?? 0;
  const sessionUsage = selectSessionsUsageStmt.get(skillId)?.count ?? 0;
  return presetUsage + sessionBlocksUsage + sessionUsage;
}

function deleteSkill(id) {
  if (!id) {
    throw new Error('skill id is required');
  }

  const references = getSkillReferenceCount(id);
  if (references > 0) {
    throw new Error('Skill is referenced by existing presets or sessions');
  }

  deleteSkillStmt.run(id);
}

function clearSkills() {
  clearSkillsStmt.run();
}

function buildPresetResponse(preset) {
  const blocks = selectBlocksStmt.all(preset.id);
  return { ...preset, blocks };
}

function getAllPresets() {
  return selectPresetsStmt.all().map(buildPresetResponse);
}

const savePresetTransaction = db.transaction(({ id, name, blocks }) => {
  const normalizedBlocks = Array.isArray(blocks) ? blocks : [];
  let presetId = id;

  if (presetId) {
    updatePresetStmt.run(name, presetId);
  } else {
    const info = insertPresetStmt.run(name);
    presetId = info.lastInsertRowid;
  }

  deletePresetBlocksStmt.run(presetId);

  for (const block of normalizedBlocks) {
    insertBlockStmt.run(
      presetId,
      block.orderIndex,
      block.skillId,
      block.type,
      block.durationSeconds,
      block.notes || null
    );
  }

  return buildPresetResponse({ id: presetId, name });
});

function savePreset(preset) {
  if (!preset.name) {
    throw new Error('name is required');
  }

  return savePresetTransaction(preset);
}

function deletePreset(id) {
  if (!id) {
    throw new Error('preset id is required');
  }

  const remove = db.transaction((presetId) => {
    deletePresetBlocksStmt.run(presetId);
    deletePresetStmt.run(presetId);
  });

  remove(id);
}

function clearPresetTables() {
  clearPresetBlocksStmt.run();
  clearPresetsStmt.run();
}

function buildSessionResponse(session) {
  const blocks = selectSessionBlocksStmt.all(session.id).map(({ skillIdsJson, ...rest }) => ({
    ...rest,
    skillIds: skillIdsJson ? JSON.parse(skillIdsJson) : [],
  }));

  const { skillIdsJson, ...sessionWithoutSkillIds } = session;
  const skillIds = typeof skillIdsJson === 'string' ? JSON.parse(skillIdsJson) : [];
  const actualDuration = sessionWithoutSkillIds.actualDuration ?? 0;

  return { ...sessionWithoutSkillIds, actualDuration, skillIds, blocks };
}

function getSessions({ start, end } = {}) {
  const conditions = [];
  const params = [];

  if (start) {
    conditions.push('started_time >= ?');
    params.push(start);
  }

  if (end) {
    conditions.push('started_time <= ?');
    params.push(end);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `SELECT id, started_time AS startedTime, finished_time AS finishedTime, source, preset_id AS presetId, notes, actual_duration AS actualDuration, skill_ids AS skillIdsJson FROM sessions ${whereClause} ORDER BY started_time ASC;`;
  const resp = db.prepare(query).all(...params);
  return resp.map(buildSessionResponse);
}

function getSkillDurationSummary({ from, to } = {}) {
  const conditions = ['sb.skill_ids IS NOT NULL', 'json_valid(sb.skill_ids)'];
  const params = [];

  if (from) {
    conditions.push('s.started_time >= ?');
    params.push(from);
  }

  if (to) {
    conditions.push('s.started_time <= ?');
    params.push(to);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const query = `
    SELECT
      k.id AS skillId,
      k.name,
      SUM(sb.actual_duration) AS totalSeconds
    FROM session_blocks sb
    JOIN sessions s ON s.id = sb.session_id
    JOIN json_each(sb.skill_ids) AS block_skill
    JOIN skills k ON k.id = block_skill.value
    ${whereClause}
    GROUP BY k.id, k.name
    ORDER BY totalSeconds DESC;
  `;

  const rows = db.prepare(query).all(...params);
  return rows.map(({ skillId, name, totalSeconds }) => ({
    skillId,
    name,
    minutes: Math.round((totalSeconds || 0) / 60),
  }));
}

const saveSessionTransaction = db.transaction(({ startedTime, finishedTime, source, presetId = null, notes = null, blocks = [] }) => {
  const normalizedBlocks = Array.isArray(blocks)
    ? blocks.map((block) => ({
        ...block,
        skillIds: Array.isArray(block.skillIds) ? block.skillIds : [],
      }))
    : [];

  let totalActualDuration = 0;
  const sessionSkillIds = [];
  const seenSkillIds = new Set();

  for (const block of normalizedBlocks) {
    totalActualDuration += Number.isFinite(block.actualDuration) ? block.actualDuration : 0;

    for (const skillId of block.skillIds) {
      if (!seenSkillIds.has(skillId)) {
        seenSkillIds.add(skillId);
        sessionSkillIds.push(skillId);
      }
    }
  }

  const sessionSkillIdsJson = JSON.stringify(sessionSkillIds);
  const info = insertSessionStmt.run(
    startedTime,
    finishedTime || null,
    source,
    presetId,
    notes,
    totalActualDuration,
    sessionSkillIdsJson
  );
  const sessionId = info.lastInsertRowid;

  for (const block of normalizedBlocks) {
    const skillIdsJson = JSON.stringify(block.skillIds);
    insertSessionBlockStmt.run(
      sessionId,
      block.type,
      skillIdsJson,
      block.plannedDuration,
      block.actualDuration,
      block.notes || null
    );
  }

  return buildSessionResponse({
    id: sessionId,
    startedTime,
    finishedTime,
    source,
    presetId,
    notes,
    actualDuration: totalActualDuration,
    skillIdsJson: sessionSkillIdsJson,
  });
});

function saveSession(session) {
  if (!session.startedTime || !session.source) {
    throw new Error('startedTime and source are required');
  }

  return saveSessionTransaction(session);
}

function clearSessionTables() {
  clearSessionBlocksStmt.run();
  clearSessionsStmt.run();
}

module.exports = {
  saveMmrLog,
  getAllMmrLogs,
  getMmrLogs,
  clearMmrLogs,
  getAllSkills,
  upsertSkill,
  deleteSkill,
  clearSkills,
  getAllPresets,
  savePreset,
  deletePreset,
  clearPresetTables,
  getSessions,
  saveSession,
  clearSessionTables,
  getSkillDurationSummary,
};