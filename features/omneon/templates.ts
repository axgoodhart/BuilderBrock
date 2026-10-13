/**
 * Template launchpad on the document model. Each initial scene card is a
 * versioned SceneDocument seed with intent metadata injected into the
 * conversation — never an opaque code blob. Material and world collections
 * apply later as ordinary scene operations, so they preview, commit, branch,
 * and roll back like anything else.
 */
import { SceneDocument, parseSceneDocument } from './scene/document';

export interface TemplateDef {
    id: string;
    name: string;
    description: string;
}

export interface MaterialCollectionDef {
    id: string;
    name: string;
    description: string;
    materials: { id: string; name: string; props: Record<string, unknown> }[];
}

export interface WorldCollectionDef {
    id: string;
    name: string;
    description: string;
    world: Record<string, unknown>;
}

/* ------------------------------ Templates ------------------------------- */

export const TEMPLATES: TemplateDef[] = [
    { id: 'blank', name: 'Blank', description: 'An empty scene, ready for your own objects and lighting.' },
    { id: 'product', name: 'Product Showcase', description: 'Pedestal, hero object, studio lighting' },
    { id: 'dataviz', name: 'Data Visualization', description: 'Bars, grid ground, soft light' },
    { id: 'genart', name: 'Generative Art', description: 'Orbiting forms, atmosphere, fog' },
    { id: 'minigame', name: 'Mini Game', description: 'Floor, player, obstacles' },
    { id: 'portfolio', name: 'Portfolio Piece', description: 'Framed display, title object, warm light' },
];

function doc(templateId: string, nodes: any[], world: any = {}, materials: any[] = []): SceneDocument {
    return parseSceneDocument({
        version: 1,
        templateIntent: { template: templateId, materialCollection: null, worldCollection: null, notes: '' },
        nodes,
        materials,
        world,
    });
}

