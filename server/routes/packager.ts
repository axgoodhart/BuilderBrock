import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';

const prisma = new PrismaClient();
const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'prisma', 'data', 'assets');
const RUNTIME_HTML = path.join(PROJECT_ROOT, 'public', 'omneon-runtime.html');

const VENDOR_FILES = [
    'three/build/three.module.js',
    'three/examples/jsm/controls/OrbitControls.js',
    'three/examples/jsm/controls/TransformControls.js',
    'three/examples/jsm/loaders/GLTFLoader.js',
    'three/examples/jsm/loaders/RGBELoader.js',
    'three/examples/jsm/utils/BufferGeometryUtils.js',
    'three/examples/jsm/utils/SkeletonUtils.js',
    '@dimforge/rapier3d-compat/rapier.es.js',
    '@dimforge/rapier3d-compat/rapier_wasm3d_bg.wasm',
];

/** Collect every asset id referenced by the document. */
function referencedAssetIds(doc: any): string[] {
    const ids = new Set<string>();
    for (const node of doc.nodes || []) {
        if (node.geometry?.type === 'model' && node.geometry.assetId) ids.add(node.geometry.assetId);
    }
    for (const m of doc.materials || []) {
        if (m.props?.textureAssetId) ids.add(m.props.textureAssetId);
    }
    if (doc.world?.environmentAssetId) ids.add(doc.world.environmentAssetId);
    return [...ids];
}

/**
 * Export a scene artifact as a self-contained web-app ZIP:
 * index.html (sandboxed runtime, embedded scene), local three.js/rapier
 * bundles, copied assets, and a metadata + license manifest.
 */
router.get('/artifacts/:artifactId/export', async (req, res) => {
    const artifact = await prisma.artifact.findUnique({ where: { id: req.params.artifactId } });
    if (!artifact) { res.status(404).json({ error: 'artifact not found' }); return; }

    let doc: any;
    try { doc = JSON.parse(artifact.html); }
    catch { res.status(400).json({ error: 'artifact is not a scene document' }); return; }

    const files: Record<string, Uint8Array> = {};

    // Vendor bundles: three.js + addons + rapier (local, no CDN needed).
    const manifestVendor: string[] = [];
    for (const rel of VENDOR_FILES) {
        const src = path.join(PROJECT_ROOT, 'node_modules', rel);
        if (!fs.existsSync(src)) continue;
        const vendorRel = rel.startsWith('three/build/')
            ? `vendor/three.module.js`
            : rel.startsWith('three/examples/jsm/')
                ? `vendor/addons/${rel.slice('three/examples/jsm/'.length)}`
                : `vendor/${path.basename(rel)}`;
        files[vendorRel] = new Uint8Array(fs.readFileSync(src));
        manifestVendor.push(rel);
    }

    // Assets referenced by the scene, copied locally and rewritten by __ASSET_BASE__.
    const manifestAssets: any[] = [];
    for (const assetId of referencedAssetIds(doc)) {
        const asset = await prisma.asset.findUnique({ where: { id: assetId } });
        if (!asset) continue;
        const src = path.join(ASSETS_DIR, asset.path);
        if (!fs.existsSync(src)) continue;
        const ext = path.extname(asset.name) || '';
        const zipPath = `assets/${asset.id}${ext}`;
        files[zipPath] = new Uint8Array(fs.readFileSync(src));
        manifestAssets.push({
            id: asset.id, file: zipPath, originalName: asset.name,
            kind: asset.kind, sizeBytes: asset.sizeBytes,
            origin: asset.origin, license: 'provided by scene author',
            metadata: asset.metadata ? JSON.parse(asset.metadata) : null,
        });
    }

    // Runtime html → local importmap + embedded scene + local asset base.
    let html = fs.readFileSync(RUNTIME_HTML, 'utf8');
    html = html.replace(
        /"three":\s*"[^"]+"/, '"three": "./vendor/three.module.js"',
    ).replace(
        /"three\/addons\/":\s*"[^"]+"/, '"three/addons/": "./vendor/addons/"',
    ).replace(
        /import\('https:\/\/esm\.sh\/@dimforge\/rapier3d-compat@[^']+'\)/,
        "import('./vendor/rapier.es.js')",
    );
    const sceneScript = `<script>window.__ASSET_BASE__='./assets';window.__SCENE__=${JSON.stringify(doc)};</script>`;
    html = html.replace('<script type="importmap">', `${sceneScript}\n<script type="importmap">`);
    files['index.html'] = strToU8(html);

    // Metadata + license manifest.
    files['manifest.json'] = strToU8(JSON.stringify({
        name: artifact.prompt?.slice(0, 60) || `scene-${artifact.id.slice(-6)}`,
        app: 'BuilderBrock / BROCKULON scene export',
        exportedAt: new Date().toISOString(),
        scene: {
            version: doc.version ?? 1,
            nodes: (doc.nodes || []).length,
            materials: (doc.materials || []).length,
            templateIntent: doc.templateIntent ?? null,
        },
        assets: manifestAssets,
        vendor: manifestVendor,
        licenses: [
            { package: 'three', license: 'MIT', url: 'https://github.com/mrdoob/three.js/blob/dev/LICENSE' },
            { package: '@dimforge/rapier3d-compat', license: 'Apache-2.0', url: 'https://github.com/dimforge/rapier.js/blob/master/LICENSE' },
        ],
        run: 'serve this folder (or open index.html over http) — no build step, no network needed',
    }, null, 2));

    const zipped = zipSync(files, { level: 6 });
    const safeName = (artifact.prompt?.slice(0, 40) || `scene-${artifact.id.slice(-6)}`).replace(/[^\w.-]+/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-web.zip"`);
    res.send(Buffer.from(zipped));
});

export default router;
