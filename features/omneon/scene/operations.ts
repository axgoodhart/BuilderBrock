/**
 * Typed scene operations. Chat, property fields, gizmos, the timeline and
 * flowcharts all produce these; applySceneOperations is the single gateway.
 */
import { z } from 'zod';
import {
    Vec3Schema, TransformSchema, GeometrySchema, MaterialPropsSchema,
    PhysicsPatchSchema, AnimationClipSchema, InteractionSchema,
    WorldSchema, CameraNodeDataSchema, LightNodeDataSchema,
} from './document';

const nodeId = z.string().min(1);

export const SceneOperationSchema = z.discriminatedUnion('op', [
    z.object({
        op: z.literal('node.add'),
        node: z.object({
            id: nodeId.optional(),
            name: z.string().min(1),
            kind: z.enum(['mesh', 'group', 'light', 'camera', 'customScript']).default('mesh'),
            parentId: nodeId.nullable().default(null),
            transform: TransformSchema.partial().optional(),
            geometry: GeometrySchema.nullable().default(null),
            materialId: z.string().nullable().default(null),
            materialOverride: MaterialPropsSchema.partial().nullable().default(null),
            camera: CameraNodeDataSchema.partial().nullable().default(null),
            light: LightNodeDataSchema.partial().nullable().default(null),
            visible: z.boolean().default(true),
        }),
    }),
    z.object({ op: z.literal('node.remove'), id: nodeId }),
    z.object({ op: z.literal('node.rename'), id: nodeId, name: z.string().min(1) }),
    z.object({ op: z.literal('node.reparent'), id: nodeId, parentId: nodeId.nullable() }),
    z.object({ op: z.literal('node.duplicate'), id: nodeId, newName: z.string().optional() }),
    z.object({ op: z.literal('node.setVisible'), id: nodeId, visible: z.boolean() }),
    z.object({ op: z.literal('node.setLocked'), id: nodeId, locked: z.boolean() }),
    z.object({
        op: z.literal('node.transform'),
        id: nodeId,
        /** Partial transform patch; omitted fields are unchanged. */
        position: Vec3Schema.partial().optional(),
        rotation: Vec3Schema.partial().optional(),
        scale: Vec3Schema.partial().optional(),
    }),
    z.object({
        op: z.literal('node.setGeometry'),
        id: nodeId,
        geometry: GeometrySchema,
    }),
    z.object({
        op: z.literal('material.define'),
        material: z.object({
            id: z.string().optional(),
            name: z.string().min(1),
            props: MaterialPropsSchema.partial().default({}),
        }),
    }),
    z.object({
        op: z.literal('material.assign'),
        id: nodeId,
        /** Material library id, or null to clear the assignment. */
        materialId: z.string().nullable(),
    }),
    z.object({
        op: z.literal('material.update'),
        materialId: z.string(),
        props: MaterialPropsSchema.partial(),
    }),
    z.object({
        op: z.literal('material.setOverride'),
        id: nodeId,
        props: MaterialPropsSchema.partial().nullable(),
    }),
    z.object({
        op: z.literal('animation.upsertClip'),
        id: nodeId,
        clip: AnimationClipSchema,
    }),
    z.object({
        op: z.literal('animation.removeClip'),
        id: nodeId,
        clipId: z.string(),
    }),
    z.object({
        op: z.literal('animation.keyframe'),
        id: nodeId,
        clipId: z.string(),
        /** Track property path; created if absent. */
        path: z.string(),
        time: z.number().min(0),
        value: z.union([z.number(), Vec3Schema, z.string()]),
        easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']).default('linear'),
    }),
    z.object({
        op: z.literal('animation.setKeyTime'),
        id: nodeId,
        clipId: z.string(),
        path: z.string(),
        fromTime: z.number().min(0),
        toTime: z.number().min(0),
    }),
    z.object({
        op: z.literal('interaction.connect'),
        id: nodeId,
        interaction: InteractionSchema,
    }),
    z.object({
        op: z.literal('interaction.disconnect'),
        id: nodeId,
        interactionId: z.string(),
    }),
    z.object({
        op: z.literal('physics.configure'),
        id: nodeId,
        physics: PhysicsPatchSchema.nullable(), // null removes component
    }),
    z.object({
        op: z.literal('world.update'),
        world: z.object({
            backgroundColor: z.string().optional(),
            environmentAssetId: z.string().nullable().optional(),
            environmentPreset: z.string().nullable().optional(),
            fog: z.object({
                enabled: z.boolean().optional(),
                color: z.string().optional(),
                near: z.number().positive().optional(),
                far: z.number().positive().optional(),
            }).optional(),
            ground: z.object({
                enabled: z.boolean().optional(),
                size: z.number().positive().optional(),
                materialId: z.string().nullable().optional(),
            }).optional(),
            toneMapping: z.enum(['none', 'linear', 'reinhard', 'cineon', 'aces']).optional(),
            toneMappingExposure: z.number().positive().optional(),
            cameraDefault: z.object({
                position: Vec3Schema.optional(),
                target: Vec3Schema.optional(),
                fov: z.number().positive().optional(),
            }).optional(),
        }),
    }),
    z.object({
        op: z.literal('camera.setActive'),
        id: nodeId.nullable(),
    }),
    z.object({
        op: z.literal('script.set'),
        id: nodeId, // must be a customScript node
        code: z.string(),
    }),
]);

export type SceneOperation = z.infer<typeof SceneOperationSchema>;

/** Validate raw model/UI output into operations. Throws ZodError on bad input. */
export function parseSceneOperations(input: unknown): SceneOperation[] {
    return z.array(SceneOperationSchema).parse(input);
}
