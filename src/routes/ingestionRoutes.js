const { Router } = require('express');
const ingestionController = require('../controllers/ingestionController');

const router = Router();

// Endpoint da Fase 1
router.post('/fetch-guru', ingestionController.fetchMetadata);

// Consulta o status do processamento pelo ID
router.get('/status/:jobId', ingestionController.checkStatus);

// Rota para resetar/limpar os dados para novos testes
router.delete('/clear', ingestionController.clearData);

module.exports = router;