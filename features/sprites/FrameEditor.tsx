import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon, CloseIcon, EditIcon } from '../../components/Icons';
import { PillButton, RangeSlider, SectionLabel } from './controls';

interface FrameEditorProps {
    initialFrame: string; // frame URL
    onSave: (base64: string) => void;
    onClose: () => void;
}

const FrameEditor: React.FC<FrameEditorProps> = ({ initialFrame, onSave, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false); // ref, not state: first stroke must draw immediately
    const [brushSize, setBrushSize] = useState(20);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const img = new Image();
        img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d')!.drawImage(img, 0, 0);
        };
        img.src = initialFrame;
    }, [initialFrame]);

    const erase = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current) return;
        const canvas = e.currentTarget;
        const ctx = canvas.getContext('2d')!;
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / rect.width;
        const x = (e.clientX - rect.left) * scale;
        const y = (e.clientY - rect.top) * scale;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = brushSize * scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawingRef.current = true;
        erase(e);
    };

    const stop = () => {
        drawingRef.current = false;
        canvasRef.current?.getContext('2d')!.beginPath();
    };

    return (
        <div className="ss-modal" role="dialog" aria-modal="true" aria-label="Mask refinement">
            <div className="ss-modal-panel">
                <header className="ss-modal-head">
                    <span className="ss-title"><EditIcon /> Mask Refinement</span>
                    <button type="button" className="ss-icon-btn" onClick={onClose} aria-label="Close"><CloseIcon /></button>
                </header>
                <div className="ss-modal-body">
                    <div className="ss-editor-stage checker">
                        <canvas ref={canvasRef} className="pixelated"
                            onPointerDown={start} onPointerMove={erase} onPointerUp={stop} onPointerCancel={stop} />
                    </div>
                    <aside className="ss-editor-side">
                        <SectionLabel>Eraser</SectionLabel>
                        <RangeSlider label="Brush Size" value={brushSize} min={2} max={150} onChange={setBrushSize} formatValue={v => `${v}px`} />
                        <p className="ss-hint">Brush over halos or ghosting to erase them.</p>
                        <div className="ss-editor-actions">
                            <PillButton variant="outline" onClick={onClose}>Discard</PillButton>
                            <PillButton variant="solid" icon={<CheckIcon />} onClick={() => canvasRef.current && onSave(canvasRef.current.toDataURL('image/png').split(',')[1])}>
                                Commit Mask
                            </PillButton>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default FrameEditor;
