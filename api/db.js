const path = require('path');
const { EventEmitter } = require('events');
const Database = require('better-sqlite3');
const zlib = require('zlib');
const { normalizePlaylist } = require('./playlist-normalize');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'rocket_trainer.db');
const db = new Database(dbPath);

const changeEmitter = new EventEmitter();
changeEmitter.setMaxListeners(0);

const PRESET_SHARE_PREFIX = 'RLTRAINER:PRESET:V1:';
const PRESET_SHARE_VERSION = 1;

function emitDatabaseChange(event) {
  changeEmitter.emit('change', { ...event });
}

function onDatabaseChange(listener) {
  changeEmitter.on('change', listener);
  return () => {
    changeEmitter.off('change', listener);
  };
}

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
  `CREATE TABLE IF NOT EXISTS bakkes_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

db.prepare(
  `CREATE TABLE IF NOT EXISTS profile_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT '',
    default_weekly_target_minutes INTEGER NOT NULL DEFAULT 0
  );`
).run();

db.prepare(
  `CREATE TABLE IF NOT EXISTS training_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    goal_type TEXT NOT NULL CHECK (goal_type IN ('global', 'skill')),
    skill_id INTEGER,
    target_minutes INTEGER,
    target_sessions INTEGER,
    period_days INTEGER NOT NULL,
    notes TEXT,
    FOREIGN KEY (skill_id) REFERENCES skills (id)
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
ensureColumn('skills', 'favorite_code TEXT');
ensureColumn('skills', 'favorite_name TEXT');

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

const selectProfileStmt = db.prepare(
  'SELECT id, name, avatar_url AS avatarUrl, timezone, default_weekly_target_minutes AS defaultWeeklyTargetMinutes FROM profile_settings LIMIT 1;'
);
const insertProfileStmt = db.prepare(
  'INSERT INTO profile_settings (id, name, avatar_url, timezone, default_weekly_target_minutes) VALUES (1, ?, ?, ?, ?);'
);
const updateProfileStmt = db.prepare(
  'UPDATE profile_settings SET name = ?, avatar_url = ?, timezone = ?, default_weekly_target_minutes = ? WHERE id = 1;'
);
const clearProfileSettingsStmt = db.prepare('DELETE FROM profile_settings;');

const selectTrainingGoalsStmt = db.prepare(
  'SELECT id, label, goal_type AS goalType, skill_id AS skillId, target_minutes AS targetMinutes, target_sessions AS targetSessions, period_days AS periodDays, notes FROM training_goals ORDER BY id ASC;'
);
const selectTrainingGoalByIdStmt = db.prepare(
  'SELECT id, label, goal_type AS goalType, skill_id AS skillId, target_minutes AS targetMinutes, target_sessions AS targetSessions, period_days AS periodDays, notes FROM training_goals WHERE id = ?;'
);
const insertTrainingGoalStmt = db.prepare(
  'INSERT INTO training_goals (label, goal_type, skill_id, target_minutes, target_sessions, period_days, notes) VALUES (?, ?, ?, ?, ?, ?, ?);'
);
const updateTrainingGoalStmt = db.prepare(
  'UPDATE training_goals SET label = ?, goal_type = ?, skill_id = ?, target_minutes = ?, target_sessions = ?, period_days = ?, notes = ? WHERE id = ?;'
);
const deleteTrainingGoalStmt = db.prepare('DELETE FROM training_goals WHERE id = ?;');
const clearTrainingGoalsStmt = db.prepare('DELETE FROM training_goals;');

