export interface RefinementPatch {
  search: string;
  replace: string;
}

export interface RefinementPatchParseResult {
  patches: RefinementPatch[];
  normalizedText: string;
  parseError: boolean;
  recovered: boolean;
}

interface NormalizedPatches {
  recognized: boolean;
  patches: RefinementPatch[];
}

function stripMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function toPatch(value: unknown): RefinementPatch | null {
  if (
    typeof value !== 'object'
    || value === null
    || typeof (value as Record<string, unknown>).search !== 'string'
    || (value as Record<string, unknown>).search === ''
    || typeof (value as Record<string, unknown>).replace !== 'string'
  ) {
    return null;
  }

  return {
    search: (value as Record<string, string>).search,
    replace: (value as Record<string, string>).replace,
  };
}

function normalizePatches(value: unknown): NormalizedPatches {
  const values = Array.isArray(value)
    ? value
    : (
      typeof value === 'object'
      && value !== null
      && Array.isArray((value as Record<string, unknown>).patches)
    )
      ? (value as { patches: unknown[] }).patches
      : null;

  if (values) {
    const patches = values.map(toPatch);
    if (patches.some((patch) => patch === null)) {
      return { recognized: false, patches: [] };
    }
    return {
      recognized: true,
      patches: patches as RefinementPatch[],
    };
  }

  const singlePatch = toPatch(value);
  return singlePatch
    ? { recognized: true, patches: [singlePatch] }
    : { recognized: false, patches: [] };
}

function findValidPatchObjects(text: string): RefinementPatch[] | null {
  const recovered: RefinementPatch[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (character !== '}' || depth === 0) continue;

    depth -= 1;
    if (depth !== 0 || start < 0) continue;

    try {
      const normalized = normalizePatches(JSON.parse(text.slice(start, index + 1)));
      if (normalized.recognized && normalized.patches.length > 0) {
        recovered.push(...normalized.patches);
      }
    } catch {
      // Keep scanning; a later balanced object may contain a valid patch.
    }
    start = -1;
  }

  return recovered.length > 0 ? recovered : null;
}

export function parseRefinementPatches(raw: string): RefinementPatchParseResult {
  const normalizedText = stripMarkdownFence(raw);

  try {
    const normalized = normalizePatches(JSON.parse(normalizedText));
    if (normalized.recognized) {
      return {
        patches: normalized.patches,
        normalizedText,
        parseError: false,
        recovered: false,
      };
    }
  } catch {
    // Try to recover a valid patch object from otherwise malformed output.
  }

  const recoveredPatches = findValidPatchObjects(normalizedText);
  if (recoveredPatches) {
    return {
      patches: recoveredPatches,
      normalizedText,
      parseError: false,
      recovered: true,
    };
  }

  return {
    patches: [],
    normalizedText,
    parseError: true,
    recovered: false,
  };
}
