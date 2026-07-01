const express = require('express');
const { getStats } = require('../db');

const router = express.Router();

router.get('/stats', (req, res) => {
  res.json(getStats());
});

module.exports = router;