const selectSkillsStmt = db.prepare(
  'SELECT id, name, category, tags, notes, favorite_code AS favoriteCode, favorite_name AS favoriteName FROM skills ORDER BY id ASC;'
);
const selectSkillByIdStmt = db.prepare(
  'SELECT id, name, category, tags, notes, favorite_code AS favoriteCode, favorite_name AS favoriteName FROM skills WHERE id = ?;'
);
const insertSkillStmt = db.prepare(
  'INSERT INTO skills (name, category, tags, notes, favorite_code, favorite_name) VALUES (?, ?, ?, ?, ?, ?);'
);
const updateSkillStmt = db.prepare(
  'UPDATE skills SET name = ?, category = ?, tags = ?, notes = ?, favorite_code = ?, favorite_name = ? WHERE id = ?;'
);
const selectSkillByNameStmt = db.prepare('SELECT id FROM skills WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1;');
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
const selectSnapshotCasualStmt = db.prepare(
  'SELECT COUNT(*) AS count FROM mmr_logs WHERE playlist = ? AND timestamp = ? AND source = ?;'
);
const selectLastMmrForPlaylistStmt = db.prepare(
  'SELECT mmr FROM mmr_logs WHERE playlist = ? ORDER BY id DESC LIMIT 1;'
);
const selectStmt = db.prepare(
  'SELECT id, timestamp, playlist, mmr, games_played_diff AS gamesPlayedDiff, source FROM mmr_logs ORDER BY timestamp ASC;'
);
const selectMmrByIdStmt = db.prepare(
  'SELECT id, timestamp, playlist, mmr, games_played_diff AS gamesPlayedDiff, source FROM mmr_logs WHERE id = ?;'
);
const updateMmrStmt = db.prepare(
  'UPDATE mmr_logs SET timestamp = ?, playlist = ?, mmr = ?, games_played_diff = ?, source = ? WHERE id = ?;'
);
const deleteMmrStmt = db.prepare('DELETE FROM mmr_logs WHERE id = ?;');
const clearStmt = db.prepare('DELETE FROM mmr_logs;');
const selectFavoritesByUserStmt = db.prepare('SELECT name, code FROM bakkes_favorites WHERE user_id = ? ORDER BY id ASC;');
const selectFavoriteByUserAndCodeStmt = db.prepare(
  'SELECT id FROM bakkes_favorites WHERE user_id = ? AND code = ? LIMIT 1;'
);
const insertFavoriteStmt = db.prepare('INSERT INTO bakkes_favorites (user_id, name, code) VALUES (?, ?, ?);');
const clearFavoritesStmt = db.prepare('DELETE FROM bakkes_favorites;');

function saveMmrLog({ timestamp, playlist, mmr, gamesPlayedDiff, source = 'bakkes' }) {
  const resolvedSource = source || 'bakkes';
  // Skip storing duplicate MMR entries per playlist when nothing has changed.
  const lastForPlaylist = selectLastMmrForPlaylistStmt.get(playlist);
  if (lastForPlaylist && Number(lastForPlaylist.mmr) === Number(mmr)) {
    return false;
  }
  if (resolvedSource === 'bakkes_snapshot' && playlist === 'Casual') {
    const { count } = selectSnapshotCasualStmt.get(playlist, timestamp, resolvedSource);
    if (count > 0) {
      return false;
    }
  }

  insertStmt.run(timestamp, playlist, mmr, gamesPlayedDiff, resolvedSource);
  emitDatabaseChange({
    type: 'mmr-log',
    action: 'create',
    timestamp,
    playlist,
    source: resolvedSource,
  });
  return true;
}

function insertRawMmrRecord({ timestamp, playlist, mmr, gamesPlayedDiff, source = 'bakkes' }) {
  insertStmt.run(timestamp, playlist, mmr, gamesPlayedDiff, source);
  emitDatabaseChange({
    type: 'mmr-log',
    action: 'create',
    timestamp,
    playlist,
    source,
  });
}

function getMmrLogById(id) {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('invalid mmr id');
  }

  return selectMmrByIdStmt.get(parsed) || null;
}

function updateMmrLog({ id, timestamp, playlist, mmr, gamesPlayedDiff, source = 'bakkes' }) {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('invalid mmr id');
  }

  const errors = [];
  if (!timestamp) {
    errors.push('timestamp is required');
  }

  if (typeof playlist !== 'string' || playlist.trim().length === 0) {
    errors.push('playlist must be a non-empty string');
  }

  if (typeof mmr !== 'number' || Number.isNaN(mmr)) {
    errors.push('mmr must be a number');
  }

  if (typeof gamesPlayedDiff !== 'number' || Number.isNaN(gamesPlayedDiff)) {
    errors.push('gamesPlayedDiff must be a number');
  }

  if (errors.length) {
    throw new Error(errors.join('. '));
  }

  const info = updateMmrStmt.run(timestamp, playlist, mmr, gamesPlayedDiff, source || 'bakkes', parsed);
  if (info.changes === 0) {
    throw new Error('mmr record not found');
  }

  const updated = selectMmrByIdStmt.get(parsed);
  if (updated) {
    emitDatabaseChange({
      type: 'mmr-log',
      action: 'update',
      id: parsed,
      playlist: updated.playlist,
      source: updated.source,
      timestamp: updated.timestamp,
    });
  }

  return updated;
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
  const info = clearStmt.run();
  const deleted = info?.changes ?? 0;
  emitDatabaseChange({
    type: 'mmr-log',
    action: 'clear',
    deleted,
  });
  return deleted;
}

