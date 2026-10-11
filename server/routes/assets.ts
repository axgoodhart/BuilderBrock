/**
 * Omneon asset library: one AssetSource seam with two real adapters —
 * Local Files (the BuilderBrock data directory) and MCP (server-owned
 * connections). Browsing an MCP source is read-only; "Import" copies the
 * asset locally so history and packaging never depend on a remote source.
 */
import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import prisma from '../lib/db.js';

const router = Router();
const ASSETS_DIR = path.resolve(process.cwd(), 'prisma', 'data', 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

const handle = (fn: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response) => {
        try { await fn(req, res); } catch (e: any) {
            res.status(500).json({ error: e.message || 'asset operation failed' });
        }
    };

function kindFor(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    if (['.glb', '.gltf'].includes(ext)) return 'model';
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return 'texture';
    if (['.hdr', '.exr'].includes(ext)) return 'hdr';
    if (['.mp3', '.wav', '.ogg'].includes(ext)) return 'audio';
    if (['.js', '.mjs', '.ts'].includes(ext)) return 'script';
    return 'other';
}

function thumbFor(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return null;
    try {
        const buf = fs.readFileSync(filePath);
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
        return null;
    }
}

/* ------------------------------ Local adapter --------------------------- */

// GET /api/assets/local — browse the local assets directory (recursive)
router.get('/local', handle(async (_req, res) => {
    const walk = (dir: string): any[] => {
        if (!fs.existsSync(dir)) return [];
        const out: any[] = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) out.push(...walk(full));
            else {
                const rel = path.relative(ASSETS_DIR, full);
                out.push({
                    name: entry.name,
                    path: rel,
                    sizeBytes: fs.statSync(full).size,
                    kind: kindFor(entry.name),
                });
            }
        }
        return out;
    };
    res.json(walk(ASSETS_DIR));
}));

// POST /api/assets/import-local — copy a file into the library (multipart-less:
// client sends base64 content; keeps this adapter server-only and simple)
router.post('/import-local', handle(async (req, res) => {
    const { name, contentBase64, metadata } = req.body;
    if (!name || !contentBase64) { res.status(400).json({ error: 'name and contentBase64 required' }); return; }
    const safeName = path.basename(name);
    const hash = crypto.createHash('sha256').update(Buffer.from(contentBase64, 'base64')).digest('hex').slice(0, 16);
    const fileName = `${hash}-${safeName}`;
    const filePath = path.join(ASSETS_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(contentBase64, 'base64'));
    const asset = await prisma.asset.create({
        data: {
            name: safeName,
            kind: kindFor(safeName),
            origin: 'local',
            originUri: filePath,
            hash,
            path: fileName,
            sizeBytes: fs.statSync(filePath).size,
            thumbnail: thumbFor(filePath),
            metadata: metadata ? JSON.stringify(metadata) : null,
        },
    });
    res.status(201).json(asset);
}));

/* ------------------------------- MCP adapter ---------------------------- */

let mcpClient: any = null;
let mcpTransport: any = null;
let mcpConfig: { command?: string; args?: string[]; url?: string } | null = null;

async function ensureMcpClient(): Promise<any> {
    if (mcpClient) return mcpClient;
    if (!mcpConfig) throw new Error('MCP not configured — set a command/args or url first');
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    if (mcpConfig.url) {
        const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
        mcpTransport = new StreamableHTTPClientTransport(new URL(mcpConfig.url));
    } else {
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        mcpTransport = new StdioClientTransport({ command: mcpConfig.command!, args: mcpConfig.args || [] });
    }
    mcpClient = new Client({ name: 'builderbrock-omneon', version: '1.0.0' });
    await mcpClient.connect(mcpTransport);
    return mcpClient;
}

// POST /api/assets/mcp/configure — server-owned connection config
router.post('/mcp/configure', handle(async (req, res) => {
    if (mcpClient) { try { await mcpClient.close(); } catch { /* ignore */ } mcpClient = null; mcpTransport = null; }
    mcpConfig = req.body || null;
    if (mcpConfig) {
        await ensureMcpClient();
        const caps = await mcpClient.listResources().catch(() => ({ resources: [] }));
        res.json({ ok: true, resources: caps.resources?.length || 0 });
    } else {
        res.json({ ok: true });
    }
}));

// GET /api/assets/mcp/resources — read-only browse of MCP resources
router.get('/mcp/resources', handle(async (_req, res) => {
    const client = await ensureMcpClient();
    const out = await client.listResources();
    res.json(out.resources || []);
}));

// POST /api/assets/mcp/import — copy an MCP resource into the local library
router.post('/mcp/import', handle(async (req, res) => {
    const { uri } = req.body;
    if (!uri) { res.status(400).json({ error: 'uri required' }); return; }
    const client = await ensureMcpClient();
    const content = await client.readResource({ uri });
    const parts = content.contents || [];
    if (!parts.length) { res.status(404).json({ error: 'resource empty' }); return; }
    const part = parts[0];
    const blob = part.blob ? Buffer.from(part.blob, 'base64') : Buffer.from(String(part.text || ''), 'utf8');
    const name = path.basename(uri.split('?')[0].split('/').pop() || 'asset');
    const safeName = path.basename(name);
    const hash = crypto.createHash('sha256').update(blob).digest('hex').slice(0, 16);
    const fileName = `${hash}-${safeName}`;
    const filePath = path.join(ASSETS_DIR, fileName);
    fs.writeFileSync(filePath, blob);
    const asset = await prisma.asset.create({
        data: {
            name: safeName,
            kind: kindFor(safeName),
            origin: 'mcp',
            originUri: uri,
            hash,
            path: fileName,
            sizeBytes: blob.length,
            thumbnail: thumbFor(filePath),
        },
    });
    res.status(201).json(asset);
}));

/* ------------------------------ Library CRUD ---------------------------- */

// GET /api/assets — all imported assets, searchable by name/kind/origin
router.get('/', handle(async (req, res) => {
    const q = String(req.query.q || '').toLowerCase();
    const assets = await prisma.asset.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(q ? assets.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.kind.toLowerCase().includes(q) ||
        a.origin.toLowerCase().includes(q)
    ) : assets);
}));

// GET /api/assets/:id/file — stream the binary
router.get('/:id/file', handle(async (req, res) => {
    const asset = await prisma.asset.findUnique({ where: { id: String(req.params.id) } });
    if (!asset) { res.status(404).json({ error: 'not found' }); return; }
    const full = path.join(ASSETS_DIR, asset.path);
    if (!fs.existsSync(full)) { res.status(404).json({ error: 'file missing' }); return; }
    res.sendFile(full);
}));

export default router;
