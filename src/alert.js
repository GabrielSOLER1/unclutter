// Envoie une alerte vers un webhook (Slack ou Discord) quand un risque est détecté.
// Optionnel : si ALERT_WEBHOOK_URL n'est pas défini, la fonction ne fait rien.
// N'est jamais bloquant pour la réponse de /api/analyze : les erreurs sont
// journalisées côté serveur, jamais renvoyées au client.
async function sendRiskAlert(ticket) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  const message = [
    '⚠️ Unclutter — Risque détecté, validation d\'un administrateur senior requise',
    `Catégorie : ${ticket.categorie || 'À déterminer'}`,
    `Priorité : ${ticket.priorite || 'À déterminer'}`,
    `Risque : ${ticket.risque}`,
    `Résumé : ${ticket.resume || ''}`,
    `Ticket #${ticket.id} — ${ticket.createdAt}`
  ].join('\n');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // "content" (Discord) et "text" (Slack) envoyés ensemble pour rester
      // compatible avec les deux formats de webhook les plus courants.
      body: JSON.stringify({ content: message, text: message })
    });
    if (!res.ok) {
      console.error(`Alerte webhook : réponse non-OK (${res.status})`);
    }
  } catch (e) {
    console.error('Alerte webhook : échec de l\'envoi —', e.message);
  }
}

module.exports = { sendRiskAlert };
