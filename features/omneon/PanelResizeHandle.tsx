import React, { useRef } from 'react';

export default function PanelResizeHandle({ label, value, min, max, vertical = false, reverse = false, onChange, onResizing }: {
    label: string; value: number; min: number; max: number; vertical?: boolean; reverse?: boolean;
    onChange: (size: number) => void; onResizing: (resizing: boolean) => void;
}) {
    const drag = useRef<{ position: number; value: number } | null>(null);
    const change = (size: number) => onChange(Math.round(Math.max(min, Math.min(max, size))));
    return <div className={`omneon-resizer ${vertical ? 'horizontal' : 'vertical'}`} role="separator" tabIndex={0}
        aria-label={label} aria-orientation={vertical ? 'horizontal' : 'vertical'} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}
        onDoubleClick={() => change((min + max) / 2)}
        onKeyDown={e => {
            const decrease = vertical ? 'ArrowUp' : 'ArrowLeft';
            const increase = vertical ? 'ArrowDown' : 'ArrowRight';
            if (e.key === decrease || e.key === increase) { e.preventDefault(); change(value + (e.key === increase ? 16 : -16) * (reverse ? -1 : 1)); }
            if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); change(e.key === 'Home' ? min : max); }
        }}
        onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); drag.current = { position: vertical ? e.clientY : e.clientX, value }; e.currentTarget.setPointerCapture(e.pointerId); onResizing(true); }}
        onPointerMove={e => { if (drag.current) change(drag.current.value + ((vertical ? e.clientY : e.clientX) - drag.current.position) * (reverse ? -1 : 1)); }}
        onPointerUp={e => { drag.current = null; e.currentTarget.releasePointerCapture(e.pointerId); onResizing(false); }}
        onLostPointerCapture={() => { drag.current = null; onResizing(false); }} />;
}
