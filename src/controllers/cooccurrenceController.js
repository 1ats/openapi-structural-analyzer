const cooccurrenceService = require('../services/cooccurrenceService');

async function generatePatterns(req, res) {
  try {
    const batchSize = req.query.batch_size ? parseInt(req.query.batch_size, 10) : 200;
    const result = await cooccurrenceService.generateCooccurrencePatterns(batchSize);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { generatePatterns };