const SwaggerParser = require('@readme/openapi-parser');
const pool = require('../config/database');
const { generateSHA256 } = require('../utils/converter');

async function validateWithOpenApiParser(specJson) {
  try {
    const specCopy = JSON.parse(JSON.stringify(specJson));
    await SwaggerParser.validate(specCopy);
    return { valid: true };
  } catch (err) {
    return { 
      valid: false, 
      reason: err.message || 'Erro desconhecido na validação OpenAPI/Swagger' 
    };
  }
}

async function validateAndDeduplicateSpecs(batchSize = 1000) {
  // 1. Busca apenas as pendentes do lote atual
  const selectQuery = `
    SELECT spec_id, raw_spec_content, sha256_hash, download_url 
    FROM spec_files 
    WHERE status_processing IN ('PENDING', 'DOWNLOADED')
    LIMIT $1;
  `;

  const { rows: pendingSpecs } = await pool.query(selectQuery, [batchSize]);

  // 2. Processa o lote
  for (const spec of pendingSpecs) {
    let rawContent = spec.raw_spec_content;

    if (!rawContent) {
      await pool.query(
        `UPDATE spec_files 
         SET status_processing = 'CORRUPTED', error_log = 'Conteúdo da especificação está vazio/nulo' 
         WHERE spec_id = $1`,
        [spec.spec_id]
      );
      continue;
    }

    if (typeof rawContent === 'string') {
      try {
        rawContent = JSON.parse(rawContent);
      } catch (err) {
        await pool.query(
          `UPDATE spec_files 
           SET status_processing = 'CORRUPTED', error_log = 'Falha no parse do JSON armazenado' 
           WHERE spec_id = $1`,
          [spec.spec_id]
        );
        continue;
      }
    }

    const computedHash = spec.sha256_hash || generateSHA256(rawContent);
    const validationResult = await validateWithOpenApiParser(rawContent);

    if (validationResult.valid) {
      await pool.query(
        `UPDATE spec_files 
         SET status_processing = 'VALIDATED', 
             sha256_hash = $1, 
             error_log = NULL 
         WHERE spec_id = $2`,
        [computedHash, spec.spec_id]
      );
    } else {
      await pool.query(
        `UPDATE spec_files 
         SET status_processing = 'FAILED', 
             sha256_hash = $1, 
             error_log = $2 
         WHERE spec_id = $3`,
        [computedHash, validationResult.reason, spec.spec_id]
      );
    }
  }

  // 3. Consulta os totais globais acumulados na tabela spec_files
  const statsQuery = `
    SELECT 
      COUNT(*) FILTER (WHERE status_processing IN ('VALIDATED', 'FAILED', 'CORRUPTED')) AS total_processed,
      COUNT(*) FILTER (WHERE status_processing = 'VALIDATED') AS validated,
      COUNT(*) FILTER (WHERE status_processing = 'FAILED') AS failed,
      COUNT(*) FILTER (WHERE status_processing = 'CORRUPTED') AS corrupted,
      COUNT(*) FILTER (WHERE status_processing IN ('PENDING', 'DOWNLOADED')) AS remaining_pending
    FROM spec_files;
  `;

  const { rows } = await pool.query(statsQuery);
  const stats = rows[0];

  return {
    total_processed: parseInt(stats.total_processed, 10),
    validated: parseInt(stats.validated, 10),
    failed: parseInt(stats.failed, 10),
    corrupted: parseInt(stats.corrupted, 10),
    remaining_pending: parseInt(stats.remaining_pending, 10)
  };
}

module.exports = { validateAndDeduplicateSpecs };