// routes/sentinel2.js
const express = require('express');
const router = express.Router();

// Polyfills para Earth Engine
const { JSDOM } = require('jsdom');
const { window } = new JSDOM();
const { Buffer } = require('buffer');

global.document = window.document;
global.window = window;
global.self = window;
global.Buffer = Buffer;
global.fetch = require('node-fetch');

// Importa Earth Engine
const ee = require('@google/earthengine');

// Carga la cuenta de servicio desde variables de entorno
const serviceAccount = {
  project_id: process.env.EE_PROJECT_ID,
  client_email: process.env.EE_CLIENT_EMAIL,
  private_key: process.env.EE_PRIVATE_KEY.replace(/\\n/g, '\n')
};

let eeInitialized = false;

// Función para inicializar Earth Engine
async function initEarthEngine() {
  if (eeInitialized) return;
  
  return new Promise((resolve, reject) => {
    ee.data.authenticate({
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key,
      project: serviceAccount.project_id
    }, () => {
      ee.initialize(null, () => {
        console.log('✅ Earth Engine inicializado');
        eeInitialized = true;
        resolve();
      }, reject);
    }, reject);
  });
}

// Ruta POST para obtener imágenes de Sentinel-2
router.post('/sentinel2', async (req, res) => {
  try {
    const { coordinates } = req.body;

    if (!coordinates) {
      return res.status(400).json({ error: 'Faltan coordenadas' });
    }

    // Asegúrate de que Earth Engine esté inicializado
    await initEarthEngine();

    // Crea el área de interés
    const aoi = ee.Geometry.Polygon([coordinates]);

    // Filtra la colección de Sentinel-2
    const collection = ee.ImageCollection('COPERNICUS/S2_SR')
      .filterBounds(aoi)
      .filterDate('2024-01-01', '2024-06-01')
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
      .sort('CLOUDY_PIXEL_PERCENTAGE')
      .first();

    if (!collection) {
      return res.status(404).json({ error: 'No se encontraron imágenes' });
    }

    // Genera la URL de la imagen
    const thumbId = await new Promise((resolve, reject) => {
      collection.getThumbId({
        bands: ['B4', 'B3', 'B2'],
        min: 0,
        max: 3000,
        dimensions: '512x512',
        format: 'png'
      }, (err, thumbId) => {
        if (err) reject(err);
        else resolve(thumbId);
      });
    });

    const url = `https://earthengine.googleapis.com/api/thumb?thumbid=${thumbId.thumbid}`;

    res.json({ url });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

module.exports = router;