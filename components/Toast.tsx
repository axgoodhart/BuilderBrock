import React, { useState, useCallback, useRef, useEffect } from 'react';

export interface ToastMessage {
    id: string;
    type: 'error' | 'success' | 'info';
    message: string;
    duration?: number;
}

interface ToastProps {
    toasts: ToastMessage[];
    onDismiss: (id: string) => void;
}

export function Toast({ toasts, onDismiss }: ToastProps) {
    return (
        <div style={{
            position: 'fixed',
            bottom: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: '8px',
            pointerEvents: 'none',
        }}>
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const duration = toast.duration || 5000;
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => onDismiss(toast.id), 300);
        }, duration);
        return () => clearTimeout(timer);
    }, [toast.id, toast.duration, onDismiss]);

    const colors = {
        error: { bg: 'rgba(220, 38, 38, 0.9)', border: 'rgba(239, 68, 68, 0.5)' },
        success: { bg: 'rgba(22, 163, 74, 0.9)', border: 'rgba(34, 197, 94, 0.5)' },
        info: { bg: 'rgba(37, 99, 235, 0.9)', border: 'rgba(59, 130, 246, 0.5)' },
    };

    const c = colors[toast.type];

    return (
        <div
            style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: '10px',
                padding: '12px 20px',
                color: 'white',
                fontSize: '13px',
                fontFamily: 'Inter, sans-serif',
                maxWidth: '500px',
                pointerEvents: 'auto',
                cursor: 'pointer',
                backdropFilter: 'blur(12px)',
                opacity: isExiting ? 0 : 1,
                transform: isExiting ? 'translateY(10px)' : 'translateY(0)',
                transition: 'opacity 0.3s, transform 0.3s',
                animation: 'toastIn 0.3s ease-out',
            }}
            onClick={() => {
                setIsExiting(true);
                setTimeout(() => onDismiss(toast.id), 300);
            }}
        >
            {toast.message}
        </div>
    );
}

// Hook for managing toasts
export function useToast() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const idCounter = useRef(0);

    const addToast = useCallback((type: ToastMessage['type'], message: string, duration?: number) => {
        const id = `toast_${++idCounter.current}`;
        setToasts(prev => [...prev, { id, type, message, duration }]);
    }, []);

    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return { toasts, addToast, dismissToast };
}

export default Toast;
