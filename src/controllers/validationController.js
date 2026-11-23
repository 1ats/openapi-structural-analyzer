const validationService = require('../services/validationService');

async function validateSpecs(req, res) {
  try {
    const batchSize = req.query.batch_size ? parseInt(req.query.batch_size, 10) : 1000;
    
    const result = await validationService.validateAndDeduplicateSpecs(batchSize);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { validateSpecs };