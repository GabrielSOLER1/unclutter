const express = require('express');
const { getAllTickets } = require('../db');

const router = express.Router();

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(tickets) {
  const headers = ['id', 'createdAt', 'model', 'categorie', 'priorite', 'resume', 'questions', 'exploitable', 'risque', 'rawMessage'];
  const lines = [headers.join(',')];
  for (const t of tickets) {
    const row = [
      t.id,
      t.createdAt,
      t.model,
      t.categorie,
      t.priorite,
      t.resume,
      (t.questions || []).join(' | '),
      t.exploitable ? 'oui' : 'non',
      t.risque || '',
      t.rawMessage
    ];
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

router.get('/export', (req, res) => {
  const format = (req.query.format || 'json').toLowerCase();
  const tickets = getAllTickets();

  if (format === 'json') {
    res.setHeader('Content-Disposition', 'attachment; filename="unclutter-export.json"');
    return res.json(tickets);
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="unclutter-export.csv"');
    return res.send(toCsv(tickets));
  }

  res.status(400).json({ error: "Format d'export invalide (json ou csv attendu)." });
});

module.exports = router;
