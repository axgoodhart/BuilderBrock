
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import ReactDOM from 'react-dom/client';
import { useWorkspace } from './hooks/useWorkspace';
import WorkspaceLayout from './components/WorkspaceLayout';
import { Toast } from './components/Toast';

function App() {
    const workspace = useWorkspace();

    const artifactKey = workspace.selectedArtifactId || '__global__';
    const currentMessages = workspace.chatMessages.get(artifactKey) || [];
    const selectedArtifactHtml = workspace.selectedArtifact?.html || null;

    return (
        <>
            <Toast toasts={workspace.toasts} onDismiss={workspace.dismissToast} />
            <WorkspaceLayout
                projects={workspace.projects}
                selectedProjectId={workspace.selectedProjectId}
                selectedArtifactId={workspace.selectedArtifactId}
                onSelectProject={workspace.selectProject}
                onSelectArtifact={workspace.selectArtifact}
                onDeleteProject={workspace.deleteProject}
                onNewProject={workspace.createNewProject}
                onCreateOmneon={workspace.createOmneonProject}
                onCreateSprites={workspace.createSpriteProject}
                onPatchArtifact={workspace.handlePatchArtifact}
                selectedProject={workspace.selectedProject}

                chatMessages={currentMessages}
                chatMode={workspace.chatMode}
                isLoading={workspace.isLoading}
                uploadedImages={workspace.uploadedImages}
                onSendMessage={workspace.sendMessage}
                onSetChatMode={workspace.setChatMode}
                onImageUpload={workspace.addUploadedImage}
                onRemoveImage={workspace.removeUploadedImage}

                selectedArtifactHtml={selectedArtifactHtml}
                isStreaming={workspace.isStreaming}

                settings={workspace.settings}
                providerConfig={workspace.providerConfig}
                promptOverrides={workspace.promptOverrides}
                settingsOpen={workspace.settingsOpen}
                onUpdateSettings={workspace.updateSettings}
                onUpdateProviderConfig={workspace.updateProviderConfig}
                onUpdatePromptOverride={workspace.updatePromptOverride}
                onResetPrompt={workspace.resetPrompt}
                onOpenSettings={() => workspace.setSettingsOpen(true)}
                onCloseSettings={() => workspace.setSettingsOpen(false)}

                selectedArtifact={workspace.selectedArtifact}
                onUpdateArtifact={workspace.handleUpdateArtifact}

                onMockupGenerate={workspace.handleMockupGenerate}
                implementNotice={workspace.implementNotice}
                mockupNotice={workspace.mockupNotice}
                artifactNotice={workspace.artifactNotice}
                selectedWireframe={workspace.selectedWireframe}

                isUserEditsProject={workspace.isUserEditsProject(workspace.selectedProjectId)}
                onSaveToUserEdits={workspace.saveToUserEdits}
            />
        </>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<React.StrictMode><App /></React.StrictMode>);
}
