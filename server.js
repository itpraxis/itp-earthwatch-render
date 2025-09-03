// server.js
require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(express.json({ limit: '10mb' }));

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'Backend funcionando' });
});

// Importa la ruta de Earth Engine
app.use('/api', require('./routes/sentinel2'));

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Inicia el servidor
app.listen(port, () => {
  console.log(`✅ Backend listo en http://localhost:${port}`);
});

module.exports = app;