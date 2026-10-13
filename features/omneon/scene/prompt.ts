/**
 * Prompt construction for Omneon's unified conversation. The model receives
 * a full scene summary (not a truncated blob), selected node IDs, template
 * intent, recent messages, and the current branch — and must reply with
 * JSON: { "explanation": string, "operations": SceneOperation[] }.
 */
import type { SceneDocument } from './document';

export function sceneSystemPrompt(): string {
    return [
        'You are Omneon, a 3D scene editing assistant embedded in BuilderBrock.',
        'You edit scenes EXCLUSIVELY by returning typed scene operations as JSON.',
        'Always reply with ONLY a JSON object of the form:',
        '{ "explanation": "short plain-language summary of the change", "operations": [ ... ] }',
        '',
        'Valid operations (Zod-validated server-side; anything invalid is rejected wholesale):',
        '- {"op":"node.add","node":{"id?":string,"name":string,"kind":"mesh"|"group"|"light"|"camera"|"customScript","parentId"?:string|null,"transform"?:{"position"?|...},"geometry"?:{...},"materialId"?:string|null}}',
        '  geometry: {"type":"box","width","height","depth"} | {"type":"sphere","radius"} | {"type":"cylinder","radiusTop","radiusBottom","height"} | {"type":"plane","width","height"} | {"type":"cone","radius","height"} | {"type":"torus","radius","tube"}',
        '- {"op":"node.remove","id"}',
        '- {"op":"node.rename","id","name"}',
        '- {"op":"node.reparent","id","parentId"}',
        '- {"op":"node.duplicate","id","newName"?}',
        '- {"op":"node.setVisible","id","visible"}  /  {"op":"node.setLocked","id","locked"}',
        '- {"op":"node.transform","id","position"?,"rotation"?,"scale"?}  // partial Vec3 patches',
        '- {"op":"node.setGeometry","id","geometry"}',
        '- {"op":"node.setLight","id","light"} // partial color, intensity, castShadow',
        '- {"op":"node.setCamera","id","camera"} // partial fov, near, far',
        '- {"op":"material.define","material":{"id"?,"name","props":{color,metalness,roughness,opacity,transparent,emissive,emissiveIntensity,wireframe}}}',
        '- {"op":"material.assign","id","materialId"}  /  {"op":"material.update","materialId","props"}  /  {"op":"material.setOverride","id","props"}',
        '- {"op":"animation.upsertClip","id","clip"} / {"op":"animation.keyframe","id","clipId","path","time","value","easing"} / {"op":"animation.removeClip","id","clipId"}',
        '- {"op":"interaction.connect","id","interaction"} / {"op":"interaction.disconnect","id","interactionId"}',
        '- {"op":"physics.configure","id","physics"|null}',
        '- {"op":"world.update","world":{backgroundColor?,fog?,ground?,toneMapping?,toneMappingExposure?,cameraDefault?}}',
        '- {"op":"camera.setActive","id"|null}',
        '',
        'Rules:',
        '- Reference existing nodes ONLY by their exact stable id.',
        '- New ids you invent for node.add/material.define must be unique, lowercase, snake_case.',
        '- Rotations are euler radians. Y-up. Distances in meters-ish units.',
        '- If the request is conversational with no scene change, return an empty operations array.',
        '- Never output anything except the JSON object.',
    ].join('\n');
}

function summarizeNode(n: SceneDocument['nodes'][number]): string {
    const bits: string[] = [`${n.id} "${n.name}" <${n.kind}>`];
    const t = n.transform;
    bits.push(`pos(${t.position.x.toFixed(2)},${t.position.y.toFixed(2)},${t.position.z.toFixed(2)})`);
    if (n.geometry) bits.push(`geo:${n.geometry.type}`);
    if (n.materialId) bits.push(`mat:${n.materialId}`);
    if (n.parentId) bits.push(`parent:${n.parentId}`);
    if (n.physics) bits.push(`physics:${n.physics.bodyType}`);
    if (n.locked) bits.push('locked');
    if (!n.visible) bits.push('hidden');
    if (n.animations.length) bits.push(`clips:[${n.animations.map(c => c.name).join(',')}]`);
    return bits.join(' ');
}

export function buildSceneUserPrompt(args: {
    document: SceneDocument;
    selectedIds: string[];
    branchName: string;
    recentMessages: { role: string; text: string }[];
    userMessage: string;
    /** World-space quad from a rectangle/lasso selection, if one was recorded. */
    lassoRegion?: { corners: [number, number, number][] } | null;
}): string {
    const { document, selectedIds, branchName, recentMessages, userMessage, lassoRegion } = args;
    const parts: string[] = [];

    parts.push(`## Scene (${document.nodes.length} nodes, branch: ${branchName})`);
    for (const n of document.nodes) parts.push('- ' + summarizeNode(n));
    if (document.nodes.length === 0) parts.push('- (empty scene)');

    if (document.materials.length) {
        parts.push('\n## Materials');
        for (const m of document.materials) {
            parts.push(`- ${m.id} "${m.name}" color:${m.props.color} rough:${m.props.roughness} metal:${m.props.metalness}`);
        }
    }

    parts.push(`\n## World\n- background:${document.world.backgroundColor} toneMapping:${document.world.toneMapping} ground:${document.world.ground.enabled ? 'on' : 'off'}`);

    if (document.templateIntent.template) {
        parts.push(`\n## Template intent\n${document.templateIntent.template}${document.templateIntent.notes ? ` — ${document.templateIntent.notes}` : ''}`);
    }

    if (selectedIds.length) {
        parts.push(`\n## User selection (the request likely refers to these)\n${selectedIds.join(', ')}`);
    }
    if (lassoRegion && lassoRegion.corners.length === 4) {
        parts.push(`\n## User-selected world-space region\nThe user drew a rectangle over this world region (corners, y=0 plane): ${lassoRegion.corners.map(c => `(${c[0].toFixed(2)},${c[2].toFixed(2)})`).join(' → ')}. Use it for area-wide requests like "fill this area with trees".`);
    }

    const recent = recentMessages.slice(-12);
    if (recent.length) {
        parts.push('\n## Recent conversation');
        for (const m of recent) parts.push(`${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`);
    }

    parts.push(`\n## Current request\n${userMessage}`);
    return parts.join('\n');
}

/** Extract the JSON object from a model reply, tolerating stray prose/fences. */
export function extractJsonObject(text: string): any | null {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
        return JSON.parse(candidate.slice(start, end + 1));
    } catch {
        return null;
    }
}
