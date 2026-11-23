const pool = require('../config/database');

/**
 * Busca o catálogo de objetos cadastrado no banco de dados PostgreSQL
 */
async function getOasCatalog() {
  const { rows } = await pool.query('SELECT * FROM oas_object_catalog');
  return rows;
}

/**
 * Recupera um valor de um objeto JSON usando notação de ponto (ex: 'components.schemas')
 */
function getValueByPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

/**
 * Normaliza o nome do componente de 2º nível conforme a taxonomia definida:
 * - Extensões: qualquer chave que comece com "x-" vira "^x-"
 * - Rotas (PATH): "/" mantém "/", qualquer outra rota vira "/{path}"
 * - Webhooks: chaves arbitrárias do mapa viram "map"
 * - Mapas nomeados pelo usuário (PARAMETER, RESPONSE, SECURITY, DEFINITION, etc.): viram "{name}"
 */
function normalizeComponentName(rawName, normalizedType) {
  if (rawName === null || rawName === undefined) return rawName;

  const nameStr = typeof rawName === 'string' ? rawName : String(rawName);

  // 1. Regra universal para Extensões OpenAPI (^x-)
  if (nameStr.toLowerCase().startsWith('x-')) {
    return '^x-';
  }

  // 2. Regra para Objetos do tipo PATH
  if (normalizedType === 'PATH') {
    if (nameStr === '/') return '/';
    return '/{path}';
  }

  // 3. Regra para Objetos do tipo WEBHOOK (Map[string, Path Item Object])
  if (normalizedType === 'WEBHOOK') {
    return 'map';
  }

  // 4. Regra para Objetos do tipo Mapa de Nomes ({name})
  const mapNameTypes = [
    'PARAMETER', 
    'RESPONSE', 
    'SECURITY_SCHEME', 
    'SECURITY', 
    'DEFINITION', 
    'SECURITY_DEFINITION'
  ];

  if (mapNameTypes.includes(normalizedType)) {
    return '{name}';
  }

  return nameStr;
}

/**
 * Mapeia e extrai componentes utilizando o catálogo de referência (limitando rigorosamente ao 2º nível)
 */
function extractComponentsWithCatalog(specJson, catalog) {
  const components = [];
  let totalPaths = 0;
  let totalOperations = 0;
  let totalSchemas = 0;
  let hasSecurity = false;

  if (!specJson || typeof specJson !== 'object') {
    return {
      oasVersion: 'UNKNOWN',
      totalPaths: 0,
      totalOperations: 0,
      totalSchemas: 0,
      hasSecurity: false,
      components: []
    };
  }

  const rawSwagger = specJson.swagger ? String(specJson.swagger) : null;
  const rawOpenApi = specJson.openapi ? String(specJson.openapi) : null;
  
  const rawVersion = rawOpenApi || rawSwagger || '2.0';
  const isV2 = Boolean(rawSwagger && rawSwagger.startsWith('2'));

  for (const item of catalog) {
    const targetPath = isV2 ? item.path_v2 : item.path_v3;
    if (!targetPath) continue;

    const rawData = getValueByPath(specJson, targetPath);
    if (!rawData) continue;

    // --- 1. Mapeamento de PATHS ---
    if (item.normalized_type === 'PATH' && typeof rawData === 'object') {
      const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace', 'query'];

      for (const [pathName, pathObj] of Object.entries(rawData)) {
        if (!pathObj || typeof pathObj !== 'object') continue;
        
        totalPaths++;
        const normalizedName = normalizeComponentName(pathName, 'PATH');

        components.push({
          type: 'PATH',
          name: normalizedName,
          details: null
        });

        for (const method of httpMethods) {
          if (pathObj[method] && typeof pathObj[method] === 'object') {
            totalOperations++;
            if (pathObj[method].security && pathObj[method].security.length > 0) {
              hasSecurity = true;
            }
          }
        }
      }
      continue;
    }

    // --- 2. Mapeamento de WEBHOOKS ---
    if (item.normalized_type === 'WEBHOOK' && typeof rawData === 'object') {
      for (const [webhookName] of Object.entries(rawData)) {
        const normalizedName = normalizeComponentName(webhookName, 'WEBHOOK');
        components.push({
          type: 'WEBHOOK',
          name: normalizedName,
          details: null
        });
      }
      continue;
    }

    // --- 3. Mapeamento de SERVER (Propriedades: url, description, variables ou ^x-) ---
    if (item.normalized_type === 'SERVER') {
      if (isV2) {
        // No Swagger 2.0 (host, basePath, schemes), qualquer ocorrência mapeia para a propriedade 'url'
        components.push({
          type: 'SERVER',
          name: 'url',
          details: null
        });
      } else {
        const serversList = Array.isArray(rawData) ? rawData : [rawData];
        
        for (const serverObj of serversList) {
          if (!serverObj) continue;

          if (typeof serverObj === 'string') {
            // Se for apenas uma string com a URL (ex: "http://localhost:3000")
            components.push({
              type: 'SERVER',
              name: 'url',
              details: null
            });
          } else if (typeof serverObj === 'object') {
            // Itera sobre as chaves do Server Object: url, description, variables, x-*
            for (const key of Object.keys(serverObj)) {
              const normalizedName = normalizeComponentName(key, 'SERVER');
              components.push({
                type: 'SERVER',
                name: normalizedName,
                details: null
              });
            }
          }
        }
      }
      continue;
    }

    // --- 4. Mapeamento de TAG (Propriedades: name, description, externalDocs, summary, parent, kind ou ^x-) ---
    if (item.normalized_type === 'TAG') {
      const tagsList = Array.isArray(rawData) ? rawData : [rawData];

      for (const tagItem of tagsList) {
        if (!tagItem) continue;

        if (typeof tagItem === 'string') {
          // Quando tags é uma lista de strings simples (ex: tags: ["projects", "users"])
          // A string em si é o VALOR da tag, logo a propriedade do 2º nível é 'name'
          components.push({
            type: 'TAG',
            name: 'name',
            details: null
          });
        } else if (typeof tagItem === 'object') {
          // Quando tagItem é um Tag Object estruturado ({ name: "...", description: "..." })
          for (const key of Object.keys(tagItem)) {
            const normalizedName = normalizeComponentName(key, 'TAG');
            components.push({
              type: 'TAG',
              name: normalizedName,
              details: null
            });
          }
        }
      }
      continue;
    }

    // --- 5. Mapeamento de SCHEMAS / DEFINITIONS ---
    if ((item.normalized_type === 'SCHEMA' || item.normalized_type === 'DEFINITION') && typeof rawData === 'object') {
      for (const [schemaName] of Object.entries(rawData)) {
        totalSchemas++;
        const normalizedName = normalizeComponentName(schemaName, item.normalized_type);
        components.push({
          type: item.normalized_type,
          name: normalizedName,
          details: null
        });
      }
      continue;
    }

    // --- 6. Mapeamento dos demais Objetos (INFO, EXTERNAL_DOCS, COMPONENT, PARAMETER, RESPONSE, etc.) ---
    if (typeof rawData === 'object' && !Array.isArray(rawData)) {
      for (const [compName] of Object.entries(rawData)) {
        if (item.normalized_type === 'SECURITY' || item.normalized_type === 'SECURITY_SCHEME') {
          hasSecurity = true;
        }

        const normalizedName = normalizeComponentName(compName, item.normalized_type);

        components.push({
          type: item.normalized_type,
          name: normalizedName,
          details: null
        });
      }
    } else if (Array.isArray(rawData)) {
      for (const elem of rawData) {
        if (!elem) continue;
        
        // Se o elemento do array for um objeto, itera em suas chaves; se for string, usa fallback apropriado
        if (typeof elem === 'object') {
          for (const key of Object.keys(elem)) {
            const normalizedName = normalizeComponentName(key, item.normalized_type);
            components.push({
              type: item.normalized_type,
              name: normalizedName,
              details: null
            });
          }
        } else {
          const normalizedName = normalizeComponentName(elem, item.normalized_type);
          components.push({
            type: item.normalized_type,
            name: normalizedName,
            details: null
          });
        }
      }
    }
  }

  if (specJson.security && Array.isArray(specJson.security) && specJson.security.length > 0) {
    hasSecurity = true;
  }

  return {
    oasVersion: rawVersion,
    totalPaths,
    totalOperations,
    totalSchemas,
    hasSecurity,
    components
  };
}

