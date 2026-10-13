import React, { useEffect, useState } from 'react';

/** Keep incomplete numeric input local; commit once on Enter or blur. */
export default function PropertyField({ label, value, onCommit, min, max, step = 'any', type = 'number', disabled = false, validate }: {
    label: string; value: number | string; onCommit: (value: any) => void;
    min?: number; max?: number; step?: number | 'any'; type?: 'number' | 'text'; disabled?: boolean; validate?: (value: any) => string | null;
}) {
    const [draft, setDraft] = useState(String(value));
    const [error, setError] = useState('');
    useEffect(() => { setDraft(String(value)); setError(''); }, [value]);
    const commit = () => {
        const next = type === 'number' ? Number(draft) : draft.trim();
        if (!draft.trim() || (type === 'number' && (!Number.isFinite(next) || (min !== undefined && Number(next) < min) || (max !== undefined && Number(next) > max)))) {
            setError(type === 'number' ? `Enter a number${min !== undefined ? ` ≥ ${min}` : ''}${max !== undefined ? ` ≤ ${max}` : ''}.` : 'Enter a value.');
            return;
        }
        const validationError = validate?.(next);
        if (validationError) { setError(validationError); return; }
        setError('');
        if (next !== value) onCommit(next);
    };
    return <label className="omneon-property-field">
        <span>{label}</span>
        <input type={type} value={draft} min={min} max={max} step={step} disabled={disabled}
            aria-invalid={!!error} title={error || label} onChange={e => { setDraft(e.target.value); setError(''); }}
            onBlur={commit} onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { setDraft(String(value)); setError(''); }
            }} />
        {error && <small role="alert">{error}</small>}
    </label>;
}