function deleteMmrLog(id) {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('invalid mmr id');
  }

  const info = deleteMmrStmt.run(parsed);
  if (info.changes === 0) {
    throw new Error('mmr record not found');
  }

  emitDatabaseChange({
    type: 'mmr-log',
    action: 'delete',
    id: parsed,
  });
}

function matchesPlaylistFilter(recordPlaylist, requestedPlaylist, normalizedRequest) {
  if (!requestedPlaylist) {
    return true;
  }

  if (normalizedRequest) {
    const normalizedRecord = normalizePlaylist(recordPlaylist);
    return normalizedRecord === normalizedRequest;
  }

  return recordPlaylist === requestedPlaylist;
}

function deleteMmrLogs({ playlist, from, to } = {}) {
  if (!playlist && !from && !to) {
    throw new Error('at least one filter (playlist, from, to) is required');
  }

  const conditions = [];
  const params = [];
  const filtersPayload = {
    playlist: playlist ?? null,
    from: from ?? null,
    to: to ?? null,
  };

  if (from) {
    conditions.push('timestamp >= ?');
    params.push(from);
  }

  if (to) {
    conditions.push('timestamp <= ?');
    params.push(to);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  if (!playlist) {
    const query = `DELETE FROM mmr_logs ${whereClause};`;
    const info = db.prepare(query).run(...params);
    const deleted = info.changes || 0;
    if (deleted > 0) {
      emitDatabaseChange({
        type: 'mmr-log',
        action: 'bulk-delete',
        filters: filtersPayload,
        deleted,
      });
    }
    return deleted;
  }

  const selectQuery = `SELECT id, playlist FROM mmr_logs ${whereClause};`;
  const rows = db.prepare(selectQuery).all(...params);
  const normalizedPlaylist = normalizePlaylist(playlist);
  const rowsToDelete = rows.filter((row) => matchesPlaylistFilter(row.playlist, playlist, normalizedPlaylist));

  if (!rowsToDelete.length) {
    return 0;
  }

  const ids = rowsToDelete.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(', ');
  const deleteStmt = db.prepare(`DELETE FROM mmr_logs WHERE id IN (${placeholders});`);
  const info = deleteStmt.run(...ids);
  const deleted = info.changes || rowsToDelete.length;
  if (deleted > 0) {
    emitDatabaseChange({
      type: 'mmr-log',
      action: 'bulk-delete',
      filters: filtersPayload,
      deleted,
    });
  }
  return deleted;
}

function getFavoritesByUser(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required');
  }

  return selectFavoritesByUserStmt.all(userId);
}

function addFavoriteForUser({ userId, name, code }) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required');
  }

  if (!name || typeof name !== 'string') {
    throw new Error('name is required');
  }

  if (!code || typeof code !== 'string') {
    throw new Error('code is required');
  }

  insertFavoriteStmt.run(userId, name, code);
  emitDatabaseChange({
    type: 'favorite',
    action: 'create',
    userId,
  });
}

function ensureFavoriteForUser({ userId, name, code }) {
  if (!userId || !name || !code) {
    return;
  }

  const trimmedName = name.trim();
  const trimmedCode = code.trim();
  if (!trimmedName || !trimmedCode) {
    return;
  }

  const existing = selectFavoriteByUserAndCodeStmt.get(userId, trimmedCode);
  if (existing) {
    return;
  }

  addFavoriteForUser({ userId, name: trimmedName, code: trimmedCode });
}

function clearFavorites() {
  clearFavoritesStmt.run();
  emitDatabaseChange({
    type: 'favorite',
    action: 'clear',
  });
}

function getAllSkills() {
  return selectSkillsStmt.all();
}

