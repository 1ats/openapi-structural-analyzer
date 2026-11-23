const axios = require('axios');
const pool = require('../config/database');
const { parseContentToJson, generateSHA256 } = require('../utils/converter');
require('dotenv').config();

// Instância do Axios pré-configurada para a API do GitHub
const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'OpenAPI-Spec-Collector-App'
  }
});

// Função utilitária de pausa (delay)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Clean rigoroso de caracteres nulos \u0000 e controlo de codificação para o PostgreSQL
 */
function cleanNullBytes(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\u0000/g, '').replace(/\\u0000/g, '');
}

/**
 * Converte qualquer objeto para JSON String 100% livre de bytes \u0000
 */
function safeJsonStringify(obj) {
  if (!obj) return null;
  const jsonString = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return cleanNullBytes(jsonString);
}

/**
 * Converte a URL do repositório no GitHub para a URL crua (raw) de download
 */
function convertToRawUrl(htmlUrl) {
  return htmlUrl
    .replace('github.com', 'raw.githubusercontent.com')
    .replace('/blob/', '/');
}

/**
 * Coleta arquivos de especificação OpenAPI do GitHub
 */
async function fetchAllGitHubSpecs(jobId) {
  const queries = [
    'openapi 3.0 filename:openapi extension:json',
    'openapi 3.0 filename:openapi extension:yaml',
    'openapi 3.0 filename:openapi extension:yml',
    'openapi 3.0 filename:swagger extension:json',
    'openapi 3.0 filename:swagger extension:yaml',
    'openapi 3.1 filename:openapi extension:json',
    'openapi 3.1 filename:openapi extension:yaml',
    'swagger 2.0 filename:swagger extension:json',
    'swagger 2.0 filename:swagger extension:yaml'
  ];

  let totalCollected = 0;

  for (const q of queries) {
    try {
      console.log(`Buscando no GitHub com a query: "${q}"...`);

      const response = await githubApi.get('/search/code', {
        params: { q, per_page: 100 }
      });

      const items = response.data.items || [];

      for (const item of items) {
        try {
          const repo = item.repository || {};
          const rawUrl = convertToRawUrl(item.html_url);
          const format = item.name.endsWith('.json') ? 'JSON' : 'YAML';

          // 1. Salva/Atualiza o Provedor na camada provider_metadata com sanitização estrita
          const metadataQuery = `
            INSERT INTO provider_metadata 
            (source_platform, provider_key, api_title, provider_name, service_name, preferred_version, categories, raw_json)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id;
          `;

          const metaRes = await pool.query(metadataQuery, [
            'GitHub',
            cleanNullBytes(repo.full_name || item.path),
            cleanNullBytes(item.name),
            cleanNullBytes(repo.owner?.login || 'GitHub User'),
            cleanNullBytes(repo.name || 'Repository'),
            '1.0.0',
            JSON.stringify(['GitHub Search']),
            safeJsonStringify(item) // <- Limpa qualquer \u0000 do payload de metadados
          ]);

          const metadataId = metaRes.rows[0].id;

          // 2. Baixa o conteúdo bruto (RAW)
          let rawSpecJson = null;
          let contentHash = null;
          let processingStatus = 'PENDING';
          let errorMessage = null;

          try {
            const rawResponse = await axios.get(rawUrl, {
              responseType: 'text',
              timeout: 10000
            });

            // Limpa a string crua imediatamente após o download
            const cleanRawText = cleanNullBytes(String(rawResponse.data));

            rawSpecJson = parseContentToJson(cleanRawText);
            contentHash = generateSHA256(rawSpecJson);
            processingStatus = 'DOWNLOADED';
          } catch (downloadErr) {
            processingStatus = 'FAILED';
            errorMessage = cleanNullBytes(`Erro ao baixar/converter do GitHub: ${downloadErr.message}`);
          }

          // 3. Insere na tabela spec_files com sanitização estrita
          const specQuery = `
            INSERT INTO spec_files 
            (metadata_id, source_platform, api_version, openapi_version_declared, origin_url, download_url, content_format, raw_spec_content, status_processing, error_log, sha256_hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (sha256_hash) DO NOTHING;
          `;

          const declaredVer = rawSpecJson?.openapi || rawSpecJson?.swagger || '3.0.0';

          await pool.query(specQuery, [
            metadataId,
            'GitHub',
            '1.0.0',
            cleanNullBytes(declaredVer),
            cleanNullBytes(item.html_url),
            cleanNullBytes(rawUrl),
            format,
            safeJsonStringify(rawSpecJson), // <- Limpa qualquer \u0000 da especificação
            processingStatus,
            errorMessage,
            contentHash
          ]);

          totalCollected++;

        } catch (itemErr) {
          console.error(`Erro ao processar item do GitHub (${item.html_url}):`, itemErr.message);
        }
      }

      // Intervalo para respeitar o Rate Limit (30 req/min)
      await delay(2000);

    } catch (error) {
      if (error.response && error.response.status === 403) {
        console.warn('Rate limit atingido! Aguardando 10 segundos...');
        await delay(10000);
      } else {
        console.error(`Erro na busca com a query "${q}":`, error.message);
      }
    }
  }

  // Atualiza o Job de Ingestão
  if (jobId) {
    await pool.query(
      `UPDATE processing_jobs 
       SET status = 'COMPLETED', processed_records = $1, finished_at = CURRENT_TIMESTAMP 
       WHERE job_id = $2`,
      [totalCollected, jobId]
    );
  }

  return { total_collected: totalCollected };
}

module.exports = { fetchAllGitHubSpecs };