import React, { useState } from 'react';
import { WorkspaceSettings, ReasoningEffort } from '../types';
import { CloseIcon } from './Icons';
import { listModelsByProvider, getModel, ProviderId, ModelDef, ModelCapabilities } from '../lib/models';
import { ProviderConfig } from '../lib/providers';
import { PROMPT_DEFS, getDefault } from '../lib/promptStore';
import IdeaCalibration from './IdeaCalibration';

interface SettingsPanelProps {
    settings: WorkspaceSettings;
    providerConfig: ProviderConfig;
    promptOverrides: Record<string, string>;
    onUpdateSettings: (partial: Partial<WorkspaceSettings>) => void;
    onUpdateProviderConfig: (partial: Partial<ProviderConfig>) => void;
    onUpdatePromptOverride: (id: string, value: string) => void;
    onResetPrompt: (id: string) => void;
    onClose: () => void;
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
    gemini: 'Gemini',
    openai: 'OpenAI / Compatible',
    mistral: 'Mistral',
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--color-border-secondary, #444)',
    background: 'rgba(255,255,255,0.04)',
    color: 'inherit',
    fontSize: 13,
    marginTop: 4,
    boxSizing: 'border-box',
};

const fieldLabelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    opacity: 0.75,
    marginTop: 10,
};

