/** Cheap post-generation checks so broken output is flagged instead of shipped silently. */

export type WarningCode = 'not_html' | 'truncated' | 'script_syntax';

export interface OutputWarning {
    code: WarningCode;
    message: string;
}

const CLASSIC_SCRIPT_TYPES = ['', 'text/javascript', 'application/javascript'];

function lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

export function checkOutput(html: string): OutputWarning[] {
    const out: OutputWarning[] = [];

    if (!/<(!doctype|html|head|body|div|main|section|style)\b/i.test(html)) {
        out.push({ code: 'not_html', message: "The response doesn't look like HTML." });
        return out;
    }
    if (/<html\b/i.test(html) && !/<\/html>\s*$/i.test(html)) {
        out.push({ code: 'truncated', message: 'No closing </html> — the output looks cut off.' });
    }

    const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = scriptRe.exec(html))) {
        const attrs = m[1];
        if (/\bsrc\s*=/i.test(attrs)) continue;
        const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1] || '').toLowerCase();
        if (!CLASSIC_SCRIPT_TYPES.includes(type)) continue; // modules, importmaps, JSON, templates
        try {
            new Function(m[2]); // parse only, never invoked
        } catch (e: any) {
            if (e instanceof SyntaxError) {
                out.push({ code: 'script_syntax', message: `Script starting at line ${lineAt(html, m.index)}: ${e.message}` });
            }
        }
    }
    return out;
}
