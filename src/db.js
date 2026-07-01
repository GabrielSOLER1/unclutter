const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'unclutter.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at     TEXT    NOT NULL,
    raw_message    TEXT    NOT NULL,
    model          TEXT    NOT NULL,
    categorie      TEXT,
    priorite       TEXT,
    resume         TEXT,
    questions_json TEXT,
    exploitable    INTEGER,
    risque         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
  CREATE INDEX IF NOT EXISTS idx_tickets_categorie   ON tickets(categorie);
  CREATE INDEX IF NOT EXISTS idx_tickets_priorite    ON tickets(priorite);
`);

// Migration légère : ajoute les colonnes manquantes sans toucher aux données
// existantes (utile pour une base créée par une version antérieure du schéma).
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('tickets', 'statut', "TEXT NOT NULL DEFAULT 'Nouveau'");
ensureColumn('tickets', 'note_technicien', 'TEXT');

const STATUTS = ['Nouveau', 'En cours', 'Résolu'];

const stmtInsert = db.prepare(`
  INSERT INTO tickets (created_at, raw_message, model, categorie, priorite, resume, questions_json, exploitable, risque, statut)
  VALUES (@created_at, @raw_message, @model, @categorie, @priorite, @resume, @questions_json, @exploitable, @risque, @statut)
`);
const stmtGetById = db.prepare('SELECT * FROM tickets WHERE id = ?');
const stmtUpdate = db.prepare(`
  UPDATE tickets SET statut = COALESCE(@statut, statut), note_technicien = COALESCE(@note_technicien, note_technicien)
  WHERE id = @id
`);
const stmtHistory = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC LIMIT ? OFFSET ?');
const stmtCount = db.prepare('SELECT COUNT(*) AS n FROM tickets');
const stmtAll = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC');
const stmtByCategorie = db.prepare('SELECT categorie, COUNT(*) AS n FROM tickets GROUP BY categorie');
const stmtByPriorite = db.prepare('SELECT priorite, COUNT(*) AS n FROM tickets GROUP BY priorite');
const stmtRisques = db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE risque IS NOT NULL');
const stmtExploitables = db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE exploitable = 1');
const stmtDelete = db.prepare('DELETE FROM tickets WHERE id = ?');
const stmtDeleteAll = db.prepare('DELETE FROM tickets');

function rowToTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    rawMessage: row.raw_message,
    model: row.model,
    categorie: row.categorie,
    priorite: row.priorite,
    resume: row.resume,
    questions: row.questions_json ? JSON.parse(row.questions_json) : [],
    exploitable: !!row.exploitable,
    risque: row.risque,
    statut: row.statut,
    noteTechnicien: row.note_technicien
  };
}

function insertTicket({ rawMessage, model, categorie, priorite, resume, questions, exploitable, risque }) {
  const created_at = new Date().toISOString();
  const info = stmtInsert.run({
    created_at,
    raw_message: rawMessage,
    model,
    categorie: categorie ?? null,
    priorite: priorite ?? null,
    resume: resume ?? null,
    questions_json: JSON.stringify(Array.isArray(questions) ? questions : []),
    exploitable: exploitable ? 1 : 0,
    risque: risque ?? null,
    statut: STATUTS[0]
  });
  return rowToTicket(stmtGetById.get(info.lastInsertRowid));
}

function updateTicket(id, { statut, noteTechnicien } = {}) {
  if (statut !== undefined && !STATUTS.includes(statut)) {
    throw new Error(`Statut invalide (attendu : ${STATUTS.join(', ')}).`);
  }
  if (!stmtGetById.get(id)) return null;
  stmtUpdate.run({
    id,
    statut: statut ?? null,
    note_technicien: noteTechnicien !== undefined ? noteTechnicien : null
  });
  return rowToTicket(stmtGetById.get(id));
}

function getTicketById(id) {
  return rowToTicket(stmtGetById.get(id));
}

function getHistory({ limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  const items = stmtHistory.all(safeLimit, safeOffset).map(rowToTicket);
  const total = stmtCount.get().n;
  return { total, items };
}

function getAllTickets() {
  return stmtAll.all().map(rowToTicket);
}

function getStats() {
  const byCategorie = {};
  for (const row of stmtByCategorie.all()) {
    byCategorie[row.categorie || 'À déterminer'] = row.n;
  }
  const byPriorite = {};
  for (const row of stmtByPriorite.all()) {
    byPriorite[row.priorite || 'À déterminer'] = row.n;
  }
  return {
    total: stmtCount.get().n,
    byCategorie,
    byPriorite,
    risquesDetectes: stmtRisques.get().n,
    exploitables: stmtExploitables.get().n
  };
}

function deleteTicket(id) {
  const info = stmtDelete.run(id);
  return info.changes > 0;
}

function deleteAllTickets() {
  const info = stmtDeleteAll.run();
  return info.changes;
}

module.exports = { insertTicket, getTicketById, getHistory, getAllTickets, getStats, deleteTicket, deleteAllTickets, updateTicket, STATUTS };
