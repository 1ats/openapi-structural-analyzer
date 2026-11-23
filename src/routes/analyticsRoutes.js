const { Router } = require('express');
const parsingController = require('../controllers/parsingController');
const cooccurrenceController = require('../controllers/cooccurrenceController'); // Fase 4

const router = Router();

// Endpoint da Fase 3: Parsing e Extração de Componentes
router.post('/parse-components', parsingController.parseComponents);

// Endpoint da Fase 4: Métricas e Padrões de Coocorrência
router.post('/generate-patterns', cooccurrenceController.generatePatterns);

module.exports = router;