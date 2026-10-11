import React, { useCallback, useRef } from 'react';

type CSSProperty = '--left-width' | '--file-tree-height' | '--preview-height';

interface ResizeConfig {
    property: CSSProperty;
    direction: 'horizontal' | 'vertical';
    min: number;
    max: number | (() => number); // function form is measured at drag start
}

const resolve = (v: number | (() => number)) => (typeof v === 'function' ? v() : v);

export function useResizable(config: ResizeConfig) {
    const isDragging = useRef(false);
    const startPos = useRef(0);
    const startValue = useRef(0);

    const getProperty = useCallback(() => {
        const raw = document.documentElement.style.getPropertyValue(config.property);
        return raw ? parseInt(raw, 10) : config.min + (resolve(config.max) - config.min) / 2;
    }, [config.property, config.min, config.max]);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        startPos.current = config.direction === 'horizontal' ? e.clientX : e.clientY;
        startValue.current = getProperty();
        const max = Math.max(config.min, resolve(config.max));

        // Prevent iframes from stealing mouse events during drag
        document.body.classList.add('resizing');

        const onMouseMove = (ev: MouseEvent) => {
            if (!isDragging.current) return;
            const delta = config.direction === 'horizontal'
                ? ev.clientX - startPos.current
                : ev.clientY - startPos.current;
            const newValue = Math.min(max, Math.max(config.min, startValue.current + delta));
            document.documentElement.style.setProperty(config.property, `${newValue}px`);
        };

        const onMouseUp = () => {
            isDragging.current = false;
            document.body.classList.remove('resizing');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [config.direction, config.property, config.min, config.max, getProperty]);

    return { onMouseDown };
}