function upsertSkill({
  id,
  name,
  category = null,
  tags = null,
  notes = null,
  favoriteCode = null,
  favoriteName = null,
}) {
  if (!name) {
    throw new Error('name is required');
  }

  if (id) {
    updateSkillStmt.run(name, category, tags, notes, favoriteCode ?? null, favoriteName ?? null, id);
    const updated = selectSkillByIdStmt.get(id);
    emitDatabaseChange({
      type: 'skill',
      action: 'update',
      skillId: id,
    });
    return updated;
  }

  const info = insertSkillStmt.run(name, category, tags, notes, favoriteCode ?? null, favoriteName ?? null);
  const created = selectSkillByIdStmt.get(info.lastInsertRowid);
  emitDatabaseChange({
    type: 'skill',
    action: 'create',
    skillId: info.lastInsertRowid,
  });
  return created;
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
  emitDatabaseChange({
    type: 'skill',
    action: 'delete',
    skillId: id,
  });
}

function clearSkills() {
  clearSkillsStmt.run();
  emitDatabaseChange({
    type: 'skill',
    action: 'clear',
  });
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

  const action = preset.id ? 'update' : 'create';
  const saved = savePresetTransaction(preset);
  emitDatabaseChange({
    type: 'preset',
    action,
    presetId: saved.id,
  });
  return saved;
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
  emitDatabaseChange({
    type: 'preset',
    action: 'delete',
    presetId: id,
  });
}

function clearPresetTables() {
  clearPresetBlocksStmt.run();
  clearPresetsStmt.run();
  emitDatabaseChange({
    type: 'preset',
    action: 'clear',
  });
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

  const saved = saveSessionTransaction(session);
  emitDatabaseChange({
    type: 'session',
    action: 'create',
    sessionId: saved.id,
    source: session.source,
  });
  return saved;
}

function clearSessionTables() {
  clearSessionBlocksStmt.run();
  clearSessionsStmt.run();
  emitDatabaseChange({
    type: 'session',
    action: 'clear',
  });
}

function ensureProfileSettingsRow() {
  const existing = selectProfileStmt.get();
  if (!existing) {
    insertProfileStmt.run('', '', '', 0);
  }
}

function getProfile() {
  ensureProfileSettingsRow();
  return selectProfileStmt.get();
}

function updateProfile({ name, avatarUrl = '', timezone, defaultWeeklyTargetMinutes }) {
  ensureProfileSettingsRow();
  updateProfileStmt.run(name, avatarUrl, timezone, defaultWeeklyTargetMinutes);
  const updated = selectProfileStmt.get();
  emitDatabaseChange({
    type: 'profile',
    action: 'update',
  });
  return updated;
}

function normalizeGoalNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTrainingGoals() {
  return selectTrainingGoalsStmt.all();
}

function saveTrainingGoal({
  id,
  label,
  goalType,
  skillId = null,
  targetMinutes = null,
  targetSessions = null,
  periodDays,
  notes = null,
}) {
  if (!label || typeof label !== 'string') {
    throw new Error('label is required');
  }

  if (!['global', 'skill'].includes(goalType)) {
    throw new Error("goalType must be 'global' or 'skill'");
  }

  const normalizedPeriodDays = Number(periodDays);
  if (!Number.isInteger(normalizedPeriodDays) || normalizedPeriodDays <= 0) {
    throw new Error('periodDays must be a positive integer');
  }

  let normalizedSkillId = null;
  if (goalType === 'skill') {
    if (!Number.isInteger(Number(skillId)) || Number(skillId) <= 0) {
      throw new Error('skillId is required for skill goals');
    }
    normalizedSkillId = Number(skillId);
  }

  const normalizedTargetMinutes = normalizeGoalNumber(targetMinutes);
  const normalizedTargetSessions = normalizeGoalNumber(targetSessions);
  const notesValue = typeof notes === 'string' ? notes : null;

  if (id) {
    updateTrainingGoalStmt.run(
      label,
      goalType,
      normalizedSkillId,
      normalizedTargetMinutes,
      normalizedTargetSessions,
      normalizedPeriodDays,
      notesValue,
      id
    );
    const updated = selectTrainingGoalByIdStmt.get(id);
    emitDatabaseChange({
      type: 'training-goal',
      action: 'update',
      goalId: id,
    });
    return updated;
  }

  const info = insertTrainingGoalStmt.run(
    label,
    goalType,
    normalizedSkillId,
    normalizedTargetMinutes,
    normalizedTargetSessions,
    normalizedPeriodDays,
    notesValue
  );
  const created = selectTrainingGoalByIdStmt.get(info.lastInsertRowid);
  emitDatabaseChange({
    type: 'training-goal',
    action: 'create',
    goalId: info.lastInsertRowid,
  });
  return created;
}

