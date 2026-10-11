import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import projectRoutes from './routes/projects.js';
import artifactRoutes from './routes/artifacts.js';
import sceneRoutes from './routes/scene.js';
import assetRoutes from './routes/assets.js';
import packagerRoutes from './routes/packager.js';
import spriteRoutes from './routes/sprites.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' }));

app.use('/api/projects', projectRoutes);
app.use('/api/artifacts', artifactRoutes);
app.use('/api/scene', sceneRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/packager', packagerRoutes);
app.use('/api/sprites', spriteRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Production: serve the built frontend (vite dist) with SPA fallback.
const DIST = path.join(PROJECT_ROOT, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`builderBrock API running on http://localhost:${PORT}`);
});
