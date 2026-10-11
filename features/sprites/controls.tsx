import React, { useEffect, useRef, useState } from 'react';

export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="ss-section-label">{children}</h3>
);

export const PillButton: React.FC<{
    icon?: React.ReactNode; children: React.ReactNode;
    variant?: 'filled' | 'outline' | 'solid'; onClick?: () => void;
    disabled?: boolean; className?: string;
}> = ({ icon, children, variant = 'filled', onClick, disabled, className = '' }) => (
    <button type="button" className={`ss-pill ss-pill-${variant} ${className}`} onClick={onClick} disabled={disabled}>
        {icon && <span className="ss-pill-icon">{icon}</span>}
        <span>{children}</span>
    </button>
);

export const DragNumberField: React.FC<{
    label: string; value: number; min?: number; max?: number;
    step?: number; suffix?: string; onChange: (val: number) => void;
}> = ({ label, value, min = 0, max = 999, step = 1, suffix = '', onChange }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(String(value));
    const inputRef = useRef<HTMLInputElement>(null);
    const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));

    const commitEdit = (raw: string) => {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed)) onChange(clamp(parsed));
        setIsEditing(false);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isEditing) return;
        e.preventDefault();
        const startY = e.clientY;
        let moved = false;
        const onMove = (ev: MouseEvent) => {
            if (Math.abs(ev.clientY - startY) > 3) moved = true;
            if (!moved) return;
            onChange(clamp(value + (startY - ev.clientY) * step));
            document.body.style.cursor = 'ns-resize';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            if (moved) return;
            setEditValue(String(value));
            setIsEditing(true);
            setTimeout(() => inputRef.current?.select(), 0);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    return (
        <div className={`ss-field ${isEditing ? '' : 'ss-field-drag'}`} onMouseDown={handleMouseDown}>
            <span className="ss-field-label">{label}</span>
            <div className="ss-field-row">
                {isEditing ? (
                    <input ref={inputRef} type="text" value={editValue} autoFocus className="ss-field-input"
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(editValue); if (e.key === 'Escape') setIsEditing(false); }}
                        onBlur={() => commitEdit(editValue)} />
                ) : (
                    <>
                        <span className="ss-field-value">{value}{suffix}</span>
                        <span className="ss-field-arrows" aria-hidden="true">
                            <svg width="10" height="6" viewBox="0 0 10 6"><path d="M5 0L9 5H1L5 0Z" fill="currentColor" /></svg>
                            <svg width="10" height="6" viewBox="0 0 10 6"><path d="M5 6L1 1H9L5 6Z" fill="currentColor" /></svg>
                        </span>
                    </>
                )}
            </div>
        </div>
    );
};

export const FieldDropdown: React.FC<{
    label: string; value: string; options: string[]; onChange: (val: string) => void;
}> = ({ label, value, options, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handle = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setIsOpen(false); };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    return (
        <div ref={ref} className="ss-dropdown">
            <button type="button" className="ss-field" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen}>
                <span className="ss-field-label">{label}</span>
                <span className="ss-field-row">
                    <span className="ss-field-value">{value}</span>
                    <svg className={`ss-chevron ${isOpen ? 'is-open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                </span>
            </button>
            {isOpen && (
                <div className="ss-dropdown-menu" role="listbox">
                    {options.map((opt) => (
                        <button key={opt} type="button" role="option" aria-selected={value === opt}
                            className={`ss-dropdown-option ${value === opt ? 'is-active' : ''}`}
                            onClick={() => { onChange(opt); setIsOpen(false); }}>
                            {opt}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export const RangeSlider: React.FC<{
    label: string; value: number; min: number; max: number; step?: number;
    formatValue?: (val: number) => string; onChange: (val: number) => void; disabled?: boolean;
}> = ({ label, value, min, max, step = 1, formatValue = String, onChange, disabled }) => (
    <label className={`ss-range ${disabled ? 'is-disabled' : ''}`}>
        <span className="ss-range-head">
            <span className="ss-field-label">{label}</span>
            <span className="ss-range-value">{formatValue(value)}</span>
        </span>
        <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))} />
    </label>
);

export const SegmentedToggle: React.FC<{
    value: string; items: { value: string; label: string; icon?: React.ReactNode }[];
    onChange: (val: string) => void;
}> = ({ value, items, onChange }) => (
    <div className="ss-segmented" role="radiogroup">
        {items.map((item) => (
            <button key={item.value} type="button" role="radio" aria-checked={value === item.value}
                className={value === item.value ? 'is-active' : ''} onClick={() => onChange(item.value)}>
                {item.icon}<span>{item.label}</span>
            </button>
        ))}
    </div>
);
