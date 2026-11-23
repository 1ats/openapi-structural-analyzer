const { Router } = require('express');
const githubIngestionController = require('../controllers/githubIngestionController');

const router = Router();

// Endpoint para disparar a ingestão de especificações do GitHub
router.post('/fetch-github', githubIngestionController.fetchGitHubSpecs);

module.exports = router;