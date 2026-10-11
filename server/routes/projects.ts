import { Router, Request, Response } from 'express';
import * as projectService from '../services/project.js';

const router = Router();

// GET /api/projects
router.get('/', async (_req: Request, res: Response) => {
  try {
    const projects = await projectService.getAllProjects();
    res.json(projects);
  } catch (error) {
    console.error('Failed to get projects:', error);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

// GET /api/projects/user-edits
router.get('/user-edits', async (_req: Request, res: Response) => {
  try {
    const project = await projectService.getOrCreateUserEditsProject();
    res.json(project);
  } catch (error) {
    console.error('Failed to get user-edits project:', error);
    res.status(500).json({ error: 'Failed to get user-edits project' });
  }
});

// GET /api/projects/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const project = await projectService.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (error) {
    console.error('Failed to get project:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// POST /api/projects
router.post('/', async (req: Request, res: Response) => {
  try {
    const project = await projectService.createProject(req.body);
    res.status(201).json(project);
  } catch (error) {
    console.error('Failed to create project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PATCH /api/projects/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const project = await projectService.updateProject(req.params.id, req.body);
    res.json(project);
  } catch (error) {
    console.error('Failed to update project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await projectService.deleteProject(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
