
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { CalibrationData } from '../types';
import { CloseIcon, SparklesIcon, CheckIcon } from './Icons';

interface IdeaCalibrationProps {
    prompt: string;
    onComplete: (data: CalibrationData) => void;
    onCancel: () => void;
}

interface QuestionTier {
    label: string;
    desc: string;
    options: string[];
}

const IdeaCalibration: React.FC<IdeaCalibrationProps> = ({ prompt, onComplete, onCancel }) => {
    const [data, setData] = useState<CalibrationData>({
        style: { lookAndFeel: '', density: '' },
        architecture: { navigation: '', hierarchy: '' },
        elements: [],
        context: ''
    });

    const [tiers, setTiers] = useState<Record<string, number>>({
        lookAndFeel: 0,
        density: 0,
        navigation: 0,
        hierarchy: 0
    });

    const banks: Record<string, QuestionTier[]> = {
        lookAndFeel: [
            {
                label: 'Visual Soul',
                desc: 'What is the fundamental vibe of the interface?',
                options: ['Neo-Minimalist', 'Brutalist Raw', 'Skeuomorphic Glass', 'Liquid Organic', 'Art Deco']
            },
            {
                label: 'Cultural Aesthetic',
                desc: 'Which digital ecosystem matches your vision?',
                options: ['en.wikipedia.org', 'x.com', 'midjourney.com', 'nasa.gov']
            },
            {
                label: 'Material Language',
                desc: 'The physical metaphor driving the UI.',
                options: ['Matte Ceramic', 'Polished Obsidian', 'Chiseled Stone', 'Woven Fiber']
            }
        ],
        density: [
            {
                label: 'Information Density',
                desc: 'How should the space be utilized?',
                options: ['Sparse & Focused', 'Data-Dense Grid', 'Playful & Fluid', 'Efficiency-First']
            },
            {
                label: 'Temporal Flow',
                desc: 'How should the content update feel?',
                options: ['Static & Calm', 'Real-time Pulse', 'Progressive Reveal', 'Fast Streams']
            },
            {
                label: 'Spatial Pressure',
                desc: 'The breathing room of the page.',
                options: ['Tight & Technical', 'Vast Negatives', 'Balanced Comfort', 'Full Bleed']
            }
        ],
        navigation: [
            {
                label: 'Movement Paradigm',
                desc: 'How the user moves through space.',
                options: ['Single Vertical Scroll', 'Multi-Level Anchor Grid', 'Canvas-Based Freeform', 'Classic Header Menu']
            },
            {
                label: 'Input Surface',
                desc: 'Where are the primary controls located?',
                options: ['Floating Command Bar', 'Side-Docked Strips', 'Radial Menus', 'Bottom-Heavy Tab Bar']
            },
            {
                label: 'Z-Axis Depth',
                desc: 'How navigation layers interact.',
                options: ['Flat Paper', 'Stacked Cards', 'Tunnel Immersion', 'Glass Panes']
            }
        ],
        hierarchy: [
            {
                label: 'Attention Hierarchy',
                desc: 'Where the eye goes first.',
                options: ['Hero-Led Discovery', 'Dashboard Narrative', 'Linear Breadcrumbs', 'Direct Utility CTA']
            },
            {
                label: 'Structure Priority',
                desc: 'The center of gravity for the build.',
                options: ['Media Centerpiece', 'Interactive Widget Box', 'Dense Typographic Wall', 'Empty Calm']
            },
            {
                label: 'Narrative Path',
                desc: 'How the user reads the interface.',
                options: ['F-Pattern Default', 'Z-Pattern Scan', 'Circular Discovery', 'Linear Guided']
            }
        ]
    };

    const cycleTier = (key: string) => {
        setTiers(prev => ({ ...prev, [key]: (prev[key] + 1) % 3 }));
    };

    const skipQuestion = (section: 'style' | 'architecture', key: string) => {
        setData(prev => ({
            ...prev,
            [section]: {
                ...(prev[section] as any),
                [key]: 'AI Optimized'
            }
        }));
    };

    const elementOptions = [
        'Interactive Charts', 'Video Background', 'Primary CTA', 'Search System', 
        'Live Feed', 'Profile Widgets', 'Multi-Column Layout', 'Image Gallery', 
        'Input Form', 'Mechanical Footer'
    ];

    const toggleElement = (el: string) => {
        setData(prev => ({
            ...prev,
            elements: prev.elements.includes(el) 
                ? prev.elements.filter(e => e !== el) 
                : [...prev.elements, el]
        }));
    };

    const isComplete = 
        (data.style.lookAndFeel && data.style.density) && 
        (data.architecture.navigation && data.architecture.hierarchy) && 
        data.context.trim().length > 5;

    const renderQuestion = (section: 'style' | 'architecture', key: string) => {
        const tierIndex = tiers[key];
        const tier = banks[key][tierIndex];
        const selectedValue = (data[section] as any)[key];
        const isSkipped = selectedValue === 'AI Optimized';

        return (
            <div key={key} className={`calibration-question ${isSkipped ? 'skipped' : ''}`}>
                <div className="q-header-row">
                    <label>{tier.label} <span className="tier-tag">V{tierIndex + 1}</span></label>
                    <div className="q-actions">
                        <button onClick={() => cycleTier(key)}>Rephrase</button>
                        <button onClick={() => skipQuestion(section, key)}>Let AI Decide</button>
                    </div>
                </div>
                <p className="q-desc">{tier.desc}</p>
                <div className="option-pill-group">
                    {!isSkipped ? tier.options.map(opt => (
                        <button 
                            key={opt}
                            className={`option-pill ${selectedValue === opt ? 'active' : ''}`}
                            onClick={() => setData(prev => ({
                                ...prev, 
                                [section]: { ...prev[section], [key]: opt }
                            }))}
                        >
                            {opt}
                        </button>
                    )) : (
                        <div className="skip-badge"><SparklesIcon /> AI will optimize this selection</div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="calibration-screen">
            <div className="calibration-container">
                <div className="calibration-header">
                    <div className="calibration-title-group">
                        <div className="pro-badge">PRO MODE</div>
                        <h2>Idea Calibration</h2>
                        <p className="original-prompt">Target: "{prompt}"</p>
                    </div>
                    <button className="close-btn" onClick={onCancel}><CloseIcon /></button>
                </div>

                <div className="calibration-body">
                    <section className="calibration-section">
                        <h3><span className="step-num">01</span> Visual & Sensory Style</h3>
                        <div className="question-grid">
                            {renderQuestion('style', 'lookAndFeel')}
                            {renderQuestion('style', 'density')}
                        </div>
                    </section>

                    <section className="calibration-section">
                        <h3><span className="step-num">02</span> Architectural DNA</h3>
                        <div className="question-grid">
                            {renderQuestion('architecture', 'navigation')}
                            {renderQuestion('architecture', 'hierarchy')}
                        </div>
                    </section>

                    <section className="calibration-section">
                        <h3><span className="step-num">03</span> Component A La Carte</h3>
                        <p className="q-desc">Select required elements. If not selected, they will be omitted.</p>
                        <div className="element-grid">
                            {elementOptions.map(el => (
                                <button 
                                    key={el}
                                    className={`element-chip ${data.elements.includes(el) ? 'active' : ''}`}
                                    onClick={() => toggleElement(el)}
                                >
                                    {data.elements.includes(el) && <CheckIcon />}
                                    {el}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="calibration-section">
                        <h3><span className="step-num">04</span> Core Context</h3>
                        <div className="calibration-question">
                            <label>Design Intent</label>
                            <p className="q-desc">Target audience, utility, and what visitors should feel.</p>
                            <textarea 
                                className="calibration-textarea"
                                placeholder="e.g. For professional traders looking for high-speed clarity. They should feel empowered and focused. The centerpiece is the interactive candle chart."
                                value={data.context}
                                onChange={(e) => setData(prev => ({...prev, context: e.target.value}))}
                            />
                        </div>
                    </section>
                </div>

                <div className="calibration-footer">
                    <button className="btn-secondary" onClick={onCancel}>Abort</button>
                    <button 
                        className="btn-primary-pro" 
                        disabled={!isComplete}
                        onClick={() => onComplete(data)}
                    >
                        <SparklesIcon /> Initiate Engineering Phase
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IdeaCalibration;
