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

// Carga la cuenta de servicio
const serviceAccount = {
  project_id: process.env.EE_PROJECT_ID,
  client_email: process.env.EE_CLIENT_EMAIL,
  private_key: process.env.EE_PRIVATE_KEY.replace(/\\n/g, '\n')
};

let eeInitialized = false;
let processing = false;
let lastResult = null;
let lastError = null;
let lastRequestTime = null;

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

// Ruta para iniciar el procesamiento
router.post('/sentinel2', async (req, res) => {
  try {
    const { coordinates } = req.body;

    if (!coordinates) {
      return res.status(400).json({ error: 'Faltan coordenadas' });
    }

    // Responde inmediatamente
    res.json({ 
      status: 'processing',
      message: 'El procesamiento ha comenzado. Verifica el estado en 2 minutos.',
      requestId: Date.now()
    });

    // Procesa en segundo plano
    processInBackground(coordinates);

  } catch (error) {
    console.error('❌ Error en solicitud:', error);
    // Igual responde al cliente
    res.status(500).json({ 
      error: 'Error interno',
      details: error.message 
    });
  }
});

// Ruta para obtener el resultado
router.get('/status', (req, res) => {
  if (lastResult) {
    res.json({ 
      status: 'completed', 
      result: lastResult,
      timestamp: lastRequestTime
    });
  } else if (lastError) {
    res.json({ 
      status: 'error', 
      error: lastError,
      timestamp: lastRequestTime
    });
  } else if (processing) {
    res.json({ 
      status: 'processing', 
      message: 'Aún procesando. Espera 2 minutos.' 
    });
  } else {
    res.json({ 
      status: 'idle', 
      message: 'No hay procesamiento activo' 
    });
  }
});

// Función de procesamiento en segundo plano
async function processInBackground(coordinates) {
  try {
    console.log('🔄 Iniciando procesamiento en segundo plano...');
    processing = true;
    lastError = null;
    lastRequestTime = new Date().toISOString();

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
      lastError = 'No se encontraron imágenes';
      console.log('❌ No se encontraron imágenes');
      return;
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
    
    lastResult = { url };
    console.log('✅ Procesamiento completado:', url);

  } catch (error) {
    lastError = error.message;
    console.error('❌ Error en procesamiento:', error);
  } finally {
    processing = false;
  }
}

module.exports = router;