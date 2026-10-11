
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { VoyeurAnalysis } from '../types';
import { CloseIcon, ThinkingIcon, SparklesIcon, CodeIcon, SearchIcon, PlusIcon } from './Icons';
import { llmGenerate } from '../lib/providers';
import { buildVoyeurAnalysisPrompt, buildVoyeurSpecPrompt } from '../lib/prompts';
import { DEFAULT_TEXT_MODEL, DEFAULT_SMART_MODEL } from '../lib/models';

interface VoyeurOverlayProps {
    onClose: () => void;
}

const VoyeurOverlay: React.FC<VoyeurOverlayProps> = ({ onClose }) => {
    const [fileContent, setFileContent] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [analysis, setAnalysis] = useState<VoyeurAnalysis | null>(null);
    const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => setFileContent(event.target?.result as string);
        reader.readAsText(file);
    };

    const runAnalysis = async () => {
        if (!fileContent || isLoading) return;
        setIsLoading(true);

        try {
            const text = await llmGenerate({
                model: DEFAULT_TEXT_MODEL,
                prompt: buildVoyeurAnalysisPrompt(fileContent),
                json: true,
            });

            const rawJson = JSON.parse(text || '{}');
            setAnalysis({
                prompts: rawJson.prompts || [],
                pitch: {
                    visual: rawJson.visualPitch || '',
                    functional: rawJson.functionalPitch || ''
                }
            });
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const generateFullSpec = async () => {
        if (!analysis || isGeneratingSpec) return;
        setIsGeneratingSpec(true);

        try {
            const text = await llmGenerate({
                model: DEFAULT_SMART_MODEL,
                prompt: buildVoyeurSpecPrompt({
                    code: fileContent,
                    visual: analysis.pitch.visual,
                    functional: analysis.pitch.functional,
                }),
            });

            setAnalysis(prev => prev ? ({ ...prev, spec: text }) : null);
        } catch (e) {
            console.error(e);
        } finally {
            setIsGeneratingSpec(false);
        }
    };

    return (
        <div className="Voyeur-screen">
            <div className="Voyeur-container">
                <div className="Voyeur-header">
                    <div className="Voyeur-title-group">
                        <div className="mode-badge-Voyeur">Voyeur MODE</div>
                        <h2>Structural Analysis</h2>
                        <p>Reverse-engineer and elevate existing documents.</p>
                    </div>
                    <button id="close-voyeur" className="close-btn" onClick={onClose}><CloseIcon /></button>
                </div>

                <div className="Voyeur-body">
                    {!analysis ? (
                        <div className="upload-zone">
                            <div className="upload-prompt">
                                <CodeIcon />
                                <h3>Feed the Lens</h3>
                                <p>Paste your HTML/CSS or upload a file to begin extraction.</p>
                            </div>
                            <textarea 
                                className="Voyeur-textarea"
                                placeholder="Paste code here..."
                                value={fileContent}
                                onChange={(e) => setFileContent(e.target.value)}
                            />
                            <div className="upload-actions">
                                <label className="file-input-label">
                                    <input type="file" accept=".html,.css,.txt" onChange={handleFileUpload} />
                                    Upload Document
                                </label>
                                <button 
                                    className="btn-analyze" 
                                    disabled={!fileContent.trim() || isLoading}
                                    onClick={runAnalysis}
                                >
                                    {isLoading ? <ThinkingIcon /> : <SparklesIcon />}
                                    Analyze Structure
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="analysis-results">
                            <section className="analysis-section">
                                <h3><SearchIcon /> Translation Prompts</h3>
                                <p className="section-meta">Prompts to recreate this essence in builderBrock.</p>
                                <div className="prompt-cards">
                                    {analysis.prompts.map((p, i) => (
                                        <div key={i} className="prompt-card">
                                            <code>{p}</code>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="analysis-section">
                                <h3><SparklesIcon /> Elevator Pitch</h3>
                                <div className="pitch-grid">
                                    <div className="pitch-box">
                                        <label>Visual Elevation</label>
                                        <p>{analysis.pitch.visual}</p>
                                    </div>
                                    <div className="pitch-box">
                                        <label>Functional Intelligence</label>
                                        <p>{analysis.pitch.functional}</p>
                                    </div>
                                </div>
                            </section>

                            <section className="analysis-section spec-section">
                                {!analysis.spec ? (
                                    <div className="spec-cta">
                                        <button className="btn-spec" onClick={generateFullSpec} disabled={isGeneratingSpec}>
                                            {isGeneratingSpec ? <ThinkingIcon /> : <PlusIcon />}
                                            Generate Full Engineering Blueprint
                                        </button>
                                        <p>Receive a thorough breakdown and a master revamp prompt.</p>
                                    </div>
                                ) : (
                                    <div className="spec-output">
                                        <h3><CodeIcon /> Engineering Blueprint</h3>
                                        <div className="markdown-content">
                                            {analysis.spec}
                                        </div>
                                    </div>
                                )}
                            </section>

                            <div className="analysis-footer">
                                <button className="btn-secondary" onClick={() => setAnalysis(null)}>Reset Lens</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VoyeurOverlay;
