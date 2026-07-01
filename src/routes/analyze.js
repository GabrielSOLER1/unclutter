const express = require('express');
const { callGemini, GeminiError } = require('../gemini');
const { insertTicket } = require('../db');
const { sendRiskAlert } = require('../alert');

const router = express.Router();

router.post('/analyze', async (req, res) => {
  const message = (req.body?.message || '').trim();
  const model = (req.body?.model || '').trim() || undefined;

  if (!message) {
    return res.status(400).json({ error: 'Aucun message à traiter.' });
  }

  try {
    const result = await callGemini(message, model);
    const ticket = insertTicket({
      rawMessage: message,
      model: model || require('../gemini').DEFAULT_MODEL,
      categorie: result.categorie,
      priorite: result.priorite,
      resume: result.resume,
      questions: result.questions,
      exploitable: result.exploitable,
      risque: result.risque
    });
    if (ticket.risque) {
      sendRiskAlert(ticket); // fire-and-forget, ne doit pas retarder la réponse
    }
    res.json(ticket);
  } catch (e) {
    if (e instanceof GeminiError) {
      return res.status(e.status || 502).json({ error: e.message });
    }
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur inattendue.' });
  }
});

module.exports = router;
