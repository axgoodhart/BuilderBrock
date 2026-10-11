/**
 * Step 8 gate: drag a cube → code changes; edit code → cube moves; invalid
 * code never damages the scene.
 */
import { createEmptyDocument, parseSceneDocument } from './document';
import { applySceneOperations } from './apply';
import { generateSceneModule, parseSceneModule } from './code';

const assert = (cond: boolean, msg: string) => {
    if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); }
    console.log(`ok — ${msg}`);
};

// Build a doc with a cube
let doc = createEmptyDocument();
let r = applySceneOperations(doc, [
    { op: 'node.add', node: { id: 'cube_1', name: 'Cube', kind: 'mesh', geometry: { type: 'box', width: 1, height: 1, depth: 1 }, transform: { position: { x: 0, y: 0.5, z: 0 } } } },
]);
assert(r.ok, 'cube added');
doc = r.document;

// 1. Deterministic generation
const code1 = generateSceneModule(doc);
assert(code1.includes("defineNode('cube_1'"), 'code contains cube declaration');
assert(code1 === generateSceneModule(doc), 'generation is deterministic');

// 2. Edit position in code → parse → same op as gizmo would produce
const code2 = code1.replace('position: [0, 0.5, 0],', 'position: [2, 0.5, 0],');
const p2 = parseSceneModule(code2, doc);
assert(p2.ok && p2.operations.length === 1, `code edit parses to one op (${p2.errors.join(';')})`);
const r2 = applySceneOperations(doc, p2.operations);
assert(r2.ok && r2.document.nodes[0].transform.position.x === 2, 'code edit moves the cube');

// 3. Rename via code
const code3 = code1.replace(`name: "Cube",`, `name: "Big Cube",`);
const p3 = parseSceneModule(code3, doc);
assert(p3.ok && p3.operations.some((o: any) => o.op === 'node.rename'), 'code rename parses');

// 4. Geometry edit via code
const code4 = code1.replace(`geometry: { type: 'box', width: 1, height: 1, depth: 1 },`, `geometry: { type: 'sphere', radius: 2 },`);
const p4 = parseSceneModule(code4, doc);
assert(p4.ok && p4.operations.some((o: any) => o.op === 'node.setGeometry'), 'geometry edit parses');

// 5. Invalid code: unknown node id → error, scene untouched
const code5 = code1 + `\ndefineNode('ghost_9', { name: 'Ghost', kind: 'mesh' });\n`;
const p5 = parseSceneModule(code5, doc);
assert(!p5.ok && p5.errors.some(e => e.includes('unknown node id')), 'unknown node rejected');

// 6. Unsupported property → error
const code6 = code1.replace(`visible: true,`, `visible: true,\n  physics: { mass: 5 },`);
const p6 = parseSceneModule(code6, doc);
assert(!p6.ok && p6.errors.some(e => e.includes('unsupported property')), 'unsupported property rejected');

// 7. Syntax error → error
const p7 = parseSceneModule(code1 + '\nthis is not ts {{{', doc);
assert(!p7.ok, 'syntax error rejected');

// 8. World edit
const code8 = code1.replace(`backgroundColor: "#0b0d12",`, `backgroundColor: "#123456",`);
const p8 = parseSceneModule(code8, doc);
assert(p8.ok && p8.operations.some((o: any) => o.op === 'world.update'), 'world edit parses');

// 9. Unchanged module: no ops, not "changed"
const p9 = parseSceneModule(code1, doc);
assert(p9.ok && p9.operations.length === 0 && !p9.changed, 'clean regeneration is a no-op');

// 10. Round-trip stability: apply parsed ops of generated code → identical doc
const p10 = parseSceneModule(generateSceneModule(doc), doc);
const r10 = applySceneOperations(doc, p10.operations);
assert(r10.ok && JSON.stringify(r10.document) === JSON.stringify(doc), 'round-trip preserves document');

console.log('\nStep 8 gate: PASS');
