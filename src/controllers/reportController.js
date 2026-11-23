const reportService = require('../services/reportService');

async function getSummary(req, res) {
  try {
    const summary = await reportService.getSummaryReport();
    return res.status(200).json(summary);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getRankings(req, res) {
  try {
    const limitParam = req.query.limit;

    // Se a query ?limit não for informada ou for 'all', passa null (retorna todos os objetos sem limite)
    // Caso contrário, converte para número
    const limit = (limitParam && limitParam.toLowerCase() !== 'all')
      ? parseInt(limitParam, 10)
      : null;

    const type = req.query.type || null; // Ex: ?type=INFO ou ?type=COMPONENT

    const rankings = await reportService.getComponentRankings(limit, type);

    return res.status(200).json({
      total_returned: rankings.length,
      rankings
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { getSummary, getRankings };