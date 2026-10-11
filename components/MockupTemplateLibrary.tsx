import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutPreset } from '../lib/mockupBlueprint';
import { TEMPLATE_CATEGORIES } from '../lib/mockupTemplates';

/** The preview uses the same positions as the editable layout placed on the canvas. */
export const PresetThumb: React.FC<{ preset: LayoutPreset }> = ({ preset }) => {
    const top = Math.min(...preset.elements.map(e => e.y));
    const bottom = Math.max(...preset.elements.map(e => e.y + e.height));
    const span = Math.max(bottom - top, 100);
    const offset = top - (span - (bottom - top)) / 2;
    return (
        <span className="palette-preset-thumb" aria-hidden="true">
            {preset.elements.map((e, i) => (
                <i
                    key={i}
                    className={`k-${e.kind}${/avatar/i.test(e.label) ? ' k-avatar' : ''}${e.label === '404' ? ' k-error-code' : ''}`}
                    style={{ left: `${e.x}%`, top: `${((e.y - offset) / span) * 100}%`, width: `${e.width}%`, height: `${(e.height / span) * 100}%` }}
                >
                    {e.label === '404' ? '404' : null}
                </i>
            ))}
        </span>
    );
};

interface TemplateLibraryProps {
    initialCategory: string | null;
    onAdd: (preset: LayoutPreset) => boolean;
    onClose: () => void;
    notice: string;
}

const MockupTemplateLibrary: React.FC<TemplateLibraryProps> = ({ initialCategory, onAdd, onClose, notice }) => {
    const [categoryId, setCategoryId] = useState(initialCategory);
    const [query, setQuery] = useState('');
    const headingRef = useRef<HTMLHeadingElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const category = TEMPLATE_CATEGORIES.find(c => c.id === categoryId);
    const search = query.trim().toLocaleLowerCase();
    const categories = useMemo(() => TEMPLATE_CATEGORIES.filter(c =>
        `${c.label} ${c.description}`.toLocaleLowerCase().includes(search)
        || c.presets.some(p => p.label.toLocaleLowerCase().includes(search))), [search]);
    const presets = useMemo(() => category?.presets.filter(p =>
        `${p.label} ${category.label} ${category.description}`.toLocaleLowerCase().includes(search)) ?? [], [category, search]);

    useEffect(() => {
        headingRef.current?.focus({ preventScroll: true });
        scrollRef.current?.scrollTo({ top: 0 });
    }, [categoryId]);

    const browse = (id: string | null) => {
        setCategoryId(id);
        setQuery('');
    };

    return (
        <section className="mockup-template-library" aria-labelledby="template-library-heading">
            <div className="template-library-header">
                <div className="template-library-navigation">
                    {category && <button type="button" className="template-library-back" onClick={() => browse(null)}>← All categories</button>}
                    <button type="button" className="template-library-close" onClick={onClose}>Back to canvas <span aria-hidden="true">↗</span></button>
                </div>
                <div className="template-library-intro">
                    <div>
                        <h2 id="template-library-heading" ref={headingRef} tabIndex={-1}>{category?.label ?? 'Layout templates'}</h2>
                        <p>{category ? `${category.presets.length} editable variants. Choose one to add to your canvas.` : 'Choose a category, then find a layout for your next section.'}</p>
                    </div>
                    <label className="template-library-search">
                        <span>{category ? 'Find a variant' : 'Find a template'}</span>
                        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={category ? 'Search variants…' : 'Search categories or layouts…'} />
                    </label>
                </div>
                {notice && <p className="template-library-notice" role="status">{notice}</p>}
            </div>
            <div className="template-library-scroll" ref={scrollRef}>
                <div className="template-library-grid">
                    {category ? presets.map(preset => (
                        <button type="button" key={preset.id} className="template-library-card template-variant-card" onClick={() => onAdd(preset)} aria-label={`Add ${preset.label} layout to canvas`}>
                            <PresetThumb preset={preset} />
                            <span className="template-card-copy">
                                <span className="template-card-title">{preset.label}</span>
                                <span className="template-card-footer"><span>{category.label}</span><span className="template-card-action">Add layout <span aria-hidden="true">＋</span></span></span>
                            </span>
                        </button>
                    )) : categories.map(c => (
                        <button type="button" key={c.id} className="template-library-card" onClick={() => browse(c.id)} aria-label={`Browse ${c.label}, ${c.presets.length} variants`}>
                            <PresetThumb preset={c.presets[0]} />
                            <span className="template-card-copy">
                                <span className="template-card-title">{c.label}</span>
                                <span className="template-card-description">{c.description}</span>
                                <span className="template-card-footer"><span>{c.presets.length} variants</span><span className="template-card-action">Browse <span aria-hidden="true">→</span></span></span>
                            </span>
                        </button>
                    ))}
                </div>
                {(category ? presets.length === 0 : categories.length === 0) && (
                    <div className="template-library-empty" role="status">
                        <p>No layouts match “{query}”.</p>
                        <button type="button" onClick={() => setQuery('')}>Clear search</button>
                    </div>
                )}
            </div>
        </section>
    );
};

export default MockupTemplateLibrary;
