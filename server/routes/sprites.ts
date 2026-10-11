/**
 * Sprite Studio frame storage: PNGs on disk, content-addressed, so a session's
 * artifact JSON stores short URLs instead of megabytes of base64.
 */
import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = Router();
const FRAMES_DIR = path.resolve(process.cwd(), 'prisma', 'data', 'sprites');
if (!fs.existsSync(FRAMES_DIR)) fs.mkdirSync(FRAMES_DIR, { recursive: true });

// POST /api/sprites/frames — { base64 } → { url }
router.post('/frames', (req: Request, res: Response) => {
    const { base64 } = req.body ?? {};
    if (typeof base64 !== 'string' || !base64) { res.status(400).json({ error: 'base64 required' }); return; }
    const buf = Buffer.from(base64, 'base64');
    const id = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
    const file = path.join(FRAMES_DIR, `${id}.png`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, buf);
    res.status(201).json({ url: `/api/sprites/frames/${id}.png` });
});

// GET /api/sprites/frames/:file — immutable PNG
router.get('/frames/:file', (req: Request, res: Response) => {
    const name = String(req.params.file);
    if (!/^[0-9a-f]{32}\.png$/.test(name)) { res.status(400).json({ error: 'bad frame id' }); return; }
    const file = path.join(FRAMES_DIR, name);
    if (!fs.existsSync(file)) { res.status(404).json({ error: 'frame missing' }); return; }
    res.sendFile(file, { maxAge: '1y', immutable: true });
});

export default router;
