import React, { useEffect, useRef, useState } from 'react';
import { SceneDocument } from './scene/document';
import { generateSceneModule, parseSceneModule } from './scene/code';
import { SceneOperation } from './scene/operations';

interface CodePanelProps {
    document: SceneDocument;
    onCommitOps: (ops: SceneOperation[]) => void;
}

/**
 * Managed scene-code editor. The module regenerates deterministically from
 * the document; supported edits parse back through the TypeScript AST into
 * scene operations. Invalid code stays in the editor with an error and
 * never touches the working scene.
 */
const CodePanel: React.FC<CodePanelProps> = ({ document, onCommitOps }) => {
    const [code, setCode] = useState(() => generateSceneModule(document));
    const [error, setError] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressRegen = useRef(false);

    // External document change (gizmo/chat/apply) → regenerate unless editing
    useEffect(() => {
        if (dirty) return;
        setCode(generateSceneModule(document));
        setError(null);
    }, [document, dirty]);

    const handleChange = (value: string) => {
        setCode(value);
        setDirty(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            const result = parseSceneModule(value, document);
            if (!result.ok) {
                setError(result.errors.slice(0, 3).join('\n'));
                return; // invalid code stays; scene untouched
            }
            setError(null);
            if (result.operations.length > 0) {
                suppressRegen.current = true;
                onCommitOps(result.operations);
                setDirty(false);
            } else {
                setDirty(false);
            }
        }, 600);
    };

    const reset = () => {
        setCode(generateSceneModule(document));
        setError(null);
        setDirty(false);
    };

    return (
        <div className="omneon-code">
            <div className="omneon-code-toolbar">
                <span className="omneon-code-hint">managed module · edits re-parse into scene ops</span>
                <button onClick={reset} disabled={!dirty && !error}>Reset</button>
            </div>
            <textarea
                className={`omneon-code-editor ${error ? 'has-error' : ''}`}
                value={code}
                onChange={e => handleChange(e.target.value)}
                spellCheck={false}
            />
            {error && <div className="omneon-code-error">{error}</div>}
        </div>
    );
};

export default CodePanel;