export function buildTemplateDocument(templateId: string): SceneDocument {
    switch (templateId) {
        case 'blank':
            return doc('blank', []);
        case 'product':
            return doc('product', [
                { id: 'pedestal', name: 'Pedestal', kind: 'mesh', geometry: { type: 'cylinder', radiusTop: 1.1, radiusBottom: 1.2, height: 0.6 }, transform: { position: { x: 0, y: 0.3, z: 0 } }, materialId: 'mat_glass' },
                { id: 'hero', name: 'Hero Object', kind: 'mesh', geometry: { type: 'torus', radius: 0.55, tube: 0.22 }, transform: { position: { x: 0, y: 1.4, z: 0 } }, materialId: 'mat_glass' },
                { id: 'key_light', name: 'Key Light', kind: 'light', light: { type: 'spot', intensity: 3, castShadow: true }, transform: { position: { x: 3, y: 4, z: 3 } } },
                { id: 'fill_light', name: 'Fill Light', kind: 'light', light: { type: 'point', intensity: 0.8 }, transform: { position: { x: -3, y: 2, z: -2 } } },
            ], { backgroundColor: '#101318', ground: { enabled: true, size: 30 } }, [
                { id: 'mat_glass', name: 'Showcase Glass', props: { color: '#9adfff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 } },
            ]);
        case 'dataviz':
            return doc('dataviz', [
                { id: 'bar_1', name: 'Q1', kind: 'mesh', geometry: { type: 'box', width: 0.8, height: 1.2, depth: 0.8 }, transform: { position: { x: -1.8, y: 0.6, z: 0 } }, materialId: 'mat_accent' },
                { id: 'bar_2', name: 'Q2', kind: 'mesh', geometry: { type: 'box', width: 0.8, height: 2.0, depth: 0.8 }, transform: { position: { x: -0.6, y: 1.0, z: 0 } }, materialId: 'mat_accent' },
                { id: 'bar_3', name: 'Q3', kind: 'mesh', geometry: { type: 'box', width: 0.8, height: 1.6, depth: 0.8 }, transform: { position: { x: 0.6, y: 0.8, z: 0 } }, materialId: 'mat_accent' },
                { id: 'bar_4', name: 'Q4', kind: 'mesh', geometry: { type: 'box', width: 0.8, height: 2.6, depth: 0.8 }, transform: { position: { x: 1.8, y: 1.3, z: 0 } }, materialId: 'mat_accent' },
                { id: 'light_main', name: 'Main Light', kind: 'light', light: { type: 'directional', intensity: 1.2, castShadow: true }, transform: { position: { x: 4, y: 6, z: 4 } } },
            ], { backgroundColor: '#0e1218', ground: { enabled: true, size: 24 }, fog: { enabled: true, color: '#0e1218', near: 12, far: 40 } }, [
                { id: 'mat_accent', name: 'Accent', props: { color: '#4f9cf5', roughness: 0.3, metalness: 0.2 } },
            ]);
        case 'genart':
            return doc('genart', [
                { id: 'core', name: 'Core', kind: 'mesh', geometry: { type: 'sphere', radius: 0.8 }, materialId: 'mat_neon', transform: { position: { x: 0, y: 1, z: 0 } } },
                { id: 'orbit_1', name: 'Orbit 1', kind: 'mesh', geometry: { type: 'torus', radius: 1.6, tube: 0.05 }, materialId: 'mat_neon', transform: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0.6, y: 0, z: 0 } } },
                { id: 'orbit_2', name: 'Orbit 2', kind: 'mesh', geometry: { type: 'torus', radius: 2.2, tube: 0.05 }, materialId: 'mat_neon', transform: { position: { x: 0, y: 1, z: 0 }, rotation: { x: -0.4, y: 0.8, z: 0 } } },
                { id: 'light_a', name: 'Light A', kind: 'light', light: { type: 'point', intensity: 2 }, transform: { position: { x: 0, y: 4, z: 0 } } },
            ], { backgroundColor: '#07080d', fog: { enabled: true, color: '#07080d', near: 6, far: 30 } }, [
                { id: 'mat_neon', name: 'Neon', props: { color: '#22d3ee', emissive: '#22d3ee', emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.4 } },
            ]);
        case 'minigame':
            return doc('minigame', [
                { id: 'player', name: 'Player', kind: 'mesh', geometry: { type: 'sphere', radius: 0.4 }, transform: { position: { x: 0, y: 0.4, z: 0 } }, materialId: 'mat_player' },
                { id: 'obstacle_1', name: 'Obstacle 1', kind: 'mesh', geometry: { type: 'box', width: 0.8, height: 1.2, depth: 0.8 }, transform: { position: { x: 2, y: 0.6, z: -1 } }, materialId: 'mat_obstacle' },
                { id: 'obstacle_2', name: 'Obstacle 2', kind: 'mesh', geometry: { type: 'box', width: 0.8, height: 1.8, depth: 0.8 }, transform: { position: { x: -2.5, y: 0.9, z: 1.5 } }, materialId: 'mat_obstacle' },
                { id: 'light_sun', name: 'Sun', kind: 'light', light: { type: 'directional', intensity: 1.4, castShadow: true }, transform: { position: { x: 5, y: 8, z: 4 } } },
            ], { backgroundColor: '#0c0f14', ground: { enabled: true, size: 40 } }, [
                { id: 'mat_player', name: 'Player', props: { color: '#f59e0b', roughness: 0.4, metalness: 0.1 } },
                { id: 'mat_obstacle', name: 'Obstacle', props: { color: '#64748b', roughness: 0.7, metalness: 0.2 } },
            ]);
        case 'portfolio':
            return doc('portfolio', [
                { id: 'frame', name: 'Frame', kind: 'mesh', geometry: { type: 'box', width: 3, height: 2, depth: 0.1 }, transform: { position: { x: 0, y: 1.4, z: 0 } }, materialId: 'mat_frame' },
                { id: 'title', name: 'Title', kind: 'mesh', geometry: { type: 'box', width: 2.4, height: 0.3, depth: 0.06 }, transform: { position: { x: 0, y: 2.7, z: 0.08 } }, materialId: 'mat_title' },
                { id: 'light_warm', name: 'Warm Light', kind: 'light', light: { type: 'spot', intensity: 2.2, castShadow: true }, transform: { position: { x: 2, y: 3.5, z: 3 } } },
            ], { backgroundColor: '#12100e', ground: { enabled: true, size: 26 } }, [
                { id: 'mat_frame', name: 'Frame', props: { color: '#3a2f24', roughness: 0.8, metalness: 0.05 } },
                { id: 'mat_title', name: 'Title', props: { color: '#e8dcc8', roughness: 0.5, metalness: 0.1, emissive: '#e8dcc8', emissiveIntensity: 0.15 } },
            ]);
        default:
            return parseSceneDocument({ version: 1, nodes: [] });
    }
}