function deleteTrainingGoal(id) {
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
    throw new Error('Invalid goal id');
  }

  deleteTrainingGoalStmt.run(id);
  emitDatabaseChange({
    type: 'training-goal',
    action: 'delete',
    goalId: Number(id),
  });
}

function buildTimeFilters({ from, to } = {}) {
  const conditions = [];
  const params = [];

  if (from) {
    conditions.push('s.started_time >= ?');
    params.push(from);
  }

  if (to) {
    conditions.push('s.started_time <= ?');
    params.push(to);
  }

  return { conditions, params };
}

function formatProgress(goal, row, { from = null, to = null } = {}) {
  const totalSeconds = Number(row?.totalSeconds ?? 0);
  const totalSessions = Number(row?.totalSessions ?? 0);

  return {
    goalId: goal.id,
    actualSeconds: totalSeconds,
    actualMinutes: Math.round(totalSeconds / 60),
    actualSessions: totalSessions,
    periodFrom: from || null,
    periodTo: to || null,
  };
}

function computeGoalProgress(goal, { from, to } = {}) {
  const time = buildTimeFilters({ from, to });

  if (goal.goalType === 'skill') {
    const conditions = ['skill.value = ?', ...time.conditions];
    const params = [goal.skillId, ...time.params];
    const query = `
      SELECT
        COUNT(DISTINCT s.id) AS totalSessions,
        COALESCE(SUM(sb.actual_duration), 0) AS totalSeconds
      FROM session_blocks sb
      JOIN sessions s ON s.id = sb.session_id
      JOIN json_each(sb.skill_ids) AS skill
      WHERE ${conditions.join(' AND ')}
    `;

    const row = db.prepare(query).get(...params);
    return formatProgress(goal, row, { from, to });
  }

  const whereClause = time.conditions.length ? `WHERE ${time.conditions.join(' AND ')}` : '';
  const query = `
    SELECT
      COUNT(*) AS totalSessions,
      COALESCE(SUM(actual_duration), 0) AS totalSeconds
    FROM sessions s
    ${whereClause}
  `;
  const row = db.prepare(query).get(...time.params);
  return formatProgress(goal, row, { from, to });
}

function getGoalProgress({ goalId, from, to } = {}) {
  const goals = getTrainingGoals();
  const filtered = Number.isInteger(Number(goalId))
    ? goals.filter((goal) => goal.id === Number(goalId))
    : goals;

  return filtered.map((goal) => computeGoalProgress(goal, { from, to }));
}

function clearProfileSettings() {
  clearProfileSettingsStmt.run();
  ensureProfileSettingsRow();
  emitDatabaseChange({
    type: 'profile',
    action: 'clear',
  });
}

function clearTrainingGoals() {
  clearTrainingGoalsStmt.run();
  emitDatabaseChange({
    type: 'training-goal',
    action: 'clear',
  });
}

function encodePresetShare(payload) {
  const json = JSON.stringify(payload);
  const compressed = zlib.deflateSync(json);
  return `${PRESET_SHARE_PREFIX}${compressed.toString('base64')}`;
}

function decodePresetShare(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('share text is required');
  }

  if (!text.startsWith(PRESET_SHARE_PREFIX)) {
    throw new Error('invalid share payload');
  }

  const encoded = text.slice(PRESET_SHARE_PREFIX.length);
  let buffer;
  try {
    buffer = Buffer.from(encoded, 'base64');
  } catch (error) {
    throw new Error('invalid share payload');
  }

  let json;
  try {
    json = zlib.inflateSync(buffer).toString('utf8');
  } catch (error) {
    throw new Error('unable to decode share payload');
  }

  return JSON.parse(json);
}

function buildPresetSharePayload(presetId) {
  const preset = selectPresetByIdStmt.get(presetId);
  if (!preset) {
    throw new Error('preset not found');
  }

  const blocks = selectBlocksStmt.all(presetId);
  const skillIndexMap = new Map();
  const skills = [];

  for (const block of blocks) {
    if (!skillIndexMap.has(block.skillId)) {
      const skill = selectSkillByIdStmt.get(block.skillId);
      if (!skill) {
        throw new Error('skill not found');
      }
      skillIndexMap.set(block.skillId, skills.length);
      skills.push({
        name: skill.name,
        category: skill.category ?? null,
        tags: skill.tags ?? null,
        notes: skill.notes ?? null,
        favoriteCode: skill.favoriteCode ?? null,
        favoriteName: skill.favoriteName ?? null,
      });
    }
  }

  const payloadBlocks = blocks.map((block) => ({
    skillIndex: skillIndexMap.get(block.skillId),
    orderIndex: block.orderIndex,
    type: block.type,
    durationSeconds: block.durationSeconds,
    notes: block.notes ?? null,
  }));

  return {
    version: PRESET_SHARE_VERSION,
    preset: {
      name: preset.name,
      blocks: payloadBlocks,
    },
    skills,
  };
}

