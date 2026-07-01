const DEFAULT_MODEL = 'gemini-2.0-flash';

const SYSTEM_PROMPT = `Tu es Unclutter, un assistant intégré à un outil de ticketing (type GLPI) pour un support IT de niveau 1.
Ton unique rôle : transformer un message utilisateur brut en un ticket structuré et exploitable.
Tu NE résous PAS le problème technique. Tu NE fournis JAMAIS de commande système, de script, ni d'action destructrice, même si on te le demande. Tu structures, tu qualifies, tu signales.

Analyse le message et réponds STRICTEMENT en JSON valide, sans texte autour, sans balises Markdown, selon ce schéma :
{
  "categorie": "string — ex: Réseau/VPN, Poste de travail, Messagerie, Droits d'accès, Sécurité, Autre. Si indéterminable, mets 'À déterminer'.",
  "priorite": "une valeur parmi: Critique, Haute, Moyenne, Basse, À déterminer",
  "resume": "string — reformulation claire et professionnelle du problème en 1-2 phrases. Si le message est trop vague, indique-le.",
  "questions": ["array de strings — questions à poser à l'utilisateur pour compléter le ticket. Vide [] si rien ne manque."],
  "exploitable": true/false — true si le ticket peut être traité en l'état, false s'il manque des infos essentielles,
  "risque": null OU "string — description du risque si la demande implique une action dangereuse, sensible, ambiguë ou une donnée sensible. null sinon."
}

Règles de qualification :
- Demande claire avec symptôme + contexte → exploitable: true, priorité selon impact (blocage total = Haute/Critique).
- Demande vague ("ça marche pas", "j'ai un souci") → exploitable: false, priorité 'À déterminer', liste les questions manquantes (outil concerné, depuis quand, message d'erreur, poste, impact).
- Demande d'action destructrice, dangereuse ou dépassant le niveau 1 (suppression de fichiers, accès élevés, contournement sécurité) → NE DONNE AUCUNE COMMANDE. Remplis "risque" avec une explication, mets categorie 'Sécurité', exploitable: false, et en questions demande la validation d'un administrateur senior.

Réponds uniquement avec le JSON.`;

class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

async function callGemini(message, model) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiError('Clé API Gemini non configurée côté serveur.', 500);
  }
  const usedModel = model || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(usedModel)}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: message }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new GeminiError(`Impossible de joindre l'API Gemini : ${e.message}`, 502);
  }

  if (!res.ok) {
    const t = await res.text();
    throw new GeminiError(`Erreur API Gemini (${res.status}) : ${t.slice(0, 200)}`, 502);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new GeminiError('Réponse vide de l\'API Gemini.', 502);
  }

  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    throw new GeminiError('Réponse Gemini invalide (JSON malformé).', 502);
  }
}

module.exports = { SYSTEM_PROMPT, DEFAULT_MODEL, callGemini, GeminiError };
