/**
 * Canonical SceneDocument — the single source of truth for an Omneon scene.
 *
 * Every feature (chat, handles, timeline, flowcharts, physics, templates,
 * packaging) crosses this document via typed SceneOperation[] rather than
 * editing arbitrary JavaScript. See apply.ts for the single all-or-nothing
 * validated mutation entry point.
 */
import { z } from 'zod';

/* ------------------------------ Primitives ------------------------------ */

export const Vec3Schema = z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
});
export type Vec3 = z.infer<typeof Vec3Schema>;

export const TransformSchema = z.object({
    position: Vec3Schema.default({ x: 0, y: 0, z: 0 }),
    rotation: Vec3Schema.default({ x: 0, y: 0, z: 0 }), // euler, radians
    scale: Vec3Schema.default({ x: 1, y: 1, z: 1 }),
});
export type Transform = z.infer<typeof TransformSchema>;

/* ------------------------------- Materials ------------------------------ */

export const MaterialPropsSchema = z.object({
    color: z.string().default('#ffffff'),           // css color
    metalness: z.number().min(0).max(1).default(0.1),
    roughness: z.number().min(0).max(1).default(0.8),
    opacity: z.number().min(0).max(1).default(1),
    transparent: z.boolean().default(false),
    emissive: z.string().default('#000000'),
    emissiveIntensity: z.number().min(0).default(0),
    wireframe: z.boolean().default(false),
    /** Optional texture/HDRI asset reference (AssetSource id, step 10). */
    textureAssetId: z.string().nullable().default(null),
});
export type MaterialProps = z.infer<typeof MaterialPropsSchema>;

/** Reusable named material in the document's material library. */
export const MaterialDefSchema = z.object({
    id: z.string(),
    name: z.string(),
    props: MaterialPropsSchema,
});
export type MaterialDef = z.infer<typeof MaterialDefSchema>;

/* ------------------------------ Components ------------------------------ */

export const GeometrySchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('box'),
        width: z.number().positive().default(1),
        height: z.number().positive().default(1),
        depth: z.number().positive().default(1),
    }),
    z.object({
        type: z.literal('sphere'),
        radius: z.number().positive().default(0.5),
        widthSegments: z.number().int().positive().default(32),
        heightSegments: z.number().int().positive().default(16),
    }),
    z.object({
        type: z.literal('cylinder'),
        radiusTop: z.number().positive().default(0.5),
        radiusBottom: z.number().positive().default(0.5),
        height: z.number().positive().default(1),
        radialSegments: z.number().int().positive().default(32),
    }),
    z.object({
        type: z.literal('plane'),
        width: z.number().positive().default(1),
        height: z.number().positive().default(1),
    }),
    z.object({
        type: z.literal('cone'),
        radius: z.number().positive().default(0.5),
        height: z.number().positive().default(1),
        radialSegments: z.number().int().positive().default(32),
    }),
    z.object({
        type: z.literal('torus'),
        radius: z.number().positive().default(0.5),
        tube: z.number().positive().default(0.2),
        radialSegments: z.number().int().positive().default(16),
        tubularSegments: z.number().int().positive().default(48),
    }),
    z.object({
        /** External model asset (GLB/GLTF) imported via the asset library. */
        type: z.literal('model'),
        assetId: z.string(),
    }),
]);
export type Geometry = z.infer<typeof GeometrySchema>;

/* Physics component (step 13; stored now so documents are forward-complete). */
export const PhysicsComponentSchema = z.object({
    enabled: z.boolean().default(true),
    bodyType: z.enum(['dynamic', 'fixed', 'kinematic']).default('dynamic'),
    collider: z.enum(['box', 'sphere', 'capsule', 'convexHull', 'trimesh']).default('box'),
    mass: z.number().positive().default(1),
    friction: z.number().min(0).default(0.5),
    restitution: z.number().min(0).max(1).default(0.3),
    gravityScale: z.number().default(1),
    linearDamping: z.number().min(0).default(0.01),
    angularDamping: z.number().min(0).default(0.05),
    collisionGroups: z.number().int().default(0x00010001),
});
export type PhysicsComponent = z.infer<typeof PhysicsComponentSchema>;

/**
 * Patch variant used by the physics.configure op: keys absent from the op
 * must stay untouched (defaults must NOT be filled in, or partial updates
 * would clobber existing fields). All fields strictly optional, no defaults.
 */
export const PhysicsPatchSchema = z.object({
    enabled: z.boolean().optional(),
    bodyType: z.enum(['dynamic', 'fixed', 'kinematic']).optional(),
    collider: z.enum(['box', 'sphere', 'capsule', 'convexHull', 'trimesh']).optional(),
    mass: z.number().positive().optional(),
    friction: z.number().min(0).optional(),
    restitution: z.number().min(0).max(1).optional(),
    gravityScale: z.number().optional(),
    linearDamping: z.number().min(0).optional(),
    angularDamping: z.number().min(0).optional(),
    collisionGroups: z.number().int().optional(),
});
export type PhysicsPatch = z.infer<typeof PhysicsPatchSchema>;

/* Animation clips (step 11). */
export const KeyframeSchema = z.object({
    time: z.number().min(0),
    value: z.union([z.number(), Vec3Schema, z.string()]),
    easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']).default('linear'),
});
export const AnimationTrackSchema = z.object({
    /** Property path on the node: transform.position, material.opacity, ... */
    path: z.string(),
    keyframes: z.array(KeyframeSchema),
});
export const AnimationClipSchema = z.object({
    id: z.string(),
    name: z.string(),
    duration: z.number().positive(),
    loop: z.enum(['once', 'repeat', 'pingpong']).default('once'),
    tracks: z.array(AnimationTrackSchema),
});
export type AnimationClip = z.infer<typeof AnimationClipSchema>;

