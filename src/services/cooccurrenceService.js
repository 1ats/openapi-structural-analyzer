const pool = require('../config/database');

async function generateCooccurrencePatterns(batchSize = 200) {
  const client = await pool.connect();

  try {
    // 1. Executa um lote de processamento via stored procedure
    const batchQuery = 'SELECT * FROM upsert_cooccurrence_batch($1);';
    const { rows } = await client.query(batchQuery, [batchSize]);
    
    const processedSpecs = parseInt(rows[0].processed_specs, 10);

    // 2. Recalcula as frequências relativas (%) globais para os padrões ativos
    if (processedSpecs > 0) {
      const updatePercentageQuery = `
        WITH total_parsed AS (
          SELECT COUNT(DISTINCT spec_id)::NUMERIC AS total_specs FROM parsed_specs
        )
        UPDATE cooccurrence_patterns
        SET percentage = ROUND((cooccurrence_count / total_parsed.total_specs) * 100, 2)
        FROM total_parsed
        WHERE component_type_a != 'SYSTEM';
      `;
      await client.query(updatePercentageQuery);
    }

    // 3. Consulta totais consolidados
    const statsQuery = `
      SELECT 
        COUNT(*) AS patterns_discovered,
        (SELECT COUNT(DISTINCT spec_id) FROM parsed_specs) AS total_specs
      FROM cooccurrence_patterns 
      WHERE component_type_a != 'SYSTEM';
    `;
    const stats = await client.query(statsQuery);

    return {
      specs_processed_in_this_batch: processedSpecs,
      patterns_discovered: parseInt(stats.rows[0].patterns_discovered, 10),
      message: processedSpecs > 0 
        ? `Lote de ${processedSpecs} especificações processado com sucesso.` 
        : 'Todas as especificações validadas já foram analisadas!'
    };

  } finally {
    client.release();
  }
}

module.exports = { generateCooccurrencePatterns };