async function parseValidatedSpecs(batchSize = 1000) {
  const client = await pool.connect();

  try {
    const catalog = await getOasCatalog();

    const selectQuery = `
      SELECT sf.spec_id, sf.raw_spec_content 
      FROM spec_files sf
      LEFT JOIN parsed_specs ps ON sf.spec_id = ps.spec_id
      WHERE sf.status_processing = 'VALIDATED' AND ps.spec_id IS NULL
      LIMIT $1;
    `;

    const { rows: specsToParse } = await client.query(selectQuery, [batchSize]);

    let specsParsedCount = 0;
    let totalComponentsCount = 0;

    for (const spec of specsToParse) {
      let rawContent = spec.raw_spec_content;
      if (typeof rawContent === 'string') {
        rawContent = JSON.parse(rawContent);
      }

      const extracted = extractComponentsWithCatalog(rawContent, catalog);

      await client.query('BEGIN');

      const insertParsedQuery = `
        INSERT INTO parsed_specs (spec_id, oas_version, total_paths, total_operations, total_schemas, has_security)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (spec_id) DO UPDATE 
        SET oas_version = EXCLUDED.oas_version,
            total_paths = EXCLUDED.total_paths,
            total_operations = EXCLUDED.total_operations,
            total_schemas = EXCLUDED.total_schemas,
            has_security = EXCLUDED.has_security;
      `;

      await client.query(insertParsedQuery, [
        spec.spec_id,
        extracted.oasVersion,
        extracted.totalPaths,
        extracted.totalOperations,
        extracted.totalSchemas,
        extracted.hasSecurity
      ]);

      if (extracted.components.length > 0) {
        for (const comp of extracted.components) {
          const insertCompQuery = `
            INSERT INTO extracted_components (spec_id, component_type, component_name, details_json)
            VALUES ($1, $2, $3, $4);
          `;
          await client.query(insertCompQuery, [
            spec.spec_id,
            comp.type,
            comp.name,
            comp.details ? JSON.stringify(comp.details) : null
          ]);
        }
      }

      await client.query('COMMIT');

      specsParsedCount++;
      totalComponentsCount += extracted.components.length;
    }

    const statsQuery = `
      SELECT 
        COUNT(DISTINCT spec_id) AS specs_parsed,
        (SELECT COUNT(*) FROM extracted_components) AS total_components_extracted
      FROM parsed_specs;
    `;

    const { rows: statsRows } = await client.query(statsQuery);
    const stats = statsRows[0];

    return {
      specs_parsed: parseInt(stats.specs_parsed || 0, 10),
      total_components_extracted: parseInt(stats.total_components_extracted || 0, 10)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { parseValidatedSpecs };