/* Interaction flow nodes (step 12). */
export const InteractionSchema = z.object({
    id: z.string(),
    trigger: z.enum(['click', 'hover', 'timer', 'key', 'pointer', 'collision', 'custom']),
    triggerParams: z.record(z.string(), z.unknown()).default({}),
    action: z.enum([
        'playClip', 'setProperty', 'toggleVisibility', 'changeMaterial',
        'switchCamera', 'applyImpulse', 'emitEvent',
    ]),
    actionParams: z.record(z.string(), z.unknown()).default({}),
});
export type Interaction = z.infer<typeof InteractionSchema>;

/* --------------------------------- Nodes -------------------------------- */

export const CameraNodeDataSchema = z.object({
    type: z.enum(['perspective', 'orthographic']).default('perspective'),
    fov: z.number().positive().default(50),
    near: z.number().positive().default(0.1),
    far: z.number().positive().default(1000),
});

export const LightNodeDataSchema = z.object({
    type: z.enum(['directional', 'point', 'spot', 'ambient', 'hemisphere']).default('directional'),
    color: z.string().default('#ffffff'),
    intensity: z.number().min(0).default(1),
    castShadow: z.boolean().default(false),
});

export const SceneNodeSchema = z.object({
    /** Stable ID — never reused. Referenced by chat, selection, timeline, flowchart. */
    id: z.string(),
    name: z.string(),
    kind: z.enum(['mesh', 'group', 'light', 'camera', 'customScript']).default('mesh'),
    /** Parent node id, or null for a root-level node. */
    parentId: z.string().nullable().default(null),
    transform: TransformSchema.default({
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
    }),
    /** Mesh geometry; null for groups/lights/cameras/customScript nodes. */
    geometry: GeometrySchema.nullable().default(null),
    /** Material library id, or null for default. */
    materialId: z.string().nullable().default(null),
    /** Inline material override (wins over materialId when set). */
    materialOverride: MaterialPropsSchema.nullable().default(null),
    camera: CameraNodeDataSchema.nullable().default(null),
    light: LightNodeDataSchema.nullable().default(null),
    physics: PhysicsComponentSchema.nullable().default(null),
    /** Animation clips owned by this node (step 11). */
    animations: z.array(AnimationClipSchema).default([]),
    /** Interaction flow entries attached to this node (step 12). */
    interactions: z.array(InteractionSchema).default([]),
    /** Freeform JS preserved verbatim in Custom Script nodes. */
    customScript: z.string().nullable().default(null),
    visible: z.boolean().default(true),
    locked: z.boolean().default(false),
});
export type SceneNode = z.infer<typeof SceneNodeSchema>;

/* --------------------------------- World -------------------------------- */

export const WorldSchema = z.object({
    backgroundColor: z.string().default('#0b0d12'),
    environmentAssetId: z.string().nullable().default(null), // HDR/EXR
    environmentPreset: z.string().nullable().default(null),  // e.g. 'city', 'studio'
    fog: z.object({
        enabled: z.boolean().default(false),
        color: z.string().default('#0b0d12'),
        near: z.number().positive().default(10),
        far: z.number().positive().default(50),
    }).default(() => ({ enabled: false, color: '#0b0d12', near: 10, far: 50 })),
    ground: z.object({
        enabled: z.boolean().default(false),
        size: z.number().positive().default(20),
        materialId: z.string().nullable().default(null),
    }).default(() => ({ enabled: false, size: 20, materialId: null })),
    toneMapping: z.enum(['none', 'linear', 'reinhard', 'cineon', 'aces']).default('aces'),
    toneMappingExposure: z.number().positive().default(1),
    /** Default camera defaults used on load. */
    cameraDefault: z.object({
        position: Vec3Schema.default({ x: 4, y: 3, z: 6 }),
        target: Vec3Schema.default({ x: 0, y: 0, z: 0 }),
        fov: z.number().positive().default(50),
    }).default(() => ({ position: { x: 4, y: 3, z: 6 }, target: { x: 0, y: 0, z: 0 }, fov: 50 })),
});
export type World = z.infer<typeof WorldSchema>;

/* -------------------------------- Document ------------------------------- */

export const SCENE_DOCUMENT_VERSION = 1;

export const SceneDocumentSchema = z.object({
    version: z.literal(SCENE_DOCUMENT_VERSION),
    /** Template intent metadata injected at creation (step 9). */
    templateIntent: z.object({
        template: z.string().nullable().default(null),
        materialCollection: z.string().nullable().default(null),
        worldCollection: z.string().nullable().default(null),
        notes: z.string().default(''),
    }).default({ template: null, materialCollection: null, worldCollection: null, notes: '' }),
    world: WorldSchema.default(() => WorldSchema.parse({})),
    /** Material library referenced by nodes. */
    materials: z.array(MaterialDefSchema).default([]),
    nodes: z.array(SceneNodeSchema).default([]),
    /** Id of the active camera node, or null = world.cameraDefault. */
    activeCameraId: z.string().nullable().default(null),
});
export type SceneDocument = z.infer<typeof SceneDocumentSchema>;

/** Create an empty document with sane defaults. */
export function createEmptyDocument(): SceneDocument {
    return SceneDocumentSchema.parse({
        version: SCENE_DOCUMENT_VERSION,
        nodes: [],
        materials: [],
    });
}

/** Parse untrusted JSON into a validated SceneDocument. Throws on failure. */
export function parseSceneDocument(input: unknown): SceneDocument {
    return SceneDocumentSchema.parse(input);
}
