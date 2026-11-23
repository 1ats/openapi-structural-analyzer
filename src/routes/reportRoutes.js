const { Router } = require('express');
const reportController = require('../controllers/reportController');

const router = Router();

// GET /api/v1/reports/summary — Dados estatísticos globais
router.get('/summary', reportController.getSummary);

// GET /api/v1/reports/patterns — Rankings e métricas dos componentes mais usados
router.get('/patterns', reportController.getRankings);

module.exports = router;