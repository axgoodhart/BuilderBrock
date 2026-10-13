/**
 * Step 3 gate: the same operation from chat JSON, a property-field patch,
 * and a gizmo drag produces the same resulting document.
 */
import { createEmptyDocument, SceneDocumentSchema } from './document';
import { applySceneOperations } from './apply';

const assert = (cond: boolean, msg: string) => {
    if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); }
    console.log(`ok — ${msg}`);
};

// Empty document validates
const doc0 = createEmptyDocument();
assert(doc0.version === 1 && doc0.nodes.length === 0, 'empty document parses');

// 1. Chat model returns raw JSON ops (as parsed from an LLM reply)
const chatOps = JSON.parse(`[
    {"op":"node.add","node":{"id":"pillar_left","name":"Left Pillar","kind":"mesh","geometry":{"type":"box","width":0.5,"height":3,"depth":0.5},"transform":{"position":{"x":-2,"y":1.5,"z":0}}}},
    {"op":"node.add","node":{"id":"sun","name":"Sun","kind":"light","light":{"type":"directional","intensity":2}}},
    {"op":"material.define","material":{"id":"glass","name":"Glass","props":{"color":"#9adfff","roughness":0.05,"metalness":0.1,"transparent":true,"opacity":0.4}}},
    {"op":"material.assign","id":"pillar_left","materialId":"glass"}
]`);
const r1 = applySceneOperations(doc0, chatOps);
assert(r1.ok, `chat ops apply (${r1.errors.join('; ')})`);
assert(r1.document.nodes.length === 2 && r1.document.materials.length === 1, 'chat ops build nodes + material');

// 2. Inspector property field patch — partial transform
const r2 = applySceneOperations(r1.document, [
    { op: 'node.transform', id: 'pillar_left', rotation: { y: Math.PI / 4 } },
]);
assert(r2.ok, 'inspector patch applies');
assert(r2.document.nodes[0].transform.rotation.y > 0.785, 'inspector rotation set');

// 3. Gizmo drag commits one operation on pointer-up — identical shape to inspector
const r3 = applySceneOperations(r1.document, [
    { op: 'node.transform', id: 'pillar_left', rotation: { y: Math.PI / 4 } },
]);
assert(r3.ok && JSON.stringify(r3.document) === JSON.stringify(r2.document),
    'gizmo and inspector ops produce identical documents');

// 4. Bad reference: all-or-nothing, document untouched
const r4 = applySceneOperations(r1.document, [
    { op: 'node.transform', id: 'pillar_left', position: { x: 5 } },
    { op: 'node.transform', id: 'nonexistent', position: { x: 1 } },
]);
assert(!r4.ok && r4.document === r1.document, 'bad op aborts whole batch, input untouched');

// 5. Locked node rejects transform
const r5a = applySceneOperations(r1.document, [{ op: 'node.setLocked', id: 'pillar_left', locked: true }]);
const r5b = applySceneOperations(r5a.document, [{ op: 'node.transform', id: 'pillar_left', position: { x: 9 } }]);
assert(!r5b.ok && r5b.errors[0].includes('locked'), 'locked node rejects transforms');

// 6. Duplicate with subtree reparenting; delete subtree; reparent cycle rejected
const r6a = applySceneOperations(r1.document, [
    { op: 'node.add', node: { id: 'cap', name: 'Cap', kind: 'mesh', parentId: 'pillar_left', geometry: { type: 'sphere' } } },
    { op: 'node.duplicate', id: 'pillar_left', newName: 'Right Pillar' },
]);
assert(r6a.ok && r6a.document.nodes.length === 5, 'duplicate copies subtree');
const r6b = applySceneOperations(r6a.document, [{ op: 'node.remove', id: 'pillar_left' }]);
assert(r6b.ok && r6b.document.nodes.length === 3, 'remove deletes subtree');
const r6c = applySceneOperations(r6a.document, [{ op: 'node.reparent', id: 'pillar_left', parentId: 'cap' }]);
assert(!r6c.ok, 'reparent cycle rejected');

// 7. Round-trip: document survives JSON serialization + revalidation
const roundTripped = SceneDocumentSchema.parse(JSON.parse(JSON.stringify(r6a.document)));
assert(roundTripped.nodes.length === 5, 'document survives JSON round-trip');

// 8. Material update propagates via library reference
const r8 = applySceneOperations(r6a.document, [
    { op: 'material.update', materialId: 'glass', props: { roughness: 0.5 } },
]);
assert(r8.ok && r8.document.materials[0].props.roughness === 0.5, 'material library update applies');

// Inspector patches preserve sibling values and obey object locks.
const lightPatch = applySceneOperations(r1.document, [{ op: 'node.setLight', id: 'sun', light: { color: '#ffcc88' } }]);
assert(lightPatch.ok && lightPatch.document.nodes.find(n => n.id === 'sun')!.light!.intensity === 2,
    'editing light color preserves intensity');
const lockedLight = applySceneOperations(r1.document, [{ op: 'node.setLocked', id: 'sun', locked: true }]);
assert(!applySceneOperations(lockedLight.document, [{ op: 'node.setLight', id: 'sun', light: { intensity: 4 } }]).ok,
    'locked light rejects inspector edits');
const cameraScene = applySceneOperations(doc0, [{ op: 'node.add', node: { id: 'camera', name: 'Camera', kind: 'camera', camera: { fov: 65, near: 0.5, far: 500 } } }]);
const cameraPatch = applySceneOperations(cameraScene.document, [{ op: 'node.setCamera', id: 'camera', camera: { fov: 40 } }]);
assert(cameraPatch.ok && cameraPatch.document.nodes[0].camera!.near === 0.5 && cameraPatch.document.nodes[0].camera!.far === 500,
    'editing field of view preserves camera clipping planes');

// Moving keys must preserve their values and reject destructive collisions.
const animated = applySceneOperations(r1.document, [{ op: 'animation.upsertClip', id: 'pillar_left', clip: {
    id: 'move', name: 'Move', duration: 2, loop: 'once', tracks: [{ path: 'transform.position', keyframes: [
        { time: 0, value: { x: 0, y: 0, z: 0 }, easing: 'linear' },
        { time: 1, value: { x: 3, y: 2, z: 1 }, easing: 'easeOut' },
    ] }],
} }]);
const moveKey = { op: 'animation.setKeyTime', id: 'pillar_left', clipId: 'move', path: 'transform.position', fromTime: 1, toTime: 0.5 };
const moved = applySceneOperations(animated.document, [moveKey]);
const movedKey = moved.document.nodes[0].animations[0].tracks[0].keyframes[1];
assert(moved.ok && movedKey.time === 0.5 && movedKey.easing === 'easeOut' && (movedKey.value as any).x === 3,
    'moving a key preserves its value and easing');
const collision = applySceneOperations(animated.document, [{ ...moveKey, toTime: 0 }]);
assert(!collision.ok && collision.document === animated.document, 'moving onto another key leaves the scene unchanged');
assert(!applySceneOperations(animated.document, [{ ...moveKey, toTime: 3 }]).ok, 'moving past the clip duration is rejected');

console.log('\nScene operations: PASS');
