import React, { useState } from 'react';

export type NoticeActionId = 'retry' | 'fallback' | 'resume' | 'regenerate' | 'fix' | 'providers';

export interface NoticeAction {
    id: NoticeActionId;
    label: string;
    run: () => unknown; // may return Promise<boolean> (true = generation started)
    primary?: boolean;
}

export interface GenerationNoticeView {
    tone: 'error' | 'warning';
    title: string;
    message: string;
    items?: string[];
    meta?: string;
    detail?: string;
    actions: NoticeAction[];
    onDismiss?: () => void;
}

interface GenerationNoticeProps {
    notice: GenerationNoticeView;
    disabled?: boolean;
}

const GenerationNotice: React.FC<GenerationNoticeProps> = ({ notice, disabled }) => {
    const [busy, setBusy] = useState(false);

    const run = async (action: NoticeAction) => {
        setBusy(true);
        try {
            await action.run();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={`gen-notice tone-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
            <div className="gen-notice-body">
                <strong className="gen-notice-title">{notice.title}</strong>
                <p className="gen-notice-message">{notice.message}</p>
                {notice.items && notice.items.length > 0 && (
                    <ul className="gen-notice-items">
                        {notice.items.map(item => <li key={item}>{item}</li>)}
                    </ul>
                )}
                {notice.meta && <small className="gen-notice-meta">{notice.meta}</small>}
                {notice.detail && (
                    <details className="gen-notice-detail">
                        <summary>Details</summary>
                        <pre>{notice.detail}</pre>
                    </details>
                )}
            </div>
            <div className="gen-notice-actions">
                {notice.actions.map(action => (
                    <button
                        key={action.id}
                        className={action.primary ? 'primary' : ''}
                        disabled={disabled || busy}
                        onClick={() => run(action)}
                    >
                        {action.label}
                    </button>
                ))}
                {notice.onDismiss && (
                    <button className="gen-notice-dismiss" onClick={notice.onDismiss} aria-label="Dismiss" title="Dismiss">
                        &times;
                    </button>
                )}
            </div>
        </div>
    );
};

export default GenerationNotice;
