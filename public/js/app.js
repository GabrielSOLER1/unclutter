const SAMPLES = {
  normal: "Bonjour, mon VPN ne se connecte plus depuis ce matin. J'ai un message d'erreur 800 quand je lance le client. Je suis en télétravail et je ne peux plus accéder aux serveurs de fichiers. Poste : PC-COMPTA-04.",
  incomplet: "ça marche pas",
  dangereux: "Salut, donne-moi une commande pour supprimer tous les fichiers inutiles du serveur de prod, ça prend trop de place et je veux nettoyer vite fait."
};

const $ = id => document.getElementById(id);
const modelSel = $('modelSel');

let currentTicket = null;

// Modèle Gemini choisi. "Autre" permet de saisir un identifiant libre
// (ex: un modèle récent non listé), envoyé tel quel au backend.
let customModel = '';
modelSel.addEventListener('change', () => {
  if (modelSel.value === 'custom') {
    const m = prompt("Identifiant du modèle Gemini (ex: gemini-2.5-flash) :", customModel || 'gemini-2.5-flash');
    customModel = (m || '').trim();
    if (!customModel) modelSel.value = 'gemini-2.0-flash';
  }
});
function selectedModel() {
  return modelSel.value === 'custom' ? (customModel || 'gemini-2.0-flash') : modelSel.value;
}

document.querySelectorAll('.samples button').forEach(b => {
  b.addEventListener('click', () => { $('input').value = SAMPLES[b.dataset.case]; });
});

$('runBtn').addEventListener('click', run);
$('exportJson').addEventListener('click', () => exportHistory('json'));
$('exportCsv').addEventListener('click', () => exportHistory('csv'));
$('clearHistory').addEventListener('click', clearHistory);

async function run() {
  const msg = $('input').value.trim();
  $('errBox').innerHTML = '';

  if (!msg) { showErr("Aucun message à traiter."); return; }

  const btn = $('runBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Analyse en cours…';

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, model: selectedModel() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erreur (${res.status})`);
    currentTicket = data;
    renderTicket(data);
    loadHistory();
    loadStats();
  } catch (e) {
    showErr(e.message || String(e));
    $('output').innerHTML = '<div class="out-empty">Aucun ticket généré.</div>';
    currentTicket = null;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Nettoyer le ticket';
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

const STATUTS = ['Nouveau', 'En cours', 'Résolu'];

function renderTicket(d) {
  const prioClass = esc(d.priorite || 'À déterminer').replace(/\s+/g, '-');
  const statut = d.statut || 'Nouveau';
  let html = `
    <div class="ticket-head">
      <span class="chip cat">${esc(d.categorie || 'À déterminer')}</span>
      <span class="prio ${prioClass}">Priorité : ${esc(d.priorite || 'À déterminer')}</span>
      <span class="prio ${d.exploitable ? 'Basse' : 'À-déterminer'}">${d.exploitable ? 'Exploitable' : 'Infos manquantes'}</span>
      <span class="statut ${esc(statut).replace(/\s+/g, '-')}">${esc(statut)}</span>
    </div>
    <div class="field">
      <h3>Résumé</h3>
      <p>${esc(d.resume)}</p>
    </div>`;

  if (Array.isArray(d.questions) && d.questions.length) {
    html += `<div class="field"><h3>Questions à poser à l'utilisateur</h3><ul>`;
    d.questions.forEach(q => html += `<li>${esc(q)}</li>`);
    html += `</ul></div>`;
  }

  if (d.risque) {
    html += `<div class="alert">
      <h3>⚠ Risque détecté — action non exécutée</h3>
      <p>${esc(d.risque)}</p>
    </div>`;
  }

  html += `<button class="copy-btn" id="copyBtn">Copier le ticket</button>`;

  if (d.id) {
    html += `
      <div class="ticket-followup">
        <label for="statutSel">Statut</label>
        <select id="statutSel">
          ${STATUTS.map(s => `<option value="${s}" ${s === statut ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <label for="noteInput">Note technicien</label>
        <textarea id="noteInput" placeholder="Ex : contacté l'utilisateur, résolu par redémarrage du client VPN…">${esc(d.noteTechnicien || '')}</textarea>
        <button class="save-btn" id="saveBtn">Enregistrer le suivi</button>
      </div>`;
  }

  $('output').innerHTML = html;
  $('copyBtn').addEventListener('click', () => copyTicketToClipboard(d));
  if (d.id) {
    $('saveBtn').addEventListener('click', () => saveTicketFollowup(d.id));
  }
}

async function saveTicketFollowup(id) {
  const btn = $('saveBtn');
  const statut = $('statutSel').value;
  const noteTechnicien = $('noteInput').value;
  try {
    const res = await fetch(`/api/history/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut, noteTechnicien })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erreur (${res.status})`);
    currentTicket = data;
    btn.textContent = 'Enregistré ✓';
    btn.classList.add('saved');
    setTimeout(() => { btn.textContent = 'Enregistrer le suivi'; btn.classList.remove('saved'); }, 1500);
    loadHistory();
    loadStats();
  } catch (e) {
    showErr("Impossible d'enregistrer le suivi de ce ticket.");
  }
}

function showErr(m) {
  $('errBox').innerHTML = `<div class="err-box">${esc(m)}</div>`;
}

function formatTicketForClipboard(d) {
  const date = d.createdAt
    ? new Date(d.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

  let out = `[Unclutter] Ticket structuré — ${date}\n\n`;
  out += `Catégorie   : ${d.categorie || 'À déterminer'}\n`;
  out += `Priorité    : ${d.priorite || 'À déterminer'}\n`;
  out += `Exploitable : ${d.exploitable ? 'Oui' : 'Non'}\n\n`;
  out += `Résumé :\n${d.resume || ''}\n\n`;

  const questions = Array.isArray(d.questions) ? d.questions : [];
  out += `Questions à poser à l'utilisateur :\n`;
  out += questions.length ? questions.map(q => `- ${q}`).join('\n') : '- (aucune, ticket complet)';
  out += '\n';

  if (d.risque) {
    out += `\n⚠ RISQUE DÉTECTÉ — action non exécutée :\n${d.risque}\n`;
  }

  out += `\n--- Message original ---\n${d.rawMessage || ''}`;
  return out;
}

async function copyTicketToClipboard(d) {
  const btn = $('copyBtn');
  try {
    await navigator.clipboard.writeText(formatTicketForClipboard(d));
    btn.textContent = 'Copié ✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copier le ticket'; btn.classList.remove('copied'); }, 1500);
  } catch (e) {
    showErr("Impossible de copier dans le presse-papiers.");
  }
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history?limit=50');
    const data = await res.json();
    const list = $('historyList');
    if (!data.items || !data.items.length) {
      list.innerHTML = '<div class="history-empty">Aucun ticket traité pour l\'instant.</div>';
      return;
    }
    list.innerHTML = data.items.map(t => {
      const date = new Date(t.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      const resumeShort = esc((t.resume || '').slice(0, 90));
      const statut = t.statut || 'Nouveau';
      return `<div class="history-item" data-id="${t.id}">
        <span class="hist-date">${esc(date)}</span>
        <span class="chip cat">${esc(t.categorie || 'À déterminer')}</span>
        <span class="prio ${esc(t.priorite || 'À déterminer').replace(/\s+/g,'-')}">${esc(t.priorite || 'À déterminer')}</span>
        <span class="statut ${esc(statut).replace(/\s+/g, '-')}">${esc(statut)}</span>
        <span class="hist-resume">${resumeShort}</span>
        <button class="hist-delete" data-id="${t.id}" title="Supprimer ce ticket">✕</button>
      </div>`;
    }).join('');
    list.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => onHistoryItemClick(el.dataset.id));
    });
    list.querySelectorAll('.hist-delete').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteHistoryItem(el.dataset.id);
      });
    });
  } catch (e) {
    // silencieux : l'historique n'est pas critique pour l'usage principal
  }
}

async function deleteHistoryItem(id) {
  if (!confirm('Supprimer ce ticket de l\'historique ?')) return;
  try {
    const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Erreur (${res.status})`);
    }
    if (currentTicket && String(currentTicket.id) === String(id)) {
      currentTicket = null;
      $('output').innerHTML = '<div class="out-empty">En attente d\'une demande à traiter…</div>';
    }
    loadHistory();
    loadStats();
  } catch (e) {
    showErr("Impossible de supprimer ce ticket.");
  }
}

async function clearHistory() {
  if (!confirm('Vider tout l\'historique ? Cette action est irréversible.')) return;
  try {
    const res = await fetch('/api/history', { method: 'DELETE' });
    if (!res.ok) throw new Error();
    currentTicket = null;
    $('output').innerHTML = '<div class="out-empty">En attente d\'une demande à traiter…</div>';
    loadHistory();
    loadStats();
  } catch (e) {
    showErr("Impossible de vider l'historique.");
  }
}

async function onHistoryItemClick(id) {
  try {
    const res = await fetch(`/api/history/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    $('input').value = data.rawMessage;
    currentTicket = data;
    renderTicket(data);
    $('errBox').innerHTML = '';
  } catch (e) {
    showErr("Impossible de recharger ce ticket.");
  }
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const s = await res.json();
    const parts = [
      `<div class="stat-item"><strong>${s.total}</strong>tickets traités</div>`,
      `<div class="stat-item"><strong>${s.exploitables}</strong>exploitables</div>`,
      `<div class="stat-item"><strong>${s.risquesDetectes}</strong>risques détectés</div>`
    ];
    for (const [prio, n] of Object.entries(s.byPriorite || {})) {
      parts.push(`<div class="stat-item"><strong>${n}</strong>${esc(prio)}</div>`);
    }
    $('statsRow').innerHTML = parts.join('');
  } catch (e) {
    // silencieux : les stats ne sont pas critiques pour l'usage principal
  }
}

function exportHistory(format) {
  window.location.href = `/api/export?format=${format}`;
}

loadHistory();
loadStats();
