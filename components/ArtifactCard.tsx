/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef } from 'react';
import { Artifact } from '../types';
import { DownloadIcon } from './Icons';

interface ArtifactCardProps {
    artifact: Artifact;
    isFocused: boolean;
    onClick: () => void;
}

const ArtifactCard = React.memo(({ 
    artifact, 
    isFocused, 
    onClick 
}: ArtifactCardProps) => {
    const codeRef = useRef<HTMLPreElement>(null);

    // Auto-scroll logic for this specific card
    useEffect(() => {
        if (codeRef.current) {
            codeRef.current.scrollTop = codeRef.current.scrollHeight;
        }
    }, [artifact.html]);

    const isBlurring = artifact.status === 'streaming';
    const isComplete = artifact.status === 'complete';

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!artifact.html) return;
        
        const element = document.createElement("a");
        const file = new Blob([artifact.html], { type: 'text/html' });
        element.href = URL.createObjectURL(file);
        // Clean filename
        const filename = (artifact.styleName || 'component').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        element.download = `${filename}.html`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    return (
        <div 
            className={`artifact-card ${isFocused ? 'focused' : ''} ${isBlurring ? 'generating' : ''}`}
            onClick={onClick}
        >
            <div className="artifact-header">
                <span className="artifact-style-tag">{artifact.styleName}</span>
            </div>
            <div className="artifact-card-inner">
                {isBlurring && (
                    <div className="generating-overlay">
                        <pre ref={codeRef} className="code-stream-preview">
                            {artifact.html}
                        </pre>
                    </div>
                )}
                <iframe 
                    srcDoc={artifact.html} 
                    title={artifact.id} 
                    sandbox="allow-scripts allow-forms allow-modals allow-popups allow-presentation allow-same-origin"
                    className="artifact-iframe"
                />
                
                {/* Download Button - Only in Grid View (not focused) and when ready */}
                {!isFocused && isComplete && (
                    <button 
                        className="card-download-btn" 
                        onClick={handleDownload}
                        title="Download Source Code"
                        aria-label="Download Source Code"
                    >
                        <DownloadIcon />
                    </button>
                )}
            </div>
        </div>
    );
});

export default ArtifactCard;