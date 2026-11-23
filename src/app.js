const express = require('express');
const ingestionRoutes = require('./routes/ingestionRoutes');
const validationRoutes = require('./routes/validationRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const reportRoutes = require('./routes/reportRoutes'); // Rotas Finais de Relatório
const githubIngestionRoutes = require('./routes/githubIngestionRoutes');

const app = express();

app.use(express.json({ limit: '50mb' }));

// Rotas da API
app.use('/api/v1/ingestion', ingestionRoutes);
app.use('/api/v1/ingestion', githubIngestionRoutes);
app.use('/api/v1/processing', validationRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/reports', reportRoutes); // Registrar Relatórios


// Sua rota GET
/*app.delete('/ingestion/clear', ingestionRoutes, (req, res) => {
    // Esta mensagem vai aparecer apenas no terminal do seu servidor
    console.log('Chegou na rota com sucesso!'); 

    // Resposta para o cliente não ficar esperando para sempre
    res.send('Conexão estabelecida.');
}); */

module.exports = app;