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

// Serve static assets from project root.
// env-config.js (Supabase URL + anon key) is served as-is, same as on GitHub Pages.
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