const capTags = (caps: ModelCapabilities): string[] => {
    const tags: string[] = [];
    if (caps.image) tags.push('image');
    if (caps.json) tags.push('json');
    if (caps.thinking) tags.push('thinking');
    return tags;
};

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, providerConfig, promptOverrides, onUpdateSettings, onUpdateProviderConfig, onUpdatePromptOverride, onResetPrompt, onClose }) => {
    const tempLabel = settings.temperature <= 0.5 ? 'Precise' : settings.temperature <= 1.2 ? 'Balanced' : 'Creative';
    const [showCalibration, setShowCalibration] = useState(false);
    const byProvider = listModelsByProvider();
    const providerOrder: ProviderId[] = ['gemini', 'openai', 'mistral'];
    const cal = settings.calibration;
    const promptGroups = [...new Set(PROMPT_DEFS.map(d => d.group))];

    return (
        <div className="settings-overlay">
            <div className="settings-backdrop" onClick={onClose} />
            <div className="settings-panel">
                <div className="settings-header">
                    <h2>Settings</h2>
                    <button onClick={onClose}><CloseIcon /></button>
                </div>

                <div className="settings-section">
                    <h3>Generation Mode</h3>
                    <div className="temp-presets">
                        <button
                            className={settings.generationMode !== 'screens' ? 'active' : ''}
                            onClick={() => onUpdateSettings({ generationMode: 'variants' })}
                        >
                            Style Variants
                        </button>
                        <button
                            className={settings.generationMode === 'screens' ? 'active' : ''}
                            onClick={() => onUpdateSettings({ generationMode: 'screens', matchImageExactly: false })}
                        >
                            Multi-Screen
                        </button>
                    </div>
                    <div className="settings-hint">
                        {settings.generationMode === 'screens'
                            ? 'One design option per generation: a single style applied across 2-3 screens (e.g. catalog / shopping / profile), each generated as its own file. Attach up to 3 reference images — one per screen.'
                            : 'Produces several artifacts per generation, each exploring a different style direction.'}
                    </div>
                </div>

                {settings.generationMode === 'screens' ? (
                    <div className="settings-section">
                        <h3>Screens</h3>
                        <div className="settings-hint">Screens per option when your idea or reference images don't specify them.</div>
                        <div className="artifact-count-selector">
                            <div className="artifact-count-presets">
                                {[2, 3].map(count => (
                                    <button
                                        key={count}
                                        className={settings.screenCount === count ? 'active' : ''}
                                        onClick={() => onUpdateSettings({ screenCount: count })}
                                    >
                                        {count}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="settings-section">
                        <h3>Artifact Count</h3>
                        <div className="artifact-count-selector">
                            <div className="artifact-count-presets">
                                {[1, 2, 3].map(count => (
                                    <button
                                        key={count}
                                        className={settings.artifactCount === count ? 'active' : ''}
                                        onClick={() => onUpdateSettings({ artifactCount: count })}
                                    >
                                        {count}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className="settings-section">
                    <h3>Model</h3>
                    {providerOrder.map(pid => {
                        const models: ModelDef[] = byProvider[pid] || [];
                        if (!models.length) return null;
                        return (
                            <div key={pid} style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.6, margin: '6px 0' }}>
                                    {PROVIDER_LABELS[pid]}
                                </div>
                                <div className="model-cards">
                                    {models.map(model => (
                                        <div
                                            key={model.id}
                                            className={`model-card ${settings.model === model.id ? 'active' : ''}`}
                                            onClick={() => onUpdateSettings({ model: model.id })}
                                        >
                                            <div className="model-name">
                                                {model.label}
                                                {model.capabilities.thinking && <span className="thinking-tag">Thinking</span>}
                                            </div>
                                            <div className="model-desc">{model.desc}</div>
                                            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                                                {capTags(model.capabilities).map(t => (
                                                    <span key={t} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, border: '1px solid var(--color-border-secondary, #555)', opacity: 0.7 }}>{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {getModel(settings.model)?.capabilities.thinking && (
                    <div className="settings-section">
                        <h3>Reasoning Effort</h3>
                        <div className="settings-hint">How hard the selected model thinks before answering.</div>
                        <div className="temp-presets">
                            {([['Default', undefined], ['Low', 'low'], ['Medium', 'medium'], ['High', 'high']] as [string, ReasoningEffort | undefined][]).map(([label, val]) => (
                                <button
                                    key={label}
                                    className={settings.reasoningEffort === val ? 'active' : ''}
                                    onClick={() => onUpdateSettings({ reasoningEffort: val })}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="settings-section" id="settings-providers">
                    <h3>Providers</h3>
                    <div className="settings-hint">Keys are stored in your browser (client-side) — fine for local use, not for a public deploy.</div>
                    <label style={fieldLabelStyle}>Gemini API key</label>
                    <input
                        type="password"
                        style={inputStyle}
                        value={providerConfig.geminiApiKey}
                        placeholder="defaults to GEMINI_API_KEY env"
                        onChange={e => onUpdateProviderConfig({ geminiApiKey: e.target.value })}
                    />
                    <label style={fieldLabelStyle}>OpenAI API key</label>
                    <input
                        type="password"
                        style={inputStyle}
                        value={providerConfig.openaiApiKey}
                        placeholder="sk-… (leave blank for keyless local endpoints)"
                        onChange={e => onUpdateProviderConfig({ openaiApiKey: e.target.value })}
                    />
                    <label style={fieldLabelStyle}>OpenAI-compatible base URL</label>
                    <input
                        type="text"
                        style={inputStyle}
                        value={providerConfig.openaiBaseUrl}
                        placeholder="https://api.openai.com/v1"
                        onChange={e => onUpdateProviderConfig({ openaiBaseUrl: e.target.value })}
                    />
                    <label style={fieldLabelStyle}>Custom model id (for “Custom endpoint”)</label>
                    <input
                        type="text"
                        style={inputStyle}
                        value={providerConfig.openaiCustomModel}
                        placeholder="e.g. gpt-6.1-sol · llama3.1 · anthropic/claude-3.5-sonnet"
                        onChange={e => onUpdateProviderConfig({ openaiCustomModel: e.target.value })}
                    />
                    <div className="settings-hint" style={{ marginTop: 8 }}>
                        Point the base URL at OpenRouter, Ollama, LM Studio, etc. and pick “Custom endpoint” above.
                    </div>
                    <label style={fieldLabelStyle}>Mistral API key</label>
                    <input
                        type="password"
                        style={inputStyle}
                        value={providerConfig.mistralApiKey}
                        placeholder="for Mistral / Pixtral / Codestral models"
                        onChange={e => onUpdateProviderConfig({ mistralApiKey: e.target.value })}
                    />
                </div>

                <div className="settings-section prompts">
                    <h3>Prompts</h3>
                    {promptGroups.map(group => (
                        <div key={group} style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.6, margin: '6px 0' }}>{group}</div>
                            {PROMPT_DEFS.filter(d => d.group === group).map(def => {
                                const isCustom = promptOverrides[def.id] !== undefined;
                                const value = isCustom ? promptOverrides[def.id] : getDefault(def.id);
                                return (
                                    <details className="prompt-def" key={def.id} style={{ border: '1px solid var(--color-border-secondary, #444)', borderRadius: 8, padding: '6px 10px', marginBottom: 6 }}>
                                        <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 13 }}>{def.label}</span>
                                            {isCustom && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, border: '1px solid var(--color-text-info, #69f)', color: 'var(--color-text-info, #69f)' }}>customized</span>}
                                        </summary>
                                        <div style={{ fontSize: 11, opacity: 0.7, margin: '6px 0' }}>{def.description}</div>
                                        {def.placeholders.length > 0 && (
                                            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>
                                                Tokens: {def.placeholders.map(p => `{${p}}`).join(', ')}
                                            </div>
                                        )}
                                        <textarea
                                            className="calibration-textarea"
                                            style={{ width: '100%', minHeight: 120, boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 11 }}
                                            value={value}
                                            onChange={e => onUpdatePromptOverride(def.id, e.target.value)}
                                        />
                                        {isCustom && (
                                            <button className="btn-secondary" style={{ marginTop: 6 }} onClick={() => onResetPrompt(def.id)}>
                                                Reset to default
                                            </button>
                                        )}
                                    </details>
                                );
                            })}
                        </div>
                    ))}
                </div>

                <div className="settings-section">
                    <h3>Design Calibration</h3>
                    <div className="settings-hint">Optional structured intent (style, density, navigation, required elements) injected into generation.</div>
                    {cal ? (
                        <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 12, lineHeight: 1.6, opacity: 0.85 }}>
                                {cal.style?.lookAndFeel && <div>Look &amp; feel: {cal.style.lookAndFeel}</div>}
                                {cal.style?.density && <div>Density: {cal.style.density}</div>}
                                {cal.architecture?.navigation && <div>Navigation: {cal.architecture.navigation}</div>}
                                {cal.architecture?.hierarchy && <div>Hierarchy: {cal.architecture.hierarchy}</div>}
                                {cal.elements?.length ? <div>Elements: {cal.elements.join(', ')}</div> : null}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <button className="btn-secondary" onClick={() => setShowCalibration(true)}>Edit</button>
                                <button className="btn-secondary" onClick={() => onUpdateSettings({ calibration: null })}>Clear</button>
                            </div>
                        </div>
                    ) : (
                        <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setShowCalibration(true)}>
                            Set up calibration
                        </button>
                    )}
                </div>

                <div className="settings-section">
                    <h3>Temperature</h3>
                    <div className="temp-slider">
                        <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            value={settings.temperature}
                            onChange={e => onUpdateSettings({ temperature: parseFloat(e.target.value) })}
                        />
                        <div className="temp-value">
                            <span>{settings.temperature.toFixed(1)}</span>
                            <span>{tempLabel}</span>
                        </div>
                    </div>
                    <div className="temp-presets">
                        <button
                            className={settings.temperature === 0.3 ? 'active' : ''}
                            onClick={() => onUpdateSettings({ temperature: 0.3 })}
                        >
                            Precise
                        </button>
                        <button
                            className={settings.temperature === 1.0 ? 'active' : ''}
                            onClick={() => onUpdateSettings({ temperature: 1.0 })}
                        >
                            Balanced
                        </button>
                        <button
                            className={settings.temperature === 1.5 ? 'active' : ''}
                            onClick={() => onUpdateSettings({ temperature: 1.5 })}
                        >
                            Creative
                        </button>
                    </div>
                </div>

              
            </div>

            {showCalibration && (
                <IdeaCalibration
                    prompt="Applies to your next generation"
                    onComplete={(data) => { onUpdateSettings({ calibration: data }); setShowCalibration(false); }}
                    onCancel={() => setShowCalibration(false)}
                />
            )}
        </div>
    );
};

export default SettingsPanel;
