/**
 * Mockup Studio blueprint helpers: the element catalog the palette renders,
 * layout presets that stamp several elements at once, and the serializer that
 * turns the canvas into the text blueprint sent to the model.
 */
import { MockupElement, MockupElementKind, MockupViewport, MockupWireframe } from '../types';
import { generateId } from '../utils';

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export interface ElementDef {
    kind: MockupElementKind;
    label: string;
    /** How the element is described to the model. */
    describe: string;
    /** Default size when stamped onto the canvas, in % of canvas. */
    width: number;
    height: number;
}

const DEF_LIST: ElementDef[] = [
    { kind: 'section',  label: 'Section',    describe: 'content section / container block', width: 40, height: 28 },
    { kind: 'card',     label: 'Card',       describe: 'card surface (elevated, rounded)',  width: 28, height: 32 },
    { kind: 'navbar',   label: 'Nav Bar',    describe: 'navigation bar with links',         width: 90, height: 8 },
    { kind: 'image',    label: 'Image',      describe: 'image / media placeholder',         width: 26, height: 30 },
    { kind: 'title',    label: 'Title',      describe: 'heading text',                      width: 30, height: 8 },
    { kind: 'text',     label: 'Text',       describe: 'body text block (paragraph lines)', width: 28, height: 16 },
    { kind: 'button',   label: 'Button',     describe: 'clickable button',                  width: 14, height: 6 },
    { kind: 'toggle',   label: 'Toggle',     describe: 'on/off toggle switch',              width: 8,  height: 5 },
    { kind: 'slider',   label: 'Slider',     describe: 'range slider control',              width: 30, height: 4 },
    { kind: 'input',    label: 'Text Input', describe: 'text input field',                  width: 24, height: 6 },
    { kind: 'dropdown', label: 'Dropdown',   describe: 'dropdown / select menu',            width: 18, height: 6 },
    { kind: 'checkbox', label: 'Checkbox',   describe: 'checkbox with label',               width: 14, height: 4 },
    { kind: 'chip',     label: 'Info Chip',  describe: 'small info chip / badge',           width: 10, height: 4 },
    { kind: 'note',     label: 'Note',       describe: 'designer annotation (not a visible element)', width: 22, height: 12 },
];

export const ELEMENT_DEFS: Record<MockupElementKind, ElementDef> = DEF_LIST.reduce((acc, d) => {
    acc[d.kind] = d;
    return acc;
}, {} as Record<MockupElementKind, ElementDef>);

/** Palette groups mirroring the studio's left-panel tabs. */
export const PALETTE_TABS: { id: 'layout' | 'inputs'; label: string; kinds: MockupElementKind[] }[] = [
    { id: 'layout', label: 'Layout',          kinds: ['section', 'card', 'navbar', 'image', 'title', 'text'] },
    { id: 'inputs', label: 'Input / Buttons', kinds: ['button', 'toggle', 'slider', 'input', 'dropdown', 'checkbox', 'chip'] },
];

/* ------------------------------------------------------------------ */
/* Layout presets                                                      */
/* ------------------------------------------------------------------ */

export interface LayoutPreset {
    id: string;
    label: string;
    group: 'page' | 'section';
    /** Elements stamped when applied; positions/sizes in % of canvas. */
    elements: { kind: MockupElementKind; label: string; x: number; y: number; width: number; height: number }[];
}

export const PRESET_GROUPS: { id: LayoutPreset['group']; label: string }[] = [
    { id: 'page',    label: 'Page Layouts' },
    { id: 'section', label: 'Sections' },
];