/* --------------------------- Material collections ------------------------ */

export const MATERIAL_COLLECTIONS: MaterialCollectionDef[] = [
    {
        id: 'neon_wireframe',
        name: 'Neon Wireframe',
        description: 'Glowing emissive wireframes for generative scenes',
        materials: [
            { id: 'mat_neon_cyan', name: 'Neon Cyan', props: { color: '#22d3ee', emissive: '#22d3ee', emissiveIntensity: 1.0, wireframe: true } },
            { id: 'mat_neon_magenta', name: 'Neon Magenta', props: { color: '#e879f9', emissive: '#e879f9', emissiveIntensity: 1.0, wireframe: true } },
            { id: 'mat_neon_lime', name: 'Neon Lime', props: { color: '#a3e635', emissive: '#a3e635', emissiveIntensity: 1.0, wireframe: true } },
        ],
    },
    {
        id: 'glass_product',
        name: 'Glass/Product',
        description: 'Transparent glassy surfaces for product shots',
        materials: [
            { id: 'mat_glass_clear', name: 'Clear Glass', props: { color: '#eaf6ff', roughness: 0.03, metalness: 0.05, transparent: true, opacity: 0.35 } },
            { id: 'mat_glass_tinted', name: 'Tinted Glass', props: { color: '#8fd0ff', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.5 } },
            { id: 'mat_chrome', name: 'Chrome', props: { color: '#d9e2ee', roughness: 0.08, metalness: 0.95 } },
        ],
    },
    {
        id: 'natural_earthy',
        name: 'Natural/Earthy',
        description: 'Warm, grounded materials for organic scenes',
        materials: [
            { id: 'mat_clay', name: 'Clay', props: { color: '#b97452', roughness: 0.9, metalness: 0.02 } },
            { id: 'mat_moss', name: 'Moss', props: { color: '#6b7f4d', roughness: 1.0, metalness: 0.0 } },
            { id: 'mat_stone', name: 'Stone', props: { color: '#8d8578', roughness: 0.95, metalness: 0.03 } },
        ],
    },
];

export function materialCollectionOps(collectionId: string): any[] {
    const c = MATERIAL_COLLECTIONS.find(x => x.id === collectionId);
    if (!c) return [];
    return c.materials.map(m => ({ op: 'material.define', material: { id: m.id, name: m.name, props: m.props } }));
}

/* ----------------------------- World collections ------------------------- */

export const WORLD_COLLECTIONS: WorldCollectionDef[] = [
    {
        id: 'studio_dark',
        name: 'Studio Dark',
        description: 'Dark backdrop, soft tone mapping, reflective ground',
        world: { backgroundColor: '#0e1116', toneMapping: 'aces', toneMappingExposure: 1.1, ground: { enabled: true, size: 30 }, fog: { enabled: false } },
    },
    {
        id: 'outdoor_haze',
        name: 'Outdoor Haze',
        description: 'Pale sky, fog, large ground plane',
        world: { backgroundColor: '#aebfcc', toneMapping: 'aces', toneMappingExposure: 1.2, ground: { enabled: true, size: 80 }, fog: { enabled: true, color: '#aebfcc', near: 15, far: 60 } },
    },
    {
        id: 'void_space',
        name: 'Void Space',
        description: 'Deep black, no ground, generous exposure',
        world: { backgroundColor: '#050507', toneMapping: 'aces', toneMappingExposure: 1.4, ground: { enabled: false }, fog: { enabled: false } },
    },
];

export function worldCollectionOps(collectionId: string): any[] {
    const c = WORLD_COLLECTIONS.find(x => x.id === collectionId);
    return c ? [{ op: 'world.update', world: c.world }] : [];
}
