import React from 'react';
import { SettingsIcon, SpriteIcon, ArrowLeftIcon, ArrowRightIcon } from './Icons';

interface HeaderProps {
    onActivate: () => void;
    settingsOpen: boolean;
    onToggleSettings: () => void;
    onOpenSprites: () => void;
    leftCollapsed: boolean;
    onToggleCollapse: () => void;
}

/* simple header */ 
const Header = ({ onActivate, settingsOpen, onToggleSettings, onOpenSprites, leftCollapsed, onToggleCollapse }: HeaderProps) => {
    return (
        <header className="site-header">
            <button
                className="header-dog"
                type="button"
                onClick={onActivate}
                aria-label="Open the workspace"
            >
                <h1 aria-hidden="true">
                    {'{'}<eye>:</eye><snoot>€</snoot>{'}'}<leg>BB<tail>~</tail></leg>
                </h1>
            </button>
            <div className="header-controls header-controls-left">
                <button
                    className="collapse-toggle"
                    onClick={onToggleCollapse}
                    title={leftCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                    aria-label={leftCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                >
                    {leftCollapsed ? <ArrowRightIcon /> : <ArrowLeftIcon />}
                </button>
            </div>
            <div className="header-title">
                <h2>builder<span className="display-name">Brock</span></h2>
            </div>
            <div className="header-controls header-controls-right">
                <button className="sprites-btn" onClick={onOpenSprites} title="New Sprite Studio session" aria-label="New Sprite Studio session">
                    <SpriteIcon />
                </button>
                <button
                    className={`settings-btn ${settingsOpen ? 'settings-btn-open' : ''}`}
                    onClick={onToggleSettings}
                    title={settingsOpen ? 'Close settings' : 'Settings'}
                    aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
                >
                    <SettingsIcon />
                </button>
            </div>
        </header>
    );
}
export default Header;
