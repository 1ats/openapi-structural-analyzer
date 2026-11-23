const { Router } = require('express');
const validationController = require('../controllers/validationController');

const router = Router();

// Endpoint da Fase 2: Validação e Desduplicação
router.post('/validate-specs', validationController.validateSpecs);

module.exports = router;