const ingestionService = require('../services/ingestionService');
const pool = require('../config/database');

async function fetchMetadata(req, res) {
  try {
    // 1. Cria a entrada na tabela de jobs
    const jobRes = await pool.query(
      `INSERT INTO processing_jobs (job_type, status) VALUES ('FETCH_GURU_METADATA', 'PROCESSING') RETURNING job_id`
    );
    const jobId = jobRes.rows[0].job_id;

    // 2. Dispara a execução em segundo plano passando o jobId
    ingestionService.fetchAndSaveGuruMetadata(jobId);

    // 3. Retorna imediatamente o ID para acompanhamento
    return res.status(202).json({
      message: 'Coleta de metadados iniciada em segundo plano.',
      job_id: jobId,
      status_check_url: `/api/v1/ingestion/status/${jobId}`
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function checkStatus(req, res) {
  try {
    const { jobId } = req.params;
    const job = await ingestionService.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ message: 'Job não encontrado.' });
    }

    return res.status(200).json(job);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function clearData(req, res) {
  try {
    const result = await ingestionService.clearAllIngestionData();
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// Adicione clearData no module.exports do controller
module.exports = { fetchMetadata, clearData, checkStatus }; // checkStatus, 
