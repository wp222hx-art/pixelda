const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 3000;
const BACKEND_URL = 'http://localhost:8000';

// Proxy /api/* to backend (strip /api prefix)
app.use('/api', createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
}));

// Proxy /frames/* to backend
app.use('/frames', createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
}));

// Proxy /music/* to backend
app.use('/music', createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
}));

// Serve Angular static files
const staticDir = path.join(__dirname, 'projects/ui/dist/pixelda-ui/browser');
app.use(express.static(staticDir));

// SPA fallback - all other routes serve index.html
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`PiXelDa server running at http://0.0.0.0:${PORT}`);
  console.log(`  - Frontend: http://localhost:${PORT}`);
  console.log(`  - API proxy: /api/* -> ${BACKEND_URL}`);
});
