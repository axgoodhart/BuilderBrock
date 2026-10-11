import React, { useState, useCallback } from 'react';
import {
    FolderIcon,
    FolderOpenIcon,
    FileIcon,
    PlusIcon,
    TrashIcon,
    ChevronRightIcon,
    ChevronDownIcon,
} from './Icons';
import { TEMPLATES, buildTemplateDocument } from '../features/omneon/templates';

interface FileTreeProps {
    projects: any[];
    selectedProjectId: string | null;
    selectedArtifactId: string | null;
    onSelectProject: (projectId: string) => void;
    onSelectArtifact: (artifactId: string) => void;
    onDeleteProject: (projectId: string) => void;
    onNewProject: () => void;
    onCreateOmneon: (name: string, initialSceneJson: string) => void;
    onCreateSprites: (name?: string) => void;
}

// ==== STATUS DOT ====
const STATUS_LABELS: Record<string, string> = {
    streaming: 'Generating…',
    partial: 'Stopped partway',
    interrupted: 'Interrupted',
    error: 'Failed',
    warning: 'Has problems',
};

const ArtifactStatusDot: React.FC<{ artifact: any }> = ({ artifact }) => {
    const state = artifact.status === 'complete' && artifact.errorMessage ? 'warning' : artifact.status;
    const label = STATUS_LABELS[state];
    if (!label) return null;
    return <span className={`tree-artifact-status status-${state}`} title={label} aria-label={label} />;
};

const FileTree: React.FC<FileTreeProps> = ({
    projects,
    selectedProjectId,
    selectedArtifactId,
    onSelectProject,
    onSelectArtifact,
    onDeleteProject,
    onNewProject,
    onCreateOmneon,
    onCreateSprites,
}) => {
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
    const [launchpadOpen, setLaunchpadOpen] = useState(false);
    const [omneonName, setOmneonName] = useState('');
    const [omneonTemplate, setOmneonTemplate] = useState(TEMPLATES[0].id);
    const [spritesName, setSpritesName] = useState('');

    const handlePickSprites = useCallback(() => {
        setLaunchpadOpen(false);
        setSpritesName('');
        onCreateSprites(spritesName);
    }, [spritesName, onCreateSprites]);

    const handleNewClick = useCallback(() => {
        setLaunchpadOpen(true);
    }, []);

    const handlePickWeb = useCallback(() => {
        setLaunchpadOpen(false);
        onNewProject();
    }, [onNewProject]);

    const handlePickMockup = useCallback(() => {
        setLaunchpadOpen(false);
        onNewProject();
    }, [onNewProject]);

    const handlePickOmneon = useCallback(() => {
        const name = omneonName.trim() || 'Omneon Scene';
        const initialScene = JSON.stringify(buildTemplateDocument(omneonTemplate));
        setLaunchpadOpen(false);
        setOmneonName('');
        onCreateOmneon(name, initialScene);
    }, [omneonName, omneonTemplate, onCreateOmneon]);

    const toggleExpand = useCallback((projectId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedProjects(prev => {
            const next = new Set(prev);
            if (next.has(projectId)) next.delete(projectId);
            else next.add(projectId);
            return next;
        });
    }, []);

    const handleProjectClick = useCallback((projectId: string) => {
        onSelectProject(projectId);
        setExpandedProjects(prev => new Set(prev).add(projectId));
    }, [onSelectProject]);

    return (
        <div className="file-tree">
            <div className="file-tree-header">
                <span>Projects</span>
                <button onClick={handleNewClick} title="New project">
                    <PlusIcon /> New
                </button>
            </div>
            <div className="tree-list">
                {projects.map(project => {
                    const isExpanded = expandedProjects.has(project.id) || project.id === selectedProjectId;
                    const isSelected = project.id === selectedProjectId;
                    const artifacts = project.artifacts || [];

                    return (
                        <div key={project.id} className="tree-project">
                            <div
                                className={`tree-project-header ${isSelected ? 'selected' : ''}`}
                                onClick={() => handleProjectClick(project.id)}
                            >
                                <span onClick={(e) => toggleExpand(project.id, e)} style={{ display: 'flex', alignItems: 'center' }}>
                                    {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                                </span>
                                {isExpanded ? <FolderOpenIcon /> : <FolderIcon />}
                                <span className="tree-project-name">
                                    {project.name || project.prompt || 'Untitled'}
                                </span>
                                <button
                                    className="tree-project-delete"
                                    onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); }}
                                    title="Delete project"
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                            {isExpanded && artifacts.length > 0 && (
                                <div className="tree-artifacts">
                                    {artifacts.map((artifact: any, i: number) => (
                                        <div
                                            key={artifact.id}
                                            className={`tree-artifact ${artifact.id === selectedArtifactId ? 'selected' : ''}`}
                                            onClick={() => {
                                                if (project.id !== selectedProjectId) {
                                                    onSelectProject(project.id);
                                                }
                                                onSelectArtifact(artifact.id);
                                            }}
                                        >
                                            <FileIcon />
                                            <span>{artifact.variantLabel || `Variant ${i + 1}`}</span>
                                            <ArtifactStatusDot artifact={artifact} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
                {projects.length === 0 && (
                    <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.5 }}>
                        No projects yet
                    </div>
                )}
            </div>

            {/* New Project launchpad */}
            {launchpadOpen && (
                <div className="launchpad-overlay" onClick={() => setLaunchpadOpen(false)}>
                    <div className="launchpad" onClick={e => e.stopPropagation()}>
                        <div className="launchpad-title">New Project</div>
                        <div className="launchpad-cards">
                            <button className="launchpad-card" onClick={handlePickWeb}>
                                <div className="launchpad-card-name">Web</div>
                                <div className="launchpad-card-desc">Generate HTML/CSS/JS pages and UI screens with chat.</div>
                            </button>
                            <button className="launchpad-card" onClick={handlePickMockup}>
                                <div className="launchpad-card-name">Mockup</div>
                                <div className="launchpad-card-desc">Sketch a layout on the canvas and generate a design from it.</div>
                            </button>
                            <div className="launchpad-card launchpad-card-omneon">
                                <div className="launchpad-card-name">Omneon Scene</div>
                                <div className="launchpad-card-desc">Create an editable 3D scene with chat, handles, timeline and physics.</div>
                                <select
                                    className="launchpad-select"
                                    value={omneonTemplate}
                                    onChange={e => setOmneonTemplate(e.target.value)}
                                >
                                    {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <div className="launchpad-omneon-row">
                                    <input
                                        className="launchpad-input"
                                        placeholder="Scene name"
                                        value={omneonName}
                                        onChange={e => setOmneonName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handlePickOmneon(); }}
                                    />
                                    <button className="launchpad-go" onClick={handlePickOmneon}>Create</button>
                                </div>
                            </div>
                            <div className="launchpad-card launchpad-card-omneon">
                                <div className="launchpad-card-name">Sprite Studio</div>
                                <div className="launchpad-card-desc">Turn a character image into animated sprite cycles, GIFs and a sprite sheet.</div>
                                <div className="launchpad-omneon-row">
                                    <input
                                        className="launchpad-input"
                                        placeholder="Session name"
                                        value={spritesName}
                                        onChange={e => setSpritesName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handlePickSprites(); }}
                                    />
                                    <button className="launchpad-go" onClick={handlePickSprites}>Create</button>
                                </div>
                            </div>
                        </div>
                        <button className="launchpad-close" onClick={() => setLaunchpadOpen(false)}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FileTree;
