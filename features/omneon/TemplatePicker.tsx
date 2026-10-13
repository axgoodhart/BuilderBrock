import React, { useMemo } from 'react';
import { TEMPLATES, buildTemplateDocument } from './templates';
import ScenePreview from './ScenePreview';

export default function TemplatePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
    const document = useMemo(() => buildTemplateDocument(value), [value]);
    const template = TEMPLATES.find(t => t.id === value)!;
    return <div className="omneon-template-picker">
        <div className="omneon-template-options" role="group" aria-label="Scene template">
            {TEMPLATES.map(t => <button key={t.id} type="button" aria-pressed={value === t.id}
                className={value === t.id ? 'omneon-active' : ''} onClick={() => onChange(t.id)}>{t.name}</button>)}
        </div>
        <ScenePreview document={document} label={`${template.name} preview`} />
        <p>{template.description}</p>
        <div className="omneon-template-includes"><strong>Includes</strong><span>{document.nodes.length
            ? [...document.nodes.map(n => n.name), ...(document.world.ground.enabled ? ['Ground'] : [])].join(', ')
            : 'No objects. Add shapes, lights, or imported models when you’re ready.'}</span></div>
    </div>;
}
