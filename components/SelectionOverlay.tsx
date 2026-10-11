/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface SelectionOverlayProps {
    onSelect: (rect: Rect | null) => void;
    active: boolean;
}

const SelectionOverlay: React.FC<SelectionOverlayProps> = ({ onSelect, active }) => {
    const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
    const [currentRect, setCurrentRect] = useState<Rect | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Clear selection if overlay becomes inactive
    useEffect(() => {
        if (!active) {
            setStartPos(null);
            setCurrentRect(null);
            onSelect(null);
        }
    }, [active, onSelect]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!active || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setStartPos({ x, y });
        setCurrentRect({ x, y, width: 0, height: 0 });
        onSelect(null); // Clear previous final selection while dragging
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!active || !startPos || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const x = Math.min(startPos.x, currentX);
        const y = Math.min(startPos.y, currentY);
        const width = Math.abs(currentX - startPos.x);
        const height = Math.abs(currentY - startPos.y);

        setCurrentRect({ x, y, width, height });
    };

    const handleMouseUp = () => {
        if (!active || !startPos) return;
        if (currentRect && currentRect.width > 5 && currentRect.height > 5) {
            onSelect(currentRect);
        } else {
            // Treat as click/clear
            setCurrentRect(null);
            onSelect(null);
        }
        setStartPos(null);
    };

    if (!active) return null;

    return (
        <div 
            ref={containerRef}
            className="selection-overlay-layer"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {currentRect && (
                <div 
                    className="selection-box"
                    style={{
                        left: currentRect.x,
                        top: currentRect.y,
                        width: currentRect.width,
                        height: currentRect.height
                    }}
                />
            )}
        </div>
    );
};

export default SelectionOverlay;