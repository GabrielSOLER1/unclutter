require('dotenv').config();
const express = require('express');
const path = require('path');

const analyzeRouter = require('./src/routes/analyze');
const historyRouter = require('./src/routes/history');
const statsRouter = require('./src/routes/stats');
const exportRouter = require('./src/routes/export');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', analyzeRouter);
app.use('/api', historyRouter);
app.use('/api', statsRouter);
app.use('/api', exportRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur inattendue.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Unclutter backend démarré sur http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠ GEMINI_API_KEY non définie — les analyses échoueront tant que .env n\'est pas configuré.');
  }
});
