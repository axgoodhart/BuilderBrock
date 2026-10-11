import { Router, Request, Response } from 'express';
import * as artifactService from '../services/artifact.js';

const router = Router();

// GET /api/artifacts/:id/preview — serves raw HTML for iframe src
router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const artifact = await artifactService.getArtifact(req.params.id);
    if (!artifact) {
      res.status(404).send('Not found');
      return;
    }
    // If newlines were lost (e.g. pasted via Prisma Studio), JS single-line
    // comments (//) will comment out all subsequent code on the same line.
    // Fix by ensuring a newline exists before every // comment.
    let html = artifact.html;
    if (html.includes('//') && !html.includes('\n')) {
      html = html.replace(/ \/\//g, '\n//');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(html);
  } catch (error) {
    console.error('Failed to get artifact preview:', error);
    res.status(500).send('Error loading preview');
  }
});

// GET /api/artifacts/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const artifact = await artifactService.getArtifact(req.params.id);
    if (!artifact) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }
    res.json(artifact);
  } catch (error) {
    console.error('Failed to get artifact:', error);
    res.status(500).json({ error: 'Failed to get artifact' });
  }
});

// GET /api/artifacts/project/:projectId
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const includeDiscarded = req.query.includeDiscarded === 'true';
    const artifacts = await artifactService.getArtifactsByProject(
      req.params.projectId,
      includeDiscarded
    );
    res.json(artifacts);
  } catch (error) {
    console.error('Failed to get artifacts:', error);
    res.status(500).json({ error: 'Failed to get artifacts' });
  }
});

// POST /api/artifacts
router.post('/', async (req: Request, res: Response) => {
  try {
    const artifact = await artifactService.createArtifact(req.body);
    res.status(201).json(artifact);
  } catch (error) {
    console.error('Failed to create artifact:', error);
    res.status(500).json({ error: 'Failed to create artifact' });
  }
});

// POST /api/artifacts/sweep-interrupted — called once on client load
router.post('/sweep-interrupted', async (_req: Request, res: Response) => {
  try {
    const result = await artifactService.markInterrupted();
    res.json({ count: result.count });
  } catch (error) {
    console.error('Failed to sweep interrupted artifacts:', error);
    res.status(500).json({ error: 'Failed to sweep interrupted artifacts' });
  }
});

// PATCH /api/artifacts/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const artifact = await artifactService.updateArtifact(req.params.id, req.body);
    res.json(artifact);
  } catch (error) {
    console.error('Failed to update artifact:', error);
    res.status(500).json({ error: 'Failed to update artifact' });
  }
});

// POST /api/artifacts/:id/discard
router.post('/:id/discard', async (req: Request, res: Response) => {
  try {
    const artifact = await artifactService.discardArtifact(req.params.id);
    res.json(artifact);
  } catch (error) {
    console.error('Failed to discard artifact:', error);
    res.status(500).json({ error: 'Failed to discard artifact' });
  }
});

// POST /api/artifacts/:id/restore
router.post('/:id/restore', async (req: Request, res: Response) => {
  try {
    const artifact = await artifactService.restoreArtifact(req.params.id);
    res.json(artifact);
  } catch (error) {
    console.error('Failed to restore artifact:', error);
    res.status(500).json({ error: 'Failed to restore artifact' });
  }
});

// POST /api/artifacts/:id/revisions
router.post('/:id/revisions', async (req: Request, res: Response) => {
  try {
    const revision = await artifactService.createRevision({
      artifactId: req.params.id,
      ...req.body,
    });
    res.status(201).json(revision);
  } catch (error) {
    console.error('Failed to create revision:', error);
    res.status(500).json({ error: 'Failed to create revision' });
  }
});

// GET /api/artifacts/:id/revisions
router.get('/:id/revisions', async (req: Request, res: Response) => {
  try {
    const revisions = await artifactService.getRevisions(req.params.id);
    res.json(revisions);
  } catch (error) {
    console.error('Failed to get revisions:', error);
    res.status(500).json({ error: 'Failed to get revisions' });
  }
});

export default router;
