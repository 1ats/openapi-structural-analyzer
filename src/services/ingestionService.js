const axios = require('axios');
const pool = require('../config/database');
const { parseContentToJson, generateSHA256 } = require('../utils/converter');

async function fetchAndSaveGuruMetadata(jobId) {
  const APIS_GURU_URL = 'https://api.apis.guru/v2/list.json';
  
  try {
    const response = await axios.get(APIS_GURU_URL);
    const data = response.data;
    const entries = Object.entries(data);

    await pool.query(
      `UPDATE processing_jobs SET total_records = $1 WHERE job_id = $2`,
      [entries.length, jobId]
    );

    let totalMetadataSaved = 0;
    let totalSpecsSaved = 0;

    for (const [providerKey, providerData] of entries) {
      const preferredVer = providerData.preferred;
      const versionObj = providerData.versions[preferredVer];

      // 1. Inserir na provider_metadata
      const metadataQuery = `
        INSERT INTO provider_metadata 
        (source_platform, provider_key, api_title, provider_name, service_name, preferred_version, categories, raw_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id;
      `;
      
      const metaRes = await pool.query(metadataQuery, [
        'APIs.guru',
        providerKey,
        versionObj.info?.title || null,
        versionObj.info?.['x-providerName'] || null,
        versionObj.info?.['x-serviceName'] || null,
        preferredVer,
        JSON.stringify(versionObj.info?.['x-apisguru-categories'] || []),
        JSON.stringify(providerData)
      ]);

      const metadataId = metaRes.rows[0].id;
      totalMetadataSaved++;

      // 2. Baixar a especificação e preparar para a spec_files
      const downloadUrl = versionObj.swaggerYamlUrl || versionObj.swaggerUrl || versionObj.link;
      
      if (downloadUrl) {
        let rawSpecJson = null;
        let contentHash = null;
        let processingStatus = 'PENDING';
        let errorMessage = null;

        try {
          // Baixa o conteúdo (seja JSON ou YAML)
          const specResponse = await axios.get(downloadUrl, { 
            responseType: 'text',
            timeout: 10000 // 10s de timeout por especificação
          });

          // Converte YAML ou JSON texto para Objeto JS (JSON)
          rawSpecJson = parseContentToJson(specResponse.data);

          // Gera o Hash SHA256 do conteúdo baixado
          contentHash = generateSHA256(rawSpecJson);
          processingStatus = 'DOWNLOADED';
        } catch (fetchErr) {
          processingStatus = 'FAILED';
          errorMessage = `Erro ao baixar/converter especificação: ${fetchErr.message}`;
        }

        const specQuery = `
          INSERT INTO spec_files 
          (metadata_id, source_platform, api_version, openapi_version_declared, origin_url, download_url, content_format, raw_spec_content, status_processing, error_log, sha256_hash)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (sha256_hash) DO NOTHING;
        `;
        
        const format = versionObj.swaggerYamlUrl ? 'YAML' : 'JSON';
        const originUrl = versionObj.info?.['x-origin']?.[0]?.url || null;

        await pool.query(specQuery, [
          metadataId,
          'APIs.guru',
          preferredVer,
          versionObj.openapiVer || '2.0',
          originUrl,
          downloadUrl,
          format,
          rawSpecJson ? JSON.stringify(rawSpecJson) : null,
          processingStatus,
          errorMessage,
          contentHash
        ]);

        totalSpecsSaved++;
      }

      // Atualiza progresso incremental no job
      await pool.query(
        `UPDATE processing_jobs SET processed_records = $1 WHERE job_id = $2`,
        [totalMetadataSaved, jobId]
      );
    }

    // Finaliza o Job com SUCESSO
    await pool.query(
      `UPDATE processing_jobs 
       SET status = 'COMPLETED', finished_at = CURRENT_TIMESTAMP 
       WHERE job_id = $1`,
      [jobId]
    );

  } catch (error) {
    await pool.query(
      `UPDATE processing_jobs 
       SET status = 'FAILED', error_message = $1, finished_at = CURRENT_TIMESTAMP 
       WHERE job_id = $2`,
      [error.message, jobId]
    );
  }
}

async function getJobStatus(jobId) {
  const result = await pool.query(
    `SELECT job_id, job_type, status, total_records, processed_records, error_message, started_at, finished_at 
     FROM processing_jobs WHERE job_id = $1`,
    [jobId]
  );
  return result.rows[0];
}

async function clearAllIngestionData() {
  const query = `
    TRUNCATE TABLE provider_metadata, spec_files, processing_jobs RESTART IDENTITY CASCADE;
  `;
  await pool.query(query);
  return { message: 'Tabelas provider_metadata, spec_files e processing_jobs foram limpas com sucesso.' };
}

module.exports = { 
  fetchAndSaveGuruMetadata, 
  getJobStatus, 
  clearAllIngestionData 
};