import { render } from '../../lib/promptStore';
import { uploadSpriteFrame } from '../../lib/api';

// ==== SPRITE STUDIO ====
export const IMAGE_MODEL = 'gemini-3-pro-image-preview'; // Nano Banana Pro
export const SEGMENT_MODEL = 'Xenova/modnet';
export const FRAME_DELAY_MS = 150;
export const SHEET_CELL_PX = 512;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export const ANIMATIONS = [
    'Idle loop', 'Walk cycle', 'Run cycle', 'Attack swing', 'Jump animation',
    'Damage flinch', 'Cast spell', 'Death sequence', 'Dance move', 'Victory pose',
];

export const BACKDROPS = {
    'Natural': 'simple neutral background',
    'Solid Gray': 'pure solid gray background',
    'Pure Green': 'pure lime green chroma key background',
    'Pure White': 'pure white background',
    'Pure Black': 'pure pitch black background',
} as const;
export type Backdrop = keyof typeof BACKDROPS;

export interface Image64 { base64: string; mimeType: string }

const dataUrl = (img: Image64) => `data:${img.mimeType};base64,${img.base64}`;

export const PROMPT_ID = 'sprites.frame'; // template lives in lib/promptStore.ts

export function framePrompt(animation: string, frame: number, total: number, backdrop: Backdrop) {
    return render(PROMPT_ID, { animation, frame: String(frame), total: String(total), backdrop: BACKDROPS[backdrop] });
}

export async function generateFrame(apiKey: string, prompt: string, ref: Image64): Promise<Image64> {
    if (!apiKey) throw new Error('Gemini API key not set. Add it in Settings → Providers.');
    const res = await fetch(`${GEMINI_URL}/${IMAGE_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            contents: [{ parts: [{ inlineData: { mimeType: ref.mimeType, data: ref.base64 } }, { text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
        }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error?.message || `Image generation failed (${res.status})`);
    const part = json.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!part) throw new Error('Model returned no image.');
    return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType || 'image/png' };
}

// --- Background removal (MODNet in-browser) ---

let segmenter: Promise<any> | null = null;

function loadSegmenter(onProgress: (pct: number) => void) {
    segmenter ??= (async () => {
        const { pipeline, env } = await import('@huggingface/transformers');
        env.allowLocalModels = false;
        const opts = { progress_callback: (p: any) => p.progress && onProgress(Math.round(p.progress)) };
        const load = (extra = {}) => (pipeline as any)('image-segmentation', SEGMENT_MODEL, { ...opts, ...extra });
        const model = await load({ device: 'webgpu' }).catch(() => load()); // no WebGPU → wasm
        return model;
    })().catch(err => { segmenter = null; throw err; });
    return segmenter;
}

export async function removeBackground(img: Image64, threshold: number, gain: number, onProgress: (pct: number) => void) {
    const model = await loadSegmenter(onProgress);
    const { RawImage } = await import('@huggingface/transformers');
    const [{ mask }] = await model(await RawImage.fromURL(dataUrl(img)));
    const el = await loadImage(dataUrl(img));
    const { canvas, ctx } = canvas2d(el.naturalWidth, el.naturalHeight);
    ctx.drawImage(el, 0, 0);
    const alpha = mask.width === canvas.width && mask.height === canvas.height ? mask : await mask.resize(canvas.width, canvas.height);
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < alpha.data.length; i++) {
        const a = alpha.data[i];
        px.data[i * 4 + 3] = a > threshold ? Math.min(255, a * gain) : 0;
    }
    ctx.putImageData(px, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
}

// --- Export ---

export async function exportGif(frames: string[], name: string) {
    const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
    const first = await loadImage(frames[0]);
    const w = first.naturalWidth, h = first.naturalHeight;
    const { ctx } = canvas2d(w, h);
    const gif = GIFEncoder();
    for (const frame of [...frames, frames[0]]) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(await loadImage(frame), 0, 0, w, h);
        const px = ctx.getImageData(0, 0, w, h).data;
        const palette = quantize(px, 256, { format: 'rgba4444', oneBitAlpha: true });
        const transparentIndex = palette.findIndex(c => c[3] === 0);
        gif.writeFrame(applyPalette(px, palette, 'rgba4444'), w, h, {
            palette, delay: FRAME_DELAY_MS, transparent: transparentIndex >= 0, transparentIndex: Math.max(0, transparentIndex),
        });
    }
    gif.finish();
    download(new Blob([gif.bytes()], { type: 'image/gif' }), `${slug(name)}.gif`);
}

export async function exportSheet(rows: string[][]) {
    const cols = Math.max(...rows.map(r => r.length + 1)); // +1 closes the loop back to the ref
    const { canvas, ctx } = canvas2d(cols * SHEET_CELL_PX, rows.length * SHEET_CELL_PX);
    for (const [r, row] of rows.entries()) {
        for (const [c, frame] of [...row, row[0]].entries()) {
            ctx.drawImage(await loadImage(frame), c * SHEET_CELL_PX, r * SHEET_CELL_PX, SHEET_CELL_PX, SHEET_CELL_PX);
        }
    }
    canvas.toBlob(blob => blob && download(blob, 'sprite_sheet.png'), 'image/png');
}

// --- Storage ---

export async function storeFrame(img: Image64): Promise<string> {
    const base64 = img.mimeType === 'image/png' ? img.base64 : await toPngBase64(img);
    return (await uploadSpriteFrame(base64)).url;
}

export async function fetchImage64(src: string): Promise<Image64> {
    const blob = await (await fetch(src)).blob();
    return readImageFile(new File([blob], 'frame', { type: blob.type || 'image/png' }));
}

async function toPngBase64(img: Image64) {
    const el = await loadImage(dataUrl(img));
    const { canvas, ctx } = canvas2d(el.naturalWidth, el.naturalHeight);
    ctx.drawImage(el, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
}

// --- Helpers ---

export function readImageFile(file: File): Promise<Image64> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ base64: String(reader.result).split(',')[1], mimeType: file.type || 'image/png' });
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not decode image.'));
        img.src = src;
    });
}

function canvas2d(width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true })! };
}

function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '_');