function sanitizeString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function resolveSkillIdForSharedDefinition(definition, userId) {
  const name = sanitizeString(definition?.name);
  if (!name) {
    throw new Error('skill name is required');
  }

  const existing = selectSkillByNameStmt.get(name);
  if (existing) {
    return existing.id;
  }

  const created = upsertSkill({
    name,
    category: sanitizeString(definition.category),
    tags: sanitizeString(definition.tags),
    notes: sanitizeString(definition.notes),
    favoriteCode: sanitizeString(definition.favoriteCode),
    favoriteName: sanitizeString(definition.favoriteName),
  });

  ensureFavoriteForUser({
    userId,
    name: sanitizeString(definition.favoriteName),
    code: sanitizeString(definition.favoriteCode),
  });

  return created.id;
}

function importPresetShare({ share, userId }) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required');
  }
  const payload = decodePresetShare(share);
  if (payload.version !== PRESET_SHARE_VERSION) {
    throw new Error('unsupported share version');
  }

  const presetName = sanitizeString(payload.preset?.name);
  if (!presetName) {
    throw new Error('preset name is required');
  }

  const blocks = Array.isArray(payload.preset?.blocks) ? payload.preset.blocks : [];
  if (!blocks.length) {
    throw new Error('preset must include at least one block');
  }

  const skills = Array.isArray(payload.skills) ? payload.skills : [];
  if (!skills.length) {
    throw new Error('shared preset must include skill definitions');
  }

  const normalizedBlocks = blocks.map((block, index) => {
    const skillIndex = block.skillIndex;
    if (!Number.isInteger(skillIndex)) {
      throw new Error('invalid skill reference');
    }

    if (skillIndex < 0 || skillIndex >= skills.length) {
      throw new Error('skill reference out of range');
    }

    const duration = Number(block.durationSeconds ?? 0);
    const notes = sanitizeString(block.notes);
    const type = typeof block.type === 'string' && block.type.trim() ? block.type.trim() : 'Block';

    return {
      skillIndex,
      orderIndex: Number.isInteger(block.orderIndex) ? block.orderIndex : index,
      type,
      durationSeconds: Number.isFinite(duration) ? duration : 0,
      notes,
    };
  });

  const skillIndexToId = new Map();
  const presetBlocks = normalizedBlocks.map((block) => {
    let skillId = skillIndexToId.get(block.skillIndex);
    if (!skillId) {
      skillId = resolveSkillIdForSharedDefinition(skills[block.skillIndex], userId);
      skillIndexToId.set(block.skillIndex, skillId);
    }

    return {
      orderIndex: block.orderIndex,
      skillId,
      type: block.type,
      durationSeconds: block.durationSeconds,
      notes: block.notes,
    };
  });

  return savePreset({ name: presetName, blocks: presetBlocks });
}

function exportPresetShare(presetId) {
  const payload = buildPresetSharePayload(presetId);
  return encodePresetShare(payload);
}

ensureProfileSettingsRow();

module.exports = {
  saveMmrLog,
  getAllMmrLogs,
  getMmrLogs,
  clearMmrLogs,
  deleteMmrLog,
  getMmrLogById,
  updateMmrLog,
  deleteMmrLogs,
  insertRawMmrRecord,
  getFavoritesByUser,
  addFavoriteForUser,
  ensureFavoriteForUser,
  clearFavorites,
  getAllSkills,
  upsertSkill,
  deleteSkill,
  clearSkills,
  getAllPresets,
  savePreset,
  exportPresetShare,
  importPresetShare,
  deletePreset,
  clearPresetTables,
  getSessions,
  saveSession,
  clearSessionTables,
  getSkillDurationSummary,
  getProfile,
  updateProfile,
  getTrainingGoals,
  saveTrainingGoal,
  deleteTrainingGoal,
  getGoalProgress,
  clearProfileSettings,
  clearTrainingGoals,
  onChange: onDatabaseChange,
};