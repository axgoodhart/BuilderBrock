/**
 * Typed postMessage protocol between the Omneon host (BuilderBrock app) and
 * the sandboxed Three.js runtime iframe (public/omneon-runtime.html).
 */

import type { SceneOperation } from '../scene/operations';
import type { SceneDocument, Transform, Vec3 } from '../scene/document';

/* --------------------------- Host → Runtime --------------------------- */

export type RuntimeCommand =
    | { type: 'loadScene'; document: SceneDocument }
    | { type: 'applyOperations'; operations: SceneOperation[]; /** already-applied document for reference */ document: SceneDocument }
    | { type: 'selectNode'; ids: string[] }
    | { type: 'setSelectionMode'; mode: 'point' | 'lasso' }
    | { type: 'setCamera'; position: Vec3; target?: Vec3 }
    | { type: 'setTransformMode'; mode: 'translate' | 'rotate' | 'scale' | null }
    | { type: 'setSpace'; space: 'world' | 'local' }
    | { type: 'setSnap'; enabled: boolean; translateSnap: number; rotateSnap: number; scaleSnap: number }
    | { type: 'play'; nodeId?: string; clipId?: string }
    | { type: 'pause' }
    | { type: 'seek'; time: number }
    | { type: 'physicsStart' }
    | { type: 'physicsPause' }
    | { type: 'physicsStep' }
    | { type: 'physicsReset' }
    | { type: 'physicsBake'; duration: number; fps?: number }
    | { type: 'setViewport'; mode: 'single' | 'split'; secondary?: 'top' | 'front' | 'side' | 'persp' };

/* --------------------------- Runtime → Host --------------------------- */

export type RuntimeEvent =
    | { type: 'runtimeReady' }
    | { type: 'runtimeError'; message: string; stack?: string }
    | { type: 'selectionChanged'; ids: string[]; /** world point under the click */ point: Vec3 | null }
    | { type: 'lassoSelected'; ids: string[]; /** world-space quad projected from the drag rect onto the y=0 plane */ region: [Vec3, Vec3, Vec3, Vec3] }
    | { type: 'transformChanged'; id: string; transform: Transform; /** live drag vs committed on pointer-up */ phase: 'drag' | 'commit' }
    | { type: 'cameraChanged'; position: Vec3; target: Vec3 }
    | { type: 'playback'; time: number; playing: boolean; duration: number }
    | { type: 'interactionEvent'; nodeId: string; interactionId: string; name: string }
    | { type: 'physicsState'; ready: boolean; running: boolean }
    | { type: 'physicsBaked'; frames: Record<string, { time: number; position: Vec3; rotation: Vec3 }[]> };

export function isRuntimeEvent(msg: any): msg is RuntimeEvent {
    return !!msg && typeof msg === 'object' && typeof msg.type === 'string' && msg.source === 'omneon-runtime';
}

export function wrapEvent(event: RuntimeEvent) {
    return { source: 'omneon-runtime', ...event };
}

export function wrapCommand(command: RuntimeCommand) {
    return { source: 'omneon-host', ...command };
}
