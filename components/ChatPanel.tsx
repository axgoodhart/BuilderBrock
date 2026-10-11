import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, ChatMode, GenerationMode } from '../types';
import { SendIcon, ChatIcon, WrenchIcon, UploadIcon, ThinkingIcon } from './Icons';
import GenerationNotice, { GenerationNoticeView } from './GenerationNotice';

interface ChatPanelProps {
    messages: ChatMessage[];
    chatMode: ChatMode;
    generationMode?: GenerationMode;
    matchImageExactly: boolean;
    isLoading: boolean;
    uploadedImages: { data: string; mimeType: string }[];
    onSendMessage: (message: string) => void;
    onSetChatMode: (mode: ChatMode) => void;
    onImageUpload: (image: { data: string; mimeType: string }) => void;
    onRemoveImage: (index: number) => void;
    onUpdateMatchImageExactly: (matchImageExactly: boolean) => void;
    highlightedLineCount?: number;
    notice?: GenerationNoticeView | null;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
    messages,
    chatMode,
    generationMode,
    matchImageExactly,
    isLoading,
    uploadedImages,
    onSendMessage,
    onSetChatMode,
    onImageUpload,
    onRemoveImage,
    onUpdateMatchImageExactly,
    highlightedLineCount,
    notice,
}) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const maxImages = generationMode === 'screens' ? 3 : 1;
    const showExactMatchControl = chatMode === 'implement'
        && generationMode !== 'screens'
        && uploadedImages.length === 1;

    const handleSend = useCallback(() => {
        if (!input.trim() && !uploadedImages.length) return;
        onSendMessage(input);
        setInput('');
    }, [input, uploadedImages, onSendMessage]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        // In single-image mode a new upload replaces the old one; otherwise fill remaining slots.
        const capacity = maxImages === 1 ? 1 : Math.max(0, maxImages - uploadedImages.length);
        const fileList = e.target.files;
        const files: File[] = [];
        for (let i = 0; fileList && i < fileList.length; i++) {
            const f = fileList[i];
            if (f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024) files.push(f);
        }
        files.splice(capacity);

        for (const file of files) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64Data = (reader.result as string).split(',')[1];
                onImageUpload({ data: base64Data, mimeType: file.type });
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    }, [onImageUpload, maxImages, uploadedImages.length]);

    return (
        <div className="chat-panel">
            <div className="chat-mode-toggle">
                <div className="chat-mode-pill">
                    <button
                        className={chatMode === 'discuss' ? 'active' : ''}
                        onClick={() => onSetChatMode('discuss')}
                    >
                        <ChatIcon /> Discuss
                    </button>
                    <button
                        className={chatMode === 'implement' ? 'active' : ''}
                        onClick={() => onSetChatMode('implement')}
                    >
                        <WrenchIcon /> Implement
                    </button>
                </div>
            </div>

            <div className="chat-messages">
                {messages.length === 0 && (
                    <div className="empty-hint">
                        {chatMode === 'discuss'
                            ? 'Discuss design ideas, get feedback, brainstorm UI concepts.'
                            : generationMode === 'screens'
                                ? 'Describe the app and its screens (e.g. catalog, shopping, profile) — or attach one reference image per screen. One styled set of pages will be generated.'
                                : 'Describe what to build. Artifacts will be generated with streaming.'}
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`chat-msg ${msg.role}`}>
                        {msg.text}
                    </div>
                ))}
                {isLoading && (
                    <div className="chat-msg model loading">
                        <ThinkingIcon /> {chatMode === 'discuss' ? 'Thinking...' : 'Generating...'}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
                {notice && <GenerationNotice notice={notice} disabled={isLoading} />}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    multiple={maxImages > 1}
                    style={{ display: 'none' }}
                />
                {uploadedImages.length > 0 && (
                    <div className="chat-image-attachments" aria-label="Attached reference images">
                        {uploadedImages.map((image, i) => (
                            <figure className="chat-image-preview" key={`${image.mimeType}-${i}`}>
                                <img
                                    src={`data:${image.mimeType};base64,${image.data}`}
                                    alt={maxImages > 1 ? `Reference image for screen ${i + 1}` : 'Attached reference image'}
                                />
                                <figcaption>{maxImages > 1 ? `Screen ${i + 1}` : 'Reference image'}</figcaption>
                                <button
                                    type="button"
                                    onClick={() => onRemoveImage(i)}
                                    aria-label={`Remove ${maxImages > 1 ? `screen ${i + 1} ` : ''}reference image`}
                                    title="Remove image"
                                >
                                    &times;
                                </button>
                            </figure>
                        ))}
                    </div>
                )}
                {showExactMatchControl && (
                    <label className="chat-image-exact-match">
                        <input
                            type="checkbox"
                            checked={matchImageExactly}
                            onChange={e => onUpdateMatchImageExactly(e.target.checked)}
                        />
                        <span>
                            <strong>Match image exactly</strong>
                            <small>Recreate its visual design instead of using it as inspiration.</small>
                        </span>
                    </label>
                )}
                <div className="chat-input-row">
                    {chatMode === 'implement' && (
                        <button
                            className="chat-image-upload"
                            onClick={() => fileInputRef.current?.click()}
                            title={maxImages > 1 ? `Upload reference images (one per screen, up to ${maxImages})` : 'Upload reference image'}
                        >
                            <UploadIcon />
                        </button>
                    )}
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            highlightedLineCount
                                ? `${highlightedLineCount} line${highlightedLineCount === 1 ? '' : 's'} selected — ask about them...`
                                : chatMode === 'discuss'
                                    ? 'Ask about your design...'
                                    : generationMode === 'screens'
                                        ? 'Describe the app and its screens...'
                                        : 'Describe what to build...'
                        }
                        disabled={isLoading}
                        rows={1}
                    />
                    <button
                        className="send-btn"
                        onClick={handleSend}
                        disabled={isLoading || (!input.trim() && !uploadedImages.length)}
                    >
                        <SendIcon />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatPanel;
