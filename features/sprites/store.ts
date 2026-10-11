/**
 * Sprite sessions live here, outside React, so generation keeps running (and
 * saving) when the studio unmounts — switching projects never abandons a run.
 * Each session is one `sprites` artifact; its `html` column holds the SpriteDoc JSON.
 */
import { useSyncExternalStore } from 'react';
import { ANIMATIONS, Backdrop, Image64, fetchImage64, framePrompt, generateFrame, removeBackground, storeFrame } from './engine';

export interface FrameAttempt { prompt: string; error?: string }

export interface SpriteAnim {
    id: string;
    name: string;
    frames: string[]; // stored frame URLs, ref first
    attempts: FrameAttempt[]; // every prompt sent, in order
    status: 'idle' | 'processing' | 'completed' | 'error' | 'interrupted';
}

export interface SpriteSettings {
    frameCount: number;
    backdrop: Backdrop;
    cutout: 'Auto' | 'Off';
    threshold: number;
    alphaGain: number;
}

export interface SpriteDoc {
    version: 1;
    source: string | null; // stored URL of the uploaded reference
    settings: SpriteSettings;
    animations: SpriteAnim[];
}

export interface SpriteSession {
    doc: SpriteDoc;
    generating: boolean;
    modelProgress: number | null; // non-null while the cutout model downloads
    error: string | null;
}

type ArtifactPatch = Record<string, any>;

// ==== SAVE ====
const SAVE_DEBOUNCE_MS = 400;

export const newAnim = (name: string): SpriteAnim => ({ id: crypto.randomUUID(), name, frames: [], attempts: [], status: 'idle' });

export function newSpriteDoc(): SpriteDoc {
    return {
        version: 1,
        source: null,
        settings: { frameCount: 4, backdrop: 'Solid Gray', cutout: 'Auto', threshold: 25, alphaGain: 1.2 },
        animations: ANIMATIONS.slice(0, 3).map(newAnim),
    };
}

function parseDoc(html: string): SpriteDoc {
    try {
        const doc = JSON.parse(html);
        if (doc?.version !== 1 || !Array.isArray(doc.animations)) return newSpriteDoc();
        // A run that was in flight when the page closed can't resume.
        doc.animations = doc.animations.map((a: SpriteAnim) => ({ ...a, attempts: a.attempts ?? [], status: a.status === 'processing' ? 'interrupted' : a.status }));
        return doc;
    } catch {
        return newSpriteDoc();
    }
}

const sessions = new Map<string, SpriteSession>();
const listeners = new Set<() => void>();
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
let saveArtifact: (id: string, patch: ArtifactPatch) => void = () => {};

/** The workspace's persist function (updates local project state + DB). */
export const setSpriteSaver = (fn: typeof saveArtifact) => { saveArtifact = fn; };

const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

function ensure(id: string, html: string): SpriteSession {
    let s = sessions.get(id);
    if (!s) {
        s = { doc: parseDoc(html), generating: false, modelProgress: null, error: null };
        sessions.set(id, s);
    }
    return s;
}

function setSession(id: string, patch: Partial<SpriteSession>) {
    const s = sessions.get(id);
    if (!s) return;
    sessions.set(id, { ...s, ...patch });
    emit();
}

function scheduleSave(id: string, extra?: ArtifactPatch) {
    clearTimeout(saveTimers.get(id));
    const flush = () => {
        saveTimers.delete(id);
        const s = sessions.get(id);
        if (s) saveArtifact(id, { html: JSON.stringify(s.doc), ...extra });
    };
    if (extra) flush(); else saveTimers.set(id, setTimeout(flush, SAVE_DEBOUNCE_MS));
}

export function updateDoc(id: string, fn: (doc: SpriteDoc) => SpriteDoc, extra?: ArtifactPatch) {
    const s = sessions.get(id);
    if (!s) return;
    setSession(id, { doc: fn(s.doc) });
    scheduleSave(id, extra);
}

export const patchAnim = (id: string, animId: string, fn: (a: SpriteAnim) => Partial<SpriteAnim>) =>
    updateDoc(id, doc => ({ ...doc, animations: doc.animations.map(a => a.id === animId ? { ...a, ...fn(a) } : a) }));

export const setError = (id: string, error: string | null) => setSession(id, { error });

export function useSpriteSession(artifactId: string, html: string): SpriteSession {
    ensure(artifactId, html);
    return useSyncExternalStore(subscribe, () => sessions.get(artifactId)!);
}

/** Generate every animation, or only `onlyIds`. Runs to completion regardless of UI. */
export async function generate(id: string, apiKey: string, onlyIds?: string[]) {
    const start = sessions.get(id);
    if (!start || start.generating || !start.doc.source) return;
    if (!apiKey) { setError(id, 'Gemini API key not set. Add it in Settings → Providers.'); return; }

    const { settings } = start.doc;
    const cutout = async (img: Image64): Promise<Image64> => {
        if (settings.cutout === 'Off') return img;
        const base64 = await removeBackground(img, settings.threshold, settings.alphaGain, pct => setSession(id, { modelProgress: pct }));
        setSession(id, { modelProgress: null });
        return { base64, mimeType: 'image/png' };
    };

    setSession(id, { generating: true, error: null });
    saveArtifact(id, { status: 'streaming', errorMessage: null });
    let lastError: string | null = null;

    try {
        let ref = await fetchImage64(start.doc.source);
        try { ref = await cutout(ref); }
        catch (err) { console.warn('Ref cleanup failed', err); setSession(id, { modelProgress: null }); }
        const refUrl = await storeFrame(ref);

        const targets = start.doc.animations.filter(a => !onlyIds || onlyIds.includes(a.id)).map(a => a.id);
        updateDoc(id, doc => ({
            ...doc,
            animations: doc.animations.map(a => targets.includes(a.id) ? { ...a, frames: [refUrl], attempts: [], status: 'processing' } : a),
        }));

        for (const animId of targets) {
            const name = sessions.get(id)?.doc.animations.find(a => a.id === animId)?.name;
            if (!name) continue;
            for (let f = 0; f < settings.frameCount; f++) {
                const prompt = framePrompt(name, f + 2, settings.frameCount + 2, settings.backdrop);
                try {
                    const url = await storeFrame(await cutout(await generateFrame(apiKey, prompt, ref)));
                    patchAnim(id, animId, a => ({ frames: [...a.frames, url], attempts: [...a.attempts, { prompt }] }));
                } catch (err: any) {
                    console.error(`${name} frame ${f + 1} failed:`, err);
                    lastError = err?.message || 'Frame generation failed.';
                    patchAnim(id, animId, a => ({ attempts: [...a.attempts, { prompt, error: lastError! }] }));
                }
            }
            patchAnim(id, animId, a => ({ status: a.frames.length > 1 ? 'completed' : 'error' }));
        }
    } catch (err: any) {
        lastError = err?.message || 'Generation failed.';
        updateDoc(id, doc => ({ ...doc, animations: doc.animations.map(a => a.status === 'processing' ? { ...a, status: 'error' } : a) }));
    } finally {
        setSession(id, { generating: false, modelProgress: null, error: lastError });
        scheduleSave(id, { status: lastError ? 'partial' : 'complete', errorMessage: null });
    }
}
