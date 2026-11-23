const githubIngestionService = require('../services/githubIngestionService');
const pool = require('../config/database');

async function fetchGitHubSpecs(req, res) {
  try {
    // 1. Cria um registro de Job na tabela processing_jobs
    const jobResult = await pool.query(
      `INSERT INTO processing_jobs (job_type, status) 
       VALUES ('FETCH_GITHUB_METADATA', 'PROCESSING') 
       RETURNING job_id;`
    );
    const jobId = jobResult.rows[0].job_id;

    // 2. Dispara o processamento em segundo plano (Background Job)
    githubIngestionService.fetchAllGitHubSpecs(jobId).catch(err => {
      console.error('Erro no processamento em segundo plano do GitHub:', err.message);
    });

    // 3. Retorna imediatamente a resposta com o jobId para acompanhamento
    return res.status(202).json({
      message: 'Iniciada a coleta de especificações OpenAPI do GitHub em segundo plano.',
      job_id: jobId,
      status_url: `/api/v1/ingestion/status/${jobId}`
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { fetchGitHubSpecs };