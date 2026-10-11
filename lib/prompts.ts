/**
 * Prompt builders. The actual prompt TEXT lives in lib/promptStore.ts as
 * editable templates (defaults + user overrides surfaced in Settings → Prompts).
 * These functions just pick the right template and fill in {token} placeholders,
 * so editing a prompt in the UI immediately changes what gets sent.
 */
import { CalibrationData } from '../types';
import { getTemplate, render } from './promptStore';

/* ------------------------------------------------------------------ */
/* Artifact generation                                                 */
/* ------------------------------------------------------------------ */

/** The system instruction for artifact generation (editable: artifact.system). */
export function artifactSystemPrompt(): string {
  return getTemplate('artifact.system');
}

/** Format calibration choices into an injectable prompt block (skips blanks / "AI Optimized"). */
export function calibrationToBlock(c?: CalibrationData | null): string {
  if (!c) return '';
  const skip = (v?: string) => !v || v === 'AI Optimized';
  const lines: string[] = [];
  if (!skip(c.style?.lookAndFeel)) lines.push(`- Look & feel: ${c.style.lookAndFeel}`);
  if (!skip(c.style?.density)) lines.push(`- Information density: ${c.style.density}`);
  if (!skip(c.architecture?.navigation)) lines.push(`- Navigation: ${c.architecture.navigation}`);
  if (!skip(c.architecture?.hierarchy)) lines.push(`- Hierarchy: ${c.architecture.hierarchy}`);
  if (c.elements?.length) lines.push(`- Required elements: ${c.elements.join(', ')}`);
  if (c.context?.trim()) lines.push(`- Context / intent: ${c.context.trim()}`);
  if (!lines.length) return '';
  return `DESIGN CALIBRATION (honor these closely):\n${lines.join('\n')}`;
}

export interface StyleDirectionsArgs {
  count: number;
  goal: string;
  hasImage: boolean;
}

/** Prompt that asks the model for N creative direction names (returns a JSON array). */
export function buildStyleDirectionsPrompt({ count, goal, hasImage }: StyleDirectionsArgs): string {
  if (hasImage) {
    return render('style.image', {
      count: String(count),
      goal: goal ? `User's goal: "${goal}"` : '',
    }).trim();
  }
  return render('style.text', { count: String(count), goal }).trim();
}

export interface ArtifactPromptArgs {
  goal: string;
  direction: string;
  hasImage: boolean;
  matchExactly: boolean;
  calibration?: CalibrationData | null;
}

/** The user prompt (task) for generating a single artifact variant. */
export function buildArtifactUserPrompt({ goal, direction, hasImage, matchExactly, calibration }: ArtifactPromptArgs): string {
  const calibrationBlock = calibrationToBlock(calibration);
  const withCalibration = (body: string) => (calibrationBlock ? `${body}\n\n${calibrationBlock}` : body);

  if (hasImage && matchExactly) {
    return withCalibration(render('artifact.imageExact', { goal: goal || 'No additional instructions' }));
  }
  if (hasImage) {
    return withCalibration(render('artifact.image', { goal, direction }));
  }
  return withCalibration(render('artifact.text', {
    goal,
    direction,
    visualRules: getTemplate('artifact.visualRules'),
  }));
}

/* ------------------------------------------------------------------ */
/* Multi-screen mode                                                   */
/* ------------------------------------------------------------------ */

export interface ScreensPlanArgs {
  count: number;
  goal: string;
  imageCount: number;
}

/** Prompt asking for one direction + shared theme spec + screen names (returns a JSON object). */
export function buildScreensPlanPrompt({ count, goal, imageCount }: ScreensPlanArgs): string {
  const imageNote = imageCount > 0
    ? `${imageCount} reference image${imageCount === 1 ? ' is' : 's are'} attached — one per screen, in order. Derive the screens and the theme from them (name each screen after what its image shows).`
    : '';
  return render('screens.plan', { count: String(count), goal, imageNote }).trim();
}

export interface ScreenArtifactArgs {
  goal: string;
  direction: string;
  theme: string;
  screenName: string;
  screenIndex: number;
  screens: string[];
  hasImage: boolean;
  calibration?: CalibrationData | null;
}

/** The user prompt for generating ONE screen (its own HTML file) of a multi-screen set. */
export function buildScreenArtifactPrompt({ goal, direction, theme, screenName, screenIndex, screens, hasImage, calibration }: ScreenArtifactArgs): string {
  const vars = {
    goal,
    direction,
    theme,
    screenName,
    position: `screen ${screenIndex + 1} of ${screens.length}`,
    screenList: screens.join(', '),
    screenRules: getTemplate('artifact.screenRules'),
    visualRules: getTemplate('artifact.visualRules'),
  };
  const body = hasImage
    ? render('artifact.screensImage', vars)
    : render('artifact.screens', vars);
  const calibrationBlock = calibrationToBlock(calibration);
  return calibrationBlock ? `${body}\n\n${calibrationBlock}` : body;
}

/* ------------------------------------------------------------------ */
/* Discuss mode                                                        */
/* ------------------------------------------------------------------ */

/** System instruction for discuss mode (editable: discuss.system). */
export function discussSystemPrompt(): string {
  return getTemplate('discuss.system');
}

export function buildDiscussUserPrompt(args: { contextParts: string[]; conversation: string }): string {
  const { contextParts, conversation } = args;
  const context = contextParts.length ? `Context:\n${contextParts.join('\n')}\n\n` : '';
  return `${context}Conversation so far:\n${conversation}`;
}

/* ------------------------------------------------------------------ */
/* Refinement Studio (surgical search/replace editor)                  */
/* ------------------------------------------------------------------ */

/** System instruction for the refinement editor (editable: refine.system). */
export function refinementSystemPrompt(): string {
  return getTemplate('refine.system');
}

export function buildRefinementUserPrompt(args: { html: string; request: string; selectedContext?: string }): string {
  const { html, request, selectedContext } = args;
  return render('refine.user', {
    html,
    request,
    selectedContext: selectedContext ? `SELECTED AREA (focus changes here):\n${selectedContext}` : '',
  });
}

/* ------------------------------------------------------------------ */
/* Mockup Studio (generative canvas)                                   */
/* ------------------------------------------------------------------ */

/** System instruction for the mockup composer (editable: mockup.system). */
export function mockupSystemPrompt(): string {
  return getTemplate('mockup.system');
}

export interface MockupPromptArgs {
  blueprint: string;
  description: string;
  calibration?: CalibrationData | null;
}

/** The user prompt for generating one HTML file from a canvas blueprint. */
export function buildMockupUserPrompt({ blueprint, description, calibration }: MockupPromptArgs): string {
  const body = render('mockup.user', {
    blueprint,
    description: description || 'No additional instructions — infer the intent from the blueprint.',
    visualRules: getTemplate('artifact.visualRules'),
  });
  const calibrationBlock = calibrationToBlock(calibration);
  return calibrationBlock ? `${body}\n\n${calibrationBlock}` : body;
}

/* ------------------------------------------------------------------ */
/* Recovery (resume / fix)                                             */
/* ------------------------------------------------------------------ */

export function buildResumePrompt(args: { original: string; partial: string }): string {
  return render('recovery.resume', args);
}

export function buildFixPrompt(args: { problems: string[]; html: string }): string {
  return render('recovery.fix', { problems: args.problems.map(p => `- ${p}`).join('\n'), html: args.html });
}

/* ------------------------------------------------------------------ */
/* Voyeur (reverse-engineering analysis)                               */
/* ------------------------------------------------------------------ */

export function buildVoyeurAnalysisPrompt(code: string): string {
  return render('voyeur.analysis', { code: code.substring(0, 10000) });
}

export function buildVoyeurSpecPrompt(args: { code: string; visual: string; functional: string }): string {
  return render('voyeur.spec', {
    code: args.code.substring(0, 5000),
    visual: args.visual,
    functional: args.functional,
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Flatten a system+prompt pair into one string for storage/display (revision history, artifact.prompt). */
export function resolveEffectivePrompt(system: string | undefined, prompt: string): string {
  return system ? `[SYSTEM]\n${system}\n\n[PROMPT]\n${prompt}` : prompt;
}

/** Inverse of resolveEffectivePrompt — rebuilds a request from a stored artifact prompt. */
export function splitEffectivePrompt(stored: string): { system?: string; prompt: string } {
  const m = stored.match(/^\[SYSTEM\]\n([\s\S]*?)\n\n\[PROMPT\]\n([\s\S]*)$/);
  return m ? { system: m[1], prompt: m[2] } : { prompt: stored };
}
