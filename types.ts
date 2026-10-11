
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface Artifact {
  id: string;
  styleName: string;
  html: string;
  status: 'streaming' | 'complete' | 'partial' | 'interrupted' | 'error';
}

export interface Session {
    id: string;
    prompt: string;
    timestamp: number;
    artifacts: Artifact[];
    image?: { data: string; mimeType: string };
    calibration?: CalibrationData;
    dbProjectId?: string;
}

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

export interface ComponentVariation { name: string; html: string; }
export interface LayoutOption { name: string; css: string; previewHtml: string; }

export interface CalibrationData {
    style: {
        lookAndFeel: string;
        density: string;
    };
    architecture: {
        navigation: string;
        hierarchy: string;
    };
    elements: string[];
    context: string;
}

export interface VoyeurAnalysis {
    prompts: string[];
    pitch: {
        visual: string;
        functional: string;
    };
    spec?: string;
}

export type ChatMode = 'discuss' | 'implement';

/**
 * What kind of thing a project creates. Distinct from `mode`, which mixes
 * model/provider values, 'mockup', and 'user-edits'.
 */
export type CreationMode = 'web' | 'mockup' | 'omneon';

/** Artifact payload kinds: generated HTML page vs versioned 3D scene. */
export type ArtifactKind = 'web' | 'scene';

/**
 * How Implement mode structures a generation:
 * - 'variants': N artifacts, each a different style direction on one screen (original behavior).
 * - 'screens': ONE artifact — a single theme spanning 2-3 screens with built-in navigation.
 */
export type GenerationMode = 'variants' | 'screens';

export type ReasoningEffort = 'low' | 'medium' | 'high';

/* ------------------------------------------------------------------ */
/* Mockup Studio (generative canvas)                                   */
/* ------------------------------------------------------------------ */

export type MockupViewport = 'desktop' | 'tablet' | 'mobile';

export type MockupElementKind =
    | 'section' | 'card' | 'navbar' | 'image' | 'title' | 'text'
    | 'button' | 'toggle' | 'slider' | 'input' | 'dropdown' | 'checkbox' | 'chip'
    | 'note';

/** One placed element on the mockup canvas. Coordinates are % of the canvas (0-100). */
export interface MockupElement {
    id: string;
    kind: MockupElementKind;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    z: number;
}

/** A whole canvas: what Mockup Studio edits, saves as a draft, and stores with each generated mockup. */
export interface MockupWireframe {
    elements: MockupElement[];
    viewport: MockupViewport;
    description: string;
}

export interface WorkspaceSettings {
    model: string;
    temperature: number;
    artifactCount: number;
    /** Input mode for Implement: style variants vs one multi-screen artifact. */
    generationMode: GenerationMode;
    /** Screens per artifact in 'screens' mode (2 or 3). */
    screenCount: number;
    matchImageExactly: boolean;
    /** Optional structured design calibration injected into generation prompts. */
    calibration?: CalibrationData | null;
    /** Reasoning effort for thinking-capable models. Undefined = model default. */
    reasoningEffort?: ReasoningEffort;
}
