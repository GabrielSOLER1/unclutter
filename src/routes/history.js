const express = require('express');
const { getHistory, getTicketById, deleteTicket, deleteAllTickets, updateTicket } = require('../db');

const router = express.Router();

router.get('/history', (req, res) => {
  const { limit, offset } = req.query;
  res.json(getHistory({ limit, offset }));
});

router.get('/history/:id', (req, res) => {
  const ticket = getTicketById(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket introuvable.' });
  }
  res.json(ticket);
});

router.patch('/history/:id', (req, res) => {
  const { statut, noteTechnicien } = req.body || {};
  try {
    const ticket = updateTicket(req.params.id, { statut, noteTechnicien });
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket introuvable.' });
    }
    res.json(ticket);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/history/:id', (req, res) => {
  const deleted = deleteTicket(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Ticket introuvable.' });
  }
  res.status(204).end();
});

router.delete('/history', (req, res) => {
  const count = deleteAllTickets();
  res.json({ deleted: count });
});

module.exports = router;
