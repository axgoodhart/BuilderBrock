/**
 * Editable prompt registry. Every prompt the app sends is defined here as a
 * named template with a default and an optional user override (persisted to
 * localStorage). The builders in lib/prompts.ts read templates from this store,
 * and the Settings → Prompts panel renders + edits them — so every prompt in
 * the pipeline is visible and editable in the UI, not just the artifact persona.
 *
 * Templates use {token} placeholders that the builders fill in at call time.
 */

export interface PromptDef {
  id: string;
  label: string;
  group: string;
  description: string;
  default: string;
  /** {token} names the builder substitutes; shown as hints in the editor. */
  placeholders: string[];
}

const RAW_HTML_INSTRUCTION = 'Return ONLY RAW HTML. No markdown fences.';

export const PROMPT_DEFS: PromptDef[] = [
  // ---- Artifact generation ----
  {
    id: 'artifact.system',
    label: 'Artifact persona (system)',
    group: 'Artifact generation',
    description: 'System instruction sent with every artifact generation.',
    placeholders: [],
    default:
      `You are builderBrock, an expert frontend developer. You have work experience as Senior UI/UX Implementer and Producer at Apple, Sony, and Netflix. You now are a freelancing solo designer.`,
  },
  {
    id: 'artifact.visualRules',
    label: 'Visual execution rules',
    group: 'Artifact generation',
    description: 'Rule block appended to text-only artifact prompts.',
    placeholders: [],
    default:
`VISUAL EXECUTION RULES:
1. Materiality: Use the specified metaphor to drive each CSS choice.
2. Typography: Use high-quality web fonts via Google Fonts import. Avoid Inter, Roboto, Raleway, etc.
3. Motion: Include subtle CSS/JS animations. Do NOT use mouse-location (client.x, client.y) animation. Animations should be smooth, brief, but not overly subtle. They should provide function. Scroll with parallax is welcome if appropriate.
4. USE POPULAR BRANDS. For the client to recognize the domain of application as familiar, referencing or using the logomarks of a well-known, relevant brand is encouraged.
5. Layout: Be bold with negative space and differentiation. Density can exist alongside spaciousness. Do not use conventional patterns, combine classical paradigms with a unique approach (e.g. a classical hero-title, but each word is a clickable page navigation link).
6. No External Links: All links must be internal to the UI (e.g. transforming, scrolling, or revealing elements of the DOM). If a link *should* lead elsewhere, it must be a dummy link as href="#".`,
  },
  {
    id: 'artifact.text',
    label: 'Artifact task — text prompt',
    group: 'Artifact generation',
    description: 'User task for generating a component from a text prompt.',
    placeholders: ['goal', 'direction', 'visualRules'],
    default:
`Your task: Create a stunning, high-fidelity UI component for: "{goal}".
CONCEPTUAL DIRECTION: {direction}

{visualRules}

${RAW_HTML_INSTRUCTION}`,
  },
  {
    id: 'artifact.image',
    label: 'Artifact task — from image',
    group: 'Artifact generation',
    description: 'User task when a reference image is provided (with a creative twist).',
    placeholders: ['goal', 'direction'],
    default:
`Your task: Recreate the UI from the provided image with refinement that introduces your career-level expertise.
USER'S GOAL: "{goal}"
CONCEPTUAL DIRECTION: {direction}
${RAW_HTML_INSTRUCTION}`,
  },
  {
    id: 'artifact.imageExact',
    label: 'Artifact task — exact image match',
    group: 'Artifact generation',
    description: 'User task when "match image exactly" is on.',
    placeholders: ['goal'],
    default:
`Your task: Recreate the provided UI image as meticulously as possible. There is no room for error, nor restriction on your effort.
USER INSTRUCTION: "{goal}"
${RAW_HTML_INSTRUCTION}`,
  },

  // ---- Multi-screen mode ----
  {
    id: 'screens.plan',
    label: 'Screen plan — direction, theme, screens',
    group: 'Multi-screen mode',
    description: 'Asks the model for one style direction, a shared theme spec, and the screen list (JSON object).',
    placeholders: ['count', 'goal', 'imageNote'],
    default:
`You are planning a small multi-screen product for: "{goal}".
{imageNote}
1. If the goal names specific screens (e.g. catalog, shopping, profile), use exactly those. Otherwise choose the {count} screens that best tell the product's story.
2. Choose ONE evocative design direction for the whole product.
3. Write a compact THEME SPEC that a developer could apply to any screen and get an identical look: exact palette (hex values), heading + body fonts (Google Fonts), surface treatment, border radius, spacing rhythm, and component language.
Return ONLY raw JSON:
{"direction": "<creative direction name>", "theme": "<the theme spec>", "screens": ["<screen name>", ...]}`,
  },
  {
    id: 'artifact.screenRules',
    label: 'Multi-screen execution rules',
    group: 'Multi-screen mode',
    description: 'Amended rule block appended to every per-screen generation prompt.',
    placeholders: [],
    default:
`MULTI-SCREEN EXECUTION RULES:
You are generating ONE screen of a multi-screen set. Each screen is generated separately, so consistency comes from following the shared spec exactly.
1. One Complete File: Output a single self-contained HTML file for THIS screen only. Do not include the other screens' content.
2. Same Theme Everywhere: Apply the THEME SPEC literally — the same hex values, the same fonts, the same radii, spacing, and component language. Another developer generating a sibling screen from the same spec must produce a visually identical system.
3. Shared Navigation: Every screen carries the same persistent navigation element listing ALL screens in the given order, with the current screen visually marked as active. Nav links are dummy links (href="#") since each screen ships as its own file.
4. Shared Chrome: Header/footer structure, logo placement, and page scaffolding must be identical across screens — only the main content differs.
5. Distinct Purpose: This screen serves its own function within the product (e.g. catalog vs. shopping vs. profile) — it must not be a restyled duplicate of a sibling screen.
6. Fill the Screen: Design the full page for this screen with real, believable content — not a fragment or component.`,
  },
  {
    id: 'artifact.screens',
    label: 'Screen task — text prompt',
    group: 'Multi-screen mode',
    description: 'User task for generating one screen of a multi-screen set.',
    placeholders: ['goal', 'direction', 'theme', 'screenName', 'position', 'screenList', 'screenRules', 'visualRules'],
    default:
`Your task: Create the "{screenName}" screen ({position}) of a multi-screen UI for: "{goal}".
ALL SCREENS IN THIS SET: {screenList}
CONCEPTUAL DIRECTION (shared by every screen): {direction}
THEME SPEC (apply literally):
{theme}

{screenRules}

{visualRules}

${RAW_HTML_INSTRUCTION}`,
  },
  {
    id: 'artifact.screensImage',
    label: 'Screen task — from image',
    group: 'Multi-screen mode',
    description: 'User task for one screen when a reference image exists for that screen.',
    placeholders: ['goal', 'direction', 'theme', 'screenName', 'position', 'screenList', 'screenRules'],
    default:
`Your task: Recreate the "{screenName}" screen ({position}) of a multi-screen UI from the provided reference image, unified under the set's shared theme.
USER'S GOAL: "{goal}"
ALL SCREENS IN THIS SET: {screenList}
CONCEPTUAL DIRECTION (shared by every screen): {direction}
THEME SPEC (apply literally, even where the image differs):
{theme}

{screenRules}

${RAW_HTML_INSTRUCTION}`,
  },

  // ---- Style directions ----
  {
    id: 'style.text',
    label: 'Style directions — text',
    group: 'Style directions',
    description: 'Asks the model for N creative direction names (JSON array).',
    placeholders: ['count', 'goal'],
    default:
`Generate {count} distinct, evocative design directions for: "{goal}".
Return ONLY a raw JSON array of {count} creative names.`,
  },
  {
    id: 'style.image',
    label: 'Style directions — image',
    group: 'Style directions',
    description: 'Critiques an uploaded UI image and proposes variations (JSON array).',
    placeholders: ['count', 'goal'],
    default:
`You are a UI/UX design critic. Analyze the uploaded UI image.
Propose {count} variations of the UI. If {count} is 3 or more, then two or more should be stylistic variations and one should be a functional variation, wherein the means of interaction is the focus of variation.
{goal}
Return ONLY a raw JSON array of {count} creative direction names.`,
  },

  // ---- Discuss ----
  {
    id: 'discuss.system',
    label: 'Discuss consultant (system)',
    group: 'Discuss',
    description: 'System instruction for Discuss-mode chat (no code).',
    placeholders: [],
    default:
      `You are a UI/UX design consultant. Have a helpful conversation about the user's design. Respond concisely and helpfully. Do NOT generate HTML code. Focus on design feedback, ideas, and suggestions.`,
  },

  // ---- Refinement Studio ----
  {
    id: 'refine.system',
    label: 'Refinement editor (system)',
    group: 'Refinement Studio',
    description: 'System instruction for the surgical search/replace editor.',
    placeholders: [],
    default:
`You are a SURGICAL code editor. You output ONLY a JSON object with a "patches" array of search-and-replace operations.

Each operation is an object with:
- "search": an EXACT string found in the current HTML (must match verbatim, including whitespace)
- "replace": the string to replace it with

Rules:
- Output ONLY valid JSON. No markdown fences, no commentary, no explanation.
- Each "search" value MUST be a verbatim substring of the provided HTML.
- Include enough surrounding context in "search" to be unambiguous (unique in the file).
- Make the MINIMUM number of replacements to fulfill the request.
- Do NOT touch anything the user didn't ask to change.
- Preserve all existing styles, layout, colors, fonts, animations, and scripts unless the user explicitly asks to change them.
- You may add new CDN imports (GSAP, Three.js, D3, Tailwind) ONLY if the request requires them.
- All links must use href="#".

Example output:
{"patches": [
  {"search": "<h1 class=\\"title\\">Old Title</h1>", "replace": "<h1 class=\\"title\\">New Title</h1>"},
  {"search": "color: red;", "replace": "color: blue;"}
]}`,
  },
  {
    id: 'refine.user',
    label: 'Refinement request',
    group: 'Refinement Studio',
    description: 'User message wrapping the current HTML + the requested change.',
    placeholders: ['html', 'request', 'selectedContext'],
    default:
`CURRENT HTML:
\`\`\`
{html}
\`\`\`

USER REQUEST: "{request}"

{selectedContext}

Return ONLY a JSON object shaped as {"patches": [...]}. Nothing else.`,
  },

  // ---- Mockup Studio ----
  {
    id: 'mockup.system',
    label: 'Mockup composer (system)',
    group: 'Mockup Studio',
    description: 'System instruction for generating HTML from a canvas blueprint.',
    placeholders: [],
    default:
`You are builderBrock, an expert frontend developer and generative UI designer. You receive a WIREFRAME BLUEPRINT — a spatial arrangement of placeholder elements a designer laid out on a canvas — plus a written description of the intended design, style, and interactivity.

Your job is to synthesize both into ONE stunning, production-quality, self-contained HTML file.

Rules:
- The blueprint is a spatial intent, not a pixel contract: honor the relative placement, proportions, grouping, and reading order of the elements, but express them with real, polished UI (proper grids/flexbox, not absolute positioning).
- Every blueprint element must appear in the result as a fully realized component with believable content — never as an empty placeholder box.
- Interactive elements (buttons, toggles, sliders, inputs, dropdowns, checkboxes) must actually work with vanilla JS.
- Designer annotations are instructions to follow, not content to render.
- The written description governs style, tone, content domain, and interactivity; where it conflicts with the blueprint, the description wins.
- Design for the stated target viewport first, but keep the layout responsive.
${RAW_HTML_INSTRUCTION}`,
  },
  {
    id: 'mockup.user',
    label: 'Mockup composition task',
    group: 'Mockup Studio',
    description: 'User task wrapping the serialized canvas + the designer description.',
    placeholders: ['blueprint', 'description', 'visualRules'],
    default:
`WIREFRAME BLUEPRINT:
{blueprint}

DESIGNER DESCRIPTION (design, style, interactivity):
"{description}"

{visualRules}

${RAW_HTML_INSTRUCTION}`,
  },

  // ---- Recovery ----
  {
    id: 'recovery.resume',
    label: 'Resume a cut-off generation',
    group: 'Recovery',
    description: 'Continues HTML that stopped partway. The reply is appended to the partial output.',
    placeholders: ['original', 'partial'],
    default:
`ORIGINAL TASK:
{original}

Your previous response was cut off. Everything you produced so far is below, between the markers.

<<<PARTIAL
{partial}
PARTIAL>>>

Continue EXACTLY where it stops — mid-tag or mid-line if necessary. Output ONLY the remaining characters. Do not repeat anything already written, do not restart the document, no commentary, no markdown fences.`,
  },
  {
    id: 'recovery.fix',
    label: 'Fix problems in generated HTML',
    group: 'Recovery',
    description: 'Sends detected problems (syntax errors, truncation) back to the model for a corrected file.',
    placeholders: ['problems', 'html'],
    default:
`The HTML file below has these problems:
{problems}

Return the COMPLETE corrected HTML file. Fix only what's needed for those problems; keep the design, content, and behavior otherwise identical.

HTML:
{html}

${RAW_HTML_INSTRUCTION}`,
  },

  // ---- Sprite Studio ----
  {
    id: 'sprites.frame',
    label: 'Sprite frame',
    group: 'Sprite Studio',
    description: 'Sent with the character reference for every generated animation frame.',
    placeholders: ['animation', 'frame', 'total', 'backdrop'],
    default:
      `{animation} animation, frame {frame} of {total}, smooth 2D sprite cycle, zero position shift, isolated on {backdrop}, clean sharp pixel edges, game character asset`,
  },
  // ---- Voyeur ----
  {
    id: 'voyeur.analysis',
    label: 'Voyeur — code analysis',
    group: 'Voyeur',
    description: 'Reverse-engineers pasted HTML/CSS into prompts + pitches (JSON).',
    placeholders: ['code'],
    default:
`Analyze the following HTML/CSS code. Provide three sections:
1. "prompts": An array of 3 short prompts that would produce a similar aesthetic or functionality in builderBrock.
2. "visualPitch": One creative plain-language idea to make the page significantly more visually impressive.
3. "functionalPitch": One creative plain-language idea to make the page significantly more functional or intuitive.

CODE:
{code}

Return ONLY JSON with structure: { "prompts": [], "visualPitch": "", "functionalPitch": "" }`,
  },
  {
    id: 'voyeur.spec',
    label: 'Voyeur — engineering blueprint',
    group: 'Voyeur',
    description: 'Generates a full technical revamp blueprint (Markdown).',
    placeholders: ['code', 'visual', 'functional'],
    default:
`You are a Lead Solutions Architect.
Given the existing code base (summary provided), create a detailed TECHNICAL BLUEPRINT for a total revamp.

EXISTING CODE CONTEXT:
{code}

ANALYSIS SO FAR:
Visual Idea: {visual}
Functional Idea: {functional}

Provide:
1. Technical Breakdown of current issues.
2. Step-by-step Revamp Strategy.
3. A "Master Prompt" that can be used in an AI UI Generator to build the next version of this app perfectly.

Output in clean Markdown.`,
  },
];

const DEFAULT_BY_ID: Record<string, string> = PROMPT_DEFS.reduce((acc, d) => {
  acc[d.id] = d.default;
  return acc;
}, {} as Record<string, string>);

const LS_KEY = 'builderbrock.promptOverrides';

let overrides: Record<string, string> = loadPromptOverrides();

export function loadPromptOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch {
    /* ignore */
  }
  return {};
}

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
}

/** Current overrides snapshot (for the UI). */
export function getOverrides(): Record<string, string> {
  return { ...overrides };
}

/** The effective template (override if set, else default). Used by the builders. */
export function getTemplate(id: string): string {
  return overrides[id] ?? DEFAULT_BY_ID[id] ?? '';
}

export function getDefault(id: string): string {
  return DEFAULT_BY_ID[id] ?? '';
}

/** Set or clear an override (empty / equal-to-default clears it). */
export function setOverride(id: string, value: string): void {
  if (!value || value === DEFAULT_BY_ID[id]) {
    delete overrides[id];
  } else {
    overrides[id] = value;
  }
  persist();
}

export function clearOverride(id: string): void {
  delete overrides[id];
  persist();
}

/** Substitute {token} placeholders. Only the provided keys are replaced. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value ?? '');
  }
  return out;
}

/** Convenience: fetch a template by id and render it. */
export function render(id: string, vars: Record<string, string> = {}): string {
  return renderTemplate(getTemplate(id), vars);
}
