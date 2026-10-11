import { Router, Request, Response } from 'express';
import * as sceneHistory from '../services/sceneHistory.js';

const router = Router();

const handle = (fn: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response) => {
        try { await fn(req, res); } catch (e: any) {
            console.error('scene route error:', e);
            res.status(500).json({ error: e.message || 'scene operation failed' });
        }
    };

/* Branches */
router.get('/artifacts/:artifactId/branches', handle(async (req, res) => {
    res.json(await sceneHistory.listBranches(String(req.params.artifactId)));
}));

router.post('/artifacts/:artifactId/branches', handle(async (req, res) => {
    res.status(201).json(await sceneHistory.createBranch(
        String(req.params.artifactId), req.body.name || 'branch', req.body.parentRevisionId ?? null,
    ));
}));

router.get('/artifacts/:artifactId/branches/main', handle(async (req, res) => {
    res.json(await sceneHistory.getOrCreateMainBranch(String(req.params.artifactId)));
}));

/* Revisions */
router.get('/branches/:branchId/head', handle(async (req, res) => {
    res.json(await sceneHistory.getHeadRevision(String(req.params.branchId)));
}));

router.post('/revisions', handle(async (req, res) => {
    res.status(201).json(await sceneHistory.createRevision(req.body));
}));

router.get('/artifacts/:artifactId/revisions', handle(async (req, res) => {
    res.json(await sceneHistory.listRevisions(
        String(req.params.artifactId),
        req.query.branchId ? String(req.query.branchId) : undefined,
    ));
}));

router.post('/revisions/:id/promote', handle(async (req, res) => {
    res.json(await sceneHistory.promoteRevision(
        String(req.params.id), req.body.toBranchId, req.body.prompt || 'Use this version',
    ));
}));

/* Conversations & messages */
router.post('/artifacts/:artifactId/conversation', handle(async (req, res) => {
    res.json(await sceneHistory.getOrCreateConversation(
        String(req.params.artifactId), req.body.branchId ?? null,
    ));
}));

router.post('/conversations/:id/messages', handle(async (req, res) => {
    res.status(201).json(await sceneHistory.addMessage({
        conversationId: String(req.params.id),
        role: req.body.role,
        text: req.body.text ?? '',
        operations: req.body.operations ?? null,
        explanation: req.body.explanation ?? null,
        beforeRevisionId: req.body.beforeRevisionId ?? null,
        afterRevisionId: req.body.afterRevisionId ?? null,
        status: req.body.status || 'pending',
        model: req.body.model ?? null,
    }));
}));

router.patch('/messages/:id', handle(async (req, res) => {
    res.json(await sceneHistory.updateMessage(String(req.params.id), req.body));
}));

export default router;
