import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Register webmanifest mime type
express.static.mime.define({
  'application/manifest+json': ['webmanifest']
});

// Endpoint for environment configuration
app.get('/env-config.js', (req, res) => {
  res.type('application/javascript');
  let config = null;
  if (process.env.FIREBASE_CONFIG) {
    try {
      config = JSON.parse(process.env.FIREBASE_CONFIG);
    } catch (e) {
      console.error('Failed to parse FIREBASE_CONFIG', e);
    }
  } else if (process.env.FIREBASE_API_KEY) {
    config = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID
    };
  }
  const ownerEmail = process.env.OWNER_EMAIL || 'kindathanomsuck@gmail.com';
  res.send(`window.__FIREBASE_CONFIG__ = ${JSON.stringify(config)}; window.__OWNER_EMAIL__ = ${JSON.stringify(ownerEmail)};`);
});

// Serve static assets from project root
app.use(express.static(__dirname, {
  extensions: ['html'],
  index: 'index.html'
}));

// Route fallback for /admin and /admin/*
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// Root fallback for SPA routing
app.get('*', (req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'index.html'));
  } else {
    res.status(404).end();
  }
});

app.listen(PORT, HOST, () => {
  console.log(`LaoLao server running at http://${HOST}:${PORT}`);
});
