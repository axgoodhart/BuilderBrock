/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Artifact, ChatMessage } from '../types';
import SelectionOverlay from './SelectionOverlay';
import { SendIcon, CursorIcon, HandIcon, CloseIcon, ThinkingIcon, DownloadIcon } from './Icons';
import * as api from '../lib/api';
import { llmGenerate } from '../lib/providers';
import { refinementSystemPrompt, buildRefinementUserPrompt } from '../lib/prompts';
import { DEFAULT_TEXT_MODEL } from '../lib/models';
import { parseRefinementPatches, type RefinementPatch } from '../lib/refinementPatches';
import { classifyError, ISSUE_TITLES } from '../lib/generation/issues';

interface RefinementStudioProps {
    artifact: Artifact;
    onUpdateArtifact: (id: string, newHtml: string) => void;
    onClose: () => void;
    /** Model to use for edits — defaults to the registry text model. */
    model?: string;
}

const RefinementStudio: React.FC<RefinementStudioProps> = ({ artifact, onUpdateArtifact, onClose, model }) => {
    const [html, setHtml] = useState(artifact.html);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [mode, setMode] = useState<'select' | 'interact'>('select');
    const [selectedRect, setSelectedRect] = useState<{x: number, y: number, width: number, height: number} | null>(null);
    const [selectedContext, setSelectedContext] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Element Detection Logic
    useEffect(() => {
        if (!selectedRect || !iframeRef.current || !iframeRef.current.contentDocument) {
            setSelectedContext('');
            return;
        }

        const doc = iframeRef.current.contentDocument;
        const { x, y, width, height } = selectedRect;
        
        const allElements = doc.body.querySelectorAll('*');
        const candidates: string[] = [];

        allElements.forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.left < x + width && rect.right > x && rect.top < y + height && rect.bottom > y) {
                 let snippet = el.outerHTML;
                 if (snippet.length > 300) {
                     const tag = el.tagName.toLowerCase();
                     const id = el.id ? ` id="${el.id}"` : '';
                     const cls = el.className ? ` class="${el.className}"` : '';
                     snippet = `<${tag}${id}${cls}>... (content truncated) ...</${tag}>`;
                 }
                 candidates.push(snippet);
            }
        });

        const summary = candidates.slice(-5).join('\n');
        setSelectedContext(summary ? `User selected area containing:\n${summary}` : 'User selected an area, but no specific elements were detected.');

    }, [selectedRect]);

    const handleDownload = () => {
        const element = document.createElement("a");
        const file = new Blob([html], { type: 'text/html' });
        element.href = URL.createObjectURL(file);
        element.download = `refined_component_${Date.now()}.html`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        
        const userMsg: ChatMessage = { role: 'user', text: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);
        setSelectedRect(null); // Clear selection after send

        try {
            const requestModel = model || DEFAULT_TEXT_MODEL;
            const raw = await llmGenerate({
                model: requestModel,
                system: refinementSystemPrompt(),
                prompt: buildRefinementUserPrompt({ html, request: userMsg.text, selectedContext }),
                json: true,
            });

            const parsed = parseRefinementPatches(raw || '');
            const responseText = parsed.normalizedText;

            // Parse and apply patches
            let newHtml = html;
            const patches = parsed.patches;
            const failed: RefinementPatch[] = [];
            const applied: RefinementPatch[] = [];

            for (const patch of patches) {
                if (newHtml.includes(patch.search)) {
                    newHtml = newHtml.replace(patch.search, patch.replace);
                    applied.push(patch);
                } else {
                    failed.push(patch);
                }
            }

            // Always store the attempt as a revision
            const revisionData = {
                html: newHtml,
                prompt: userMsg.text,
                model: requestModel,
                selection: selectedContext || undefined,
                diff: JSON.stringify({
                    raw: raw || '',
                    normalized: responseText,
                    patches,
                    applied: applied.length,
                    failed,
                    parseError: parsed.parseError,
                    recovered: parsed.recovered,
                }),
            };
            api.createRevision(artifact.id, revisionData)
                .catch(e => console.error('Failed to save revision:', e));

            if (parsed.parseError) {
                setMessages(prev => [...prev, { role: 'model', text: 'Failed to parse edits — no changes were made. The raw response was saved to your revision history.' }]);
                setIsLoading(false);
                setSelectedContext('');
                return;
            }

            if (patches.length === 0) {
                setMessages(prev => [...prev, { role: 'model', text: 'The model returned no valid edit operations — no changes were made. The response was saved to your revision history.' }]);
                setIsLoading(false);
                setSelectedContext('');
                return;
            }

            if (failed.length > 0) {
                setMessages(prev => [...prev, { role: 'model', text: `${failed.length} of ${patches.length} edits couldn't match the HTML. ${failed.length === patches.length ? 'No changes were made.' : 'Partial changes applied.'} All patches saved to revision history.` }]);
                if (failed.length === patches.length) {
                    setIsLoading(false);
                    setSelectedContext('');
                    return;
                }
            }

            setHtml(newHtml);
            onUpdateArtifact(artifact.id, newHtml);
            setMessages(prev => [...prev, {
                role: 'model',
                text: `Applied ${applied.length} edit${applied.length === 1 ? '' : 's'}.${parsed.recovered ? ' The model response required JSON recovery.' : ''}`,
            }]);

        } catch (e: any) {
            console.error(e);
            const issue = classifyError(e, model || DEFAULT_TEXT_MODEL);
            setMessages(prev => [...prev, { role: 'model', text: `${ISSUE_TITLES[issue.kind]}: ${issue.message} Your request is back in the box to resend.` }]);
            setInput(prev => prev || userMsg.text);
        } finally {
            setIsLoading(false);
            setSelectedContext('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="refinement-studio">
            <div className="studio-main">
                <div className="studio-toolbar">
                    <div className="tool-group">
                        <button 
                            className={`tool-btn ${mode === 'select' ? 'active' : ''}`}
                            onClick={() => setMode('select')}
                            title="Select Mode (Draw to context)"
                        >
                            <CursorIcon /> Select
                        </button>
                        <button 
                            className={`tool-btn ${mode === 'interact' ? 'active' : ''}`}
                            onClick={() => { setMode('interact'); setSelectedRect(null); }}
                            title="Interact Mode (Click buttons)"
                        >
                            <HandIcon /> Interact
                        </button>
                    </div>
                    <div className="studio-title">Refinement Studio</div>
                    <div className="tool-group">
                        <button 
                            className="tool-btn" 
                            onClick={handleDownload}
                            title="Download current HTML"
                        >
                            <DownloadIcon /> Download
                        </button>
                        <button className="close-btn" onClick={onClose}><CloseIcon /></button>
                    </div>
                </div>

                <div className="preview-stage">
                    <div className="iframe-wrapper">
                         {/* Overlay for selection */}
                        <SelectionOverlay 
                            active={mode === 'select'} 
                            onSelect={setSelectedRect} 
                        />
                        
                        <iframe 
                            ref={iframeRef}
                            srcDoc={html} 
                            title="Refinement Preview"
                            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-presentation allow-same-origin"
                            className={`studio-iframe ${mode === 'select' ? 'pointer-events-none' : ''}`}
                        />
                    </div>
                </div>
            </div>

            <div className="studio-sidebar">
                <div className="chat-history">
                    {messages.length === 0 && (
                        <div className="empty-chat-hint">
                            <p>Draw a box on the preview to select an element, then tell me what to change.</p>
                            <p className="sub-hint">Try: "Make this button pulse on hover" or "Change this text to a counter".</p>
                        </div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} className={`chat-message ${m.role}`}>
                            {m.text}
                        </div>
                    ))}
                    {isLoading && <div className="chat-message model loading"><ThinkingIcon /> Coding...</div>}
                    <div ref={messagesEndRef} />
                </div>
                
                <div className="chat-input-area">
                    {selectedRect && (
                        <div className="selection-badge">
                            <span>Targeting selection</span>
                            <button onClick={() => setSelectedRect(null)}>&times;</button>
                        </div>
                    )}
                    <div className="input-row">
                        <textarea 
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={selectedRect ? "What should I change in this area?" : "Describe your changes..."}
                            disabled={isLoading}
                        />
                        <button onClick={handleSend} disabled={isLoading || !input.trim()}>
                            <SendIcon />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RefinementStudio;
