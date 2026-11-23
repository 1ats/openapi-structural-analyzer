
const pool = require('../config/database');

/**
 * Retorna dados estatísticos globais do ecossistema e do pipeline
 * (Mantido exatamente como estava)
 */
async function getSummaryReport() {
  const query = `
    SELECT 
      (SELECT COUNT(*) FROM provider_metadata) AS total_providers,
      (SELECT COUNT(*) FROM spec_files) AS total_specs_collected,
      (SELECT COUNT(*) FROM spec_files WHERE status_processing = 'VALIDATED') AS total_specs_validated,
      (SELECT COUNT(*) FROM spec_files WHERE status_processing = 'FAILED') AS total_specs_failed,
      (SELECT COUNT(*) FROM spec_files WHERE status_processing = 'CORRUPTED') AS total_specs_corrupted,
      (SELECT COUNT(*) FROM parsed_specs) AS total_specs_parsed,
      (SELECT COUNT(*) FROM extracted_components) AS total_components_extracted;
  `;

  const { rows } = await pool.query(query);
  const data = rows[0];

  // Agrupamento por versão OAS
  const versionQuery = `
    SELECT oas_version, COUNT(*) AS count
    FROM parsed_specs
    GROUP BY oas_version
    ORDER BY count DESC;
  `;
  const { rows: versions } = await pool.query(versionQuery);

  return {
    overview: {
      total_providers: parseInt(data.total_providers, 10),
      total_specs_collected: parseInt(data.total_specs_collected, 10),
      total_specs_validated: parseInt(data.total_specs_validated, 10),
      total_specs_failed: parseInt(data.total_specs_failed, 10),
      total_specs_corrupted: parseInt(data.total_specs_corrupted, 10),
      total_specs_parsed: parseInt(data.total_specs_parsed, 10),
      total_components_extracted: parseInt(data.total_components_extracted, 10)
    },
    version_distribution: versions
  };
}

/**
 * Retorna os objetos raízes e seus componentes internos agrupados em estrutura hierárquica.
 * Ordena os raízes pelo mais frequente e os internos dentro de cada raiz do mais para o menos frequente.
 */
async function getHierarchicalComponentRankings(limit = null, componentType = null) {
  let query = `
    WITH total_parsed AS (
      SELECT COUNT(*)::NUMERIC AS total FROM parsed_specs
    ),
    root_frequencies AS (
      SELECT 
        ec.component_type,
        COUNT(DISTINCT ec.spec_id) AS root_abs_freq,
        ROUND((COUNT(DISTINCT ec.spec_id) / tp.total) * 100, 2) AS root_rel_perc
      FROM extracted_components ec
      CROSS JOIN total_parsed tp
      ${componentType ? 'WHERE ec.component_type = $1' : ''}
      GROUP BY ec.component_type, tp.total
    ),
    intern_frequencies AS (
      SELECT 
        ec.component_type,
        ec.component_name,
        COUNT(DISTINCT ec.spec_id) AS intern_abs_freq,
        ROUND((COUNT(DISTINCT ec.spec_id) / tp.total) * 100, 2) AS intern_rel_perc
      FROM extracted_components ec
      CROSS JOIN total_parsed tp
      ${componentType ? 'WHERE ec.component_type = $1' : ''}
      GROUP BY ec.component_type, ec.component_name, tp.total
    )
    SELECT 
      rf.component_type,
      rf.root_abs_freq AS absolute_frequency,
      rf.root_rel_perc AS relative_frequency_percentage,
      json_agg(
        json_build_object(
          'component_name', ifreq.component_name,
          'absolute_frequency', ifreq.intern_abs_freq,
          'relative_frequency_percentage', ifreq.intern_rel_perc
        ) ORDER BY ifreq.intern_abs_freq DESC
      ) AS intern_components
    FROM root_frequencies rf
    JOIN intern_frequencies ifreq ON rf.component_type = ifreq.component_type
    GROUP BY rf.component_type, rf.root_abs_freq, rf.root_rel_perc
    ORDER BY rf.root_abs_freq DESC
  `;

  const params = [];
  if (componentType) {
    params.push(componentType.toUpperCase());
  }

  if (limit && Number(limit) > 0) {
    params.push(parseInt(limit, 10));
    query += ` LIMIT $${params.length}`;
  }

  query += `;`;

  const { rows } = await pool.query(query, params);
  return rows;
}

module.exports = { 
  getSummaryReport, 
  getComponentRankings: getHierarchicalComponentRankings 
};