export const LAYOUT_PRESETS: LayoutPreset[] = [
    {
        id: 'hero-bar',
        label: 'Hero + Bar',
        group: 'page',
        elements: [
            { kind: 'navbar',  label: 'Nav',       x: 5, y: 4,  width: 90, height: 8 },
            { kind: 'section', label: 'Hero',      x: 5, y: 16, width: 90, height: 46 },
            { kind: 'section', label: 'Highlights', x: 5, y: 66, width: 90, height: 22 },
        ],
    },
    {
        id: 'split-cards',
        label: 'Split + Cards',
        group: 'page',
        elements: [
            { kind: 'section', label: 'Main Panel', x: 5,  y: 6,  width: 42, height: 84 },
            { kind: 'card',    label: 'Card A',     x: 52, y: 6,  width: 43, height: 40 },
            { kind: 'card',    label: 'Card B',     x: 52, y: 50, width: 43, height: 40 },
        ],
    },
    {
        id: 'mosaic',
        label: 'Mosaic Grid',
        group: 'page',
        elements: [
            { kind: 'card',    label: 'Feature',  x: 5,  y: 6,  width: 40, height: 38 },
            { kind: 'card',    label: 'Detail',   x: 50, y: 6,  width: 45, height: 24 },
            { kind: 'card',    label: 'Gallery',  x: 50, y: 34, width: 45, height: 42 },
            { kind: 'section', label: 'Footer',   x: 5,  y: 48, width: 40, height: 28 },
        ],
    },
    {
        id: 'navigation',
        label: 'Navigation',
        group: 'section',
        elements: [
            { kind: 'navbar', label: 'Nav',     x: 5,  y: 4, width: 90, height: 8 },
            { kind: 'button', label: 'Sign Up', x: 81, y: 5, width: 12, height: 6 },
        ],
    },
    {
        id: 'hero',
        label: 'Hero Section',
        group: 'section',
        elements: [
            { kind: 'section', label: 'Hero',         x: 5,  y: 6,  width: 90, height: 66 },
            { kind: 'chip',    label: 'Announcement', x: 44, y: 14, width: 12, height: 4 },
            { kind: 'title',   label: 'Headline',     x: 20, y: 22, width: 60, height: 12 },
            { kind: 'text',    label: 'Subheadline',  x: 28, y: 38, width: 44, height: 10 },
            { kind: 'button',  label: 'Get Started',  x: 35, y: 54, width: 14, height: 6 },
            { kind: 'button',  label: 'Learn More',   x: 51, y: 54, width: 14, height: 6 },
        ],
    },
    {
        id: 'features',
        label: 'Features',
        group: 'section',
        elements: [
            { kind: 'title', label: 'Features',     x: 5,  y: 4,  width: 40, height: 8 },
            { kind: 'card',  label: 'Main Feature', x: 5,  y: 16, width: 58, height: 62 },
            { kind: 'text',  label: 'Feature Copy', x: 9,  y: 60, width: 40, height: 12 },
            { kind: 'card',  label: 'Feature 2',    x: 66, y: 16, width: 29, height: 30 },
            { kind: 'card',  label: 'Feature 3',    x: 66, y: 48, width: 29, height: 30 },
        ],
    },
    {
        id: 'bento',
        label: 'Bento',
        group: 'section',
        elements: [
            { kind: 'card',   label: 'Stat Tile',        x: 5,  y: 8,  width: 32, height: 30 },
            { kind: 'card',   label: 'Chart Tile',       x: 40, y: 8,  width: 55, height: 30 },
            { kind: 'card',   label: 'Workflow Tile',    x: 5,  y: 42, width: 58, height: 34 },
            { kind: 'slider', label: 'Progress',         x: 9,  y: 56, width: 50, height: 4 },
            { kind: 'card',   label: 'Integration Tile', x: 66, y: 42, width: 29, height: 34 },
        ],
    },
    {
        id: 'social-proof',
        label: 'Social Proof',
        group: 'section',
        elements: [
            { kind: 'title',   label: 'Loved by Teams',       x: 30, y: 4,  width: 40, height: 8 },
            { kind: 'card',    label: 'Testimonial',          x: 5,  y: 22, width: 28, height: 40 },
            { kind: 'card',    label: 'Featured Testimonial', x: 36, y: 18, width: 28, height: 48 },
            { kind: 'card',    label: 'Testimonial',          x: 67, y: 22, width: 28, height: 40 },
            { kind: 'section', label: 'Logo Strip',           x: 5,  y: 72, width: 90, height: 10 },
        ],
    },
    {
        id: 'comparison',
        label: 'Comparison',
        group: 'section',
        elements: [
            { kind: 'title',   label: 'Why Us',          x: 30, y: 4,  width: 40, height: 8 },
            { kind: 'section', label: 'Alternatives',    x: 8,  y: 20, width: 40, height: 52 },
            { kind: 'text',    label: 'Their Limits',    x: 12, y: 30, width: 32, height: 34 },
            { kind: 'card',    label: 'Our Product',     x: 52, y: 18, width: 40, height: 56 },
            { kind: 'text',    label: 'Our Advantages',  x: 56, y: 28, width: 32, height: 36 },
        ],
    },
    {
        id: 'pricing',
        label: 'Pricing',
        group: 'section',
        elements: [
            { kind: 'title',  label: 'Pricing',           x: 30, y: 4,  width: 40, height: 8 },
            { kind: 'toggle', label: 'Monthly / Yearly',  x: 46, y: 14, width: 8,  height: 5 },
            { kind: 'card',   label: 'Basic Plan',        x: 5,  y: 24, width: 28, height: 58 },
            { kind: 'card',   label: 'Pro Plan (Featured)', x: 36, y: 20, width: 28, height: 66 },
            { kind: 'card',   label: 'Enterprise Plan',   x: 67, y: 24, width: 28, height: 58 },
            { kind: 'button', label: 'Choose Basic',      x: 9,  y: 72, width: 20, height: 6 },
            { kind: 'button', label: 'Choose Pro',        x: 40, y: 76, width: 20, height: 6 },
            { kind: 'button', label: 'Choose Enterprise', x: 71, y: 72, width: 20, height: 6 },
        ],
    },
    {
        id: 'faq',
        label: 'FAQ',
        group: 'section',
        elements: [
            { kind: 'title', label: 'Frequently Asked',        x: 25, y: 4,  width: 50, height: 8 },
            { kind: 'card',  label: 'Question 1',              x: 15, y: 16, width: 70, height: 9 },
            { kind: 'card',  label: 'Question 2 (expanded)',   x: 15, y: 28, width: 70, height: 20 },
            { kind: 'card',  label: 'Question 3',              x: 15, y: 51, width: 70, height: 9 },
            { kind: 'card',  label: 'Question 4',              x: 15, y: 63, width: 70, height: 9 },
        ],
    },
    {
        id: 'contact',
        label: 'Contact',
        group: 'section',
        elements: [
            { kind: 'title',  label: 'Get in Touch', x: 5,  y: 8,  width: 36, height: 8 },
            { kind: 'text',   label: 'Contact Info', x: 5,  y: 20, width: 34, height: 20 },
            { kind: 'card',   label: 'Contact Form', x: 45, y: 8,  width: 50, height: 64 },
            { kind: 'input',  label: 'Name',         x: 49, y: 14, width: 20, height: 6 },
            { kind: 'input',  label: 'Email',        x: 71, y: 14, width: 20, height: 6 },
            { kind: 'input',  label: 'Message',      x: 49, y: 24, width: 42, height: 26 },
            { kind: 'button', label: 'Send Message', x: 71, y: 58, width: 20, height: 6 },
        ],
    },
    {
        id: 'auth',
        label: 'Auth',
        group: 'section',
        elements: [
            { kind: 'card',   label: 'Sign In',                 x: 32, y: 8,  width: 36, height: 72 },
            { kind: 'title',  label: 'Welcome Back',            x: 38, y: 14, width: 24, height: 6 },
            { kind: 'input',  label: 'Email',                   x: 36, y: 26, width: 28, height: 6 },
            { kind: 'input',  label: 'Password',                x: 36, y: 36, width: 28, height: 6 },
            { kind: 'button', label: 'Sign In',                 x: 36, y: 48, width: 28, height: 7 },
            { kind: 'text',   label: 'Forgot Password / Sign Up', x: 38, y: 62, width: 24, height: 6 },
        ],
    },
    {
        id: 'cta',
        label: 'Call To Action',
        group: 'section',
        elements: [
            { kind: 'card',   label: 'CTA Banner',      x: 5,  y: 6,  width: 90, height: 22 },
            { kind: 'title',  label: 'Ready to Start?', x: 9,  y: 10, width: 50, height: 6 },
            { kind: 'text',   label: 'Supporting Line', x: 9,  y: 18, width: 40, height: 6 },
            { kind: 'button', label: 'Get Started',     x: 76, y: 13, width: 15, height: 7 },
        ],
    },
    {
        id: 'footer',
        label: 'Footer',
        group: 'section',
        elements: [
            { kind: 'section', label: 'Footer',          x: 5,  y: 6,  width: 90, height: 40 },
            { kind: 'title',   label: 'Brand',           x: 9,  y: 12, width: 14, height: 5 },
            { kind: 'text',    label: 'Tagline',         x: 9,  y: 20, width: 17, height: 10 },
            { kind: 'text',    label: 'Product Links',   x: 30, y: 12, width: 13, height: 18 },
            { kind: 'text',    label: 'Company Links',   x: 46, y: 12, width: 13, height: 18 },
            { kind: 'text',    label: 'Resources Links', x: 62, y: 12, width: 13, height: 18 },
            { kind: 'text',    label: 'Legal Links',     x: 78, y: 12, width: 13, height: 18 },
            { kind: 'text',    label: 'Copyright',       x: 9,  y: 36, width: 30, height: 5 },
            { kind: 'chip',    label: 'Social Icons',    x: 78, y: 36, width: 13, height: 5 },
        ],
    },
];

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Vertical positions are in "viewport units" (100 = one screen height). The
 * canvas page grows and scrolls as content stacks below the first fold, up to
 * this many units.
 */
export const MAX_PAGE_UNITS = 300;

export function createElement(
    kind: MockupElementKind,
    z: number,
    at?: { x: number; y: number },
    overrides?: Partial<Pick<MockupElement, 'label' | 'width' | 'height'>>,
): MockupElement {
    const def = ELEMENT_DEFS[kind];
    const width = overrides?.width ?? def.width;
    const height = overrides?.height ?? def.height;
    return {
        id: generateId(),
        kind,
        label: overrides?.label ?? def.label,
        x: clamp(at?.x ?? 50 - width / 2, 0, 100 - width),
        y: clamp(at?.y ?? 50 - height / 2, 0, MAX_PAGE_UNITS - height),
        width,
        height,
        z,
    };
}

/** Stamp a preset's elements, shifted down by offsetY viewport units (for stacking below existing content). */
export function applyPreset(preset: LayoutPreset, startZ: number, offsetY = 0): MockupElement[] {
    return preset.elements.map((e, i) =>
        createElement(e.kind, startZ + i, { x: e.x, y: e.y + offsetY }, { label: e.label, width: e.width, height: e.height })
    );
}

/* ------------------------------------------------------------------ */
/* Serialization                                                       */
/* ------------------------------------------------------------------ */

const VIEWPORT_REFERENCE: Record<MockupViewport, string> = {
    desktop: 'desktop browser window (~1280x800)',
    tablet: 'tablet screen in portrait (~768x1024)',
    mobile: 'phone screen in portrait (~375x812)',
};

const pct = (v: number) => `${Math.round(v)}%`;

/**
 * Turn the canvas into the text blueprint embedded in the generation prompt.
 * Elements are listed back-to-front (paint order); notes become annotations.
 */
export function serializeMockup(elements: MockupElement[], viewport: MockupViewport): string {
    const sorted = [...elements].sort((a, b) => a.z - b.z);
    const visible = sorted.filter(e => e.kind !== 'note');
    const notes = sorted.filter(e => e.kind === 'note');

    const lines: string[] = [];
    lines.push(`TARGET VIEWPORT: ${VIEWPORT_REFERENCE[viewport]}`);
    const maxBottom = sorted.length ? Math.max(...sorted.map(e => e.y + e.height)) : 0;
    if (maxBottom > 105) {
        lines.push(`PAGE LENGTH: content extends to ~${Math.round(maxBottom)}% of one viewport height — the page scrolls vertically. All y values are % of ONE viewport height, so y > 100% sits below the first fold.`);
    }
    lines.push('');

    if (visible.length === 0) {
        lines.push('ELEMENTS: none placed — derive the layout entirely from the description.');
    } else {
        lines.push('ELEMENTS (back-to-front; positions/sizes as % of the viewport, origin top-left):');
        visible.forEach((e, i) => {
            const def = ELEMENT_DEFS[e.kind];
            const name = e.label && e.label !== def.label ? ` "${e.label}"` : '';
            lines.push(`${i + 1}. ${def.describe}${name} — at x ${pct(e.x)}, y ${pct(e.y)}, width ${pct(e.width)}, height ${pct(e.height)}`);
        });
    }

    if (notes.length > 0) {
        lines.push('');
        lines.push('DESIGNER ANNOTATIONS (instructions, not visible elements):');
        notes.forEach(n => {
            lines.push(`- "${n.label}" (placed near x ${pct(n.x + n.width / 2)}, y ${pct(n.y + n.height / 2)})`);
        });
    }

    return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Persistence: working draft + wireframes saved with generations      */
/* ------------------------------------------------------------------ */

const MOCKUP_DRAFT_KEY = 'builderbrock.mockup-draft.v1';

export const EMPTY_WIREFRAME: MockupWireframe = { elements: [], viewport: 'desktop', description: '' };

function normalizeWireframe(saved: Partial<MockupWireframe> | null | undefined): MockupWireframe {
    const viewport = saved?.viewport;
    return {
        elements: Array.isArray(saved?.elements) ? saved!.elements : [],
        viewport: viewport === 'tablet' || viewport === 'mobile' ? viewport : 'desktop',
        description: typeof saved?.description === 'string' ? saved.description : '',
    };
}

export function isEmptyWireframe(w: MockupWireframe): boolean {
    return w.elements.length === 0 && !w.description.trim();
}

export function loadDraft(): MockupWireframe {
    if (typeof localStorage === 'undefined') return EMPTY_WIREFRAME;
    try {
        const raw = localStorage.getItem(MOCKUP_DRAFT_KEY);
        return raw ? normalizeWireframe(JSON.parse(raw)) : EMPTY_WIREFRAME;
    } catch {
        return EMPTY_WIREFRAME;
    }
}

export function saveDraft(draft: MockupWireframe): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(MOCKUP_DRAFT_KEY, JSON.stringify(draft));
    } catch {
        // A full or unavailable local store must not interrupt drawing.
    }
}

const ELEMENT_LINE = /^\d+\.\s+(.*?)(?: "(.*)")? — at x (-?\d+)%, y (-?\d+)%, width (\d+)%, height (\d+)%\s*$/;
const NOTE_LINE = /^- "(.*)" \(placed near x (-?\d+)%, y (-?\d+)%\)\s*$/;
const DESCRIPTION_BLOCK = /DESIGNER DESCRIPTION[^\n]*\n"([\s\S]*?)"\n/;
const NO_DESCRIPTION = 'No additional instructions — infer the intent from the blueprint.';

/** Rebuild a canvas from the text blueprint stored in a mockup artifact's prompt (for mockups saved before wireframes were stored). */
export function parseMockupBlueprint(prompt: string): MockupWireframe | null {
    const viewportLine = prompt.match(/TARGET VIEWPORT: (.*)/)?.[1]?.trim();
    const viewport = (Object.keys(VIEWPORT_REFERENCE) as MockupViewport[]).find(v => VIEWPORT_REFERENCE[v] === viewportLine) || 'desktop';

    const elements: MockupElement[] = [];
    for (const line of prompt.split('\n')) {
        const el = line.match(ELEMENT_LINE);
        if (el) {
            const def = DEF_LIST.find(d => d.describe === el[1]);
            if (!def) continue;
            elements.push(createElement(def.kind, elements.length + 1, { x: +el[3], y: +el[4] }, {
                label: el[2] ?? def.label,
                width: +el[5],
                height: +el[6],
            }));
            continue;
        }
        const note = line.match(NOTE_LINE);
        if (note) {
            const { width, height } = ELEMENT_DEFS.note;
            elements.push(createElement('note', elements.length + 1, { x: +note[2] - width / 2, y: +note[3] - height / 2 }, { label: note[1] }));
        }
    }

    const rawDescription = prompt.match(DESCRIPTION_BLOCK)?.[1] ?? '';
    const description = rawDescription === NO_DESCRIPTION ? '' : rawDescription;
    if (!elements.length && !description) return null;
    return { elements, viewport, description };
}

/** The editable wireframe behind a mockup project: stored copy first, else rebuilt from the prompt. */
export function wireframeFor(project: any, artifact: any): MockupWireframe | null {
    if (project?.mode !== 'mockup') return null;
    try {
        const stored = JSON.parse(project.settings || '{}').wireframe;
        if (stored) return normalizeWireframe(stored);
    } catch {
        /* fall through to the prompt */
    }
    return artifact?.prompt ? parseMockupBlueprint(artifact.prompt) : null;
}
