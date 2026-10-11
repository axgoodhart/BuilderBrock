const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || 'API request failed');
  }
  return res.json();
}

// Projects
export async function getProjects() {
  return request<any[]>('/projects');
}

export async function getProject(id: string) {
  return request<any>(`/projects/${id}`);
}

export async function createProject(data: {
  name: string;
  prompt?: string;
  mode?: string;
  creationMode?: string;
  settings?: string;
}) {
  return request<any>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(id: string, data: Record<string, any>) {
  return request<any>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string) {
  return request<any>(`/projects/${id}`, { method: 'DELETE' });
}

export async function getOrCreateUserEditsProject() {
  return request<any>('/projects/user-edits');
}

// Artifacts
export async function getArtifact(id: string) {
  return request<any>(`/artifacts/${id}`);
}

export async function getArtifactsByProject(projectId: string, includeDiscarded = false) {
  return request<any[]>(`/artifacts/project/${projectId}?includeDiscarded=${includeDiscarded}`);
}

export async function createArtifact(data: {
  projectId: string;
  html: string;
  kind?: string;
  model: string;
  temperature?: number;
  variantIndex?: number;
  variantLabel?: string;
  status?: string;
  prompt?: string;
  imageRef?: string;
  errorMessage?: string | null;
}) {
  return request<any>('/artifacts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateArtifact(id: string, data: Record<string, any>) {
  return request<any>(`/artifacts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function uploadSpriteFrame(base64: string) {
  return request<{ url: string }>('/sprites/frames', {
    method: 'POST',
    body: JSON.stringify({ base64 }),
  });
}

export async function sweepInterruptedArtifacts() {
  return request<{ count: number }>('/artifacts/sweep-interrupted', { method: 'POST' });
}

export async function discardArtifact(id: string) {
  return request<any>(`/artifacts/${id}/discard`, { method: 'POST' });
}

export async function restoreArtifact(id: string) {
  return request<any>(`/artifacts/${id}/restore`, { method: 'POST' });
}

// Revisions
export async function createRevision(artifactId: string, data: {
  html: string;
  prompt: string;
  model?: string;
  selection?: string;
  diff?: string;
}) {
  return request<any>(`/artifacts/${artifactId}/revisions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getRevisions(artifactId: string) {
  return request<any[]>(`/artifacts/${artifactId}/revisions`);
}

/* ----------------------- Omneon scene history ----------------------- */

export async function getOrCreateMainBranch(artifactId: string) {
  return request<any>(`/scene/artifacts/${artifactId}/branches/main`);
}

export async function listBranches(artifactId: string) {
  return request<any[]>(`/scene/artifacts/${artifactId}/branches`);
}

export async function createBranch(artifactId: string, name: string, parentRevisionId: string | null) {
  return request<any>(`/scene/artifacts/${artifactId}/branches`, {
    method: 'POST',
    body: JSON.stringify({ name, parentRevisionId }),
  });
}

export async function createSceneRevision(data: {
  artifactId: string;
  branchId: string;
  document: string;
  source: string;
  prompt?: string | null;
  operations?: string | null;
  selection?: string | null;
  model?: string | null;
}) {
  return request<any>('/scene/revisions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listSceneRevisions(artifactId: string, branchId?: string) {
  const q = branchId ? `?branchId=${branchId}` : '';
  return request<any[]>(`/scene/artifacts/${artifactId}/revisions${q}`);
}

export async function promoteRevision(revisionId: string, toBranchId: string, prompt?: string) {
  return request<any>(`/scene/revisions/${revisionId}/promote`, {
    method: 'POST',
    body: JSON.stringify({ toBranchId, prompt }),
  });
}

export async function getOrCreateConversation(artifactId: string, branchId: string | null) {
  return request<any>(`/scene/artifacts/${artifactId}/conversation`, {
    method: 'POST',
    body: JSON.stringify({ branchId }),
  });
}

export async function addSceneMessage(conversationId: string, data: {
  role: string;
  text: string;
  operations?: string | null;
  explanation?: string | null;
  beforeRevisionId?: string | null;
  afterRevisionId?: string | null;
  status?: string;
  model?: string | null;
}) {
  return request<any>(`/scene/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSceneMessage(id: string, data: Record<string, any>) {
  return request<any>(`/scene/messages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}


/* ------------------------- assets (step 10) ------------------------- */

export interface AssetRecord {
  id: string;
  name: string;
  kind: string; // model | texture | hdr | audio | script | other
  origin: string; // local | mcp
  originUri: string;
  hash: string;
  path: string;
  sizeBytes: number;
  thumbnail: string | null;
  metadata: string | null;
  createdAt: string;
}

export function assetFileUrl(id: string) {
  return `${API_BASE}/assets/${id}/file`;
}

export async function listAssets(q?: string) {
  return request<AssetRecord[]>(`/assets${q ? `?q=${encodeURIComponent(q)}` : ''}`);
}

export async function listLocalAssetFiles() {
  return request<any[]>('/assets/local');
}

export async function importLocalAsset(data: { name: string; contentBase64: string; metadata?: Record<string, any> }) {
  return request<AssetRecord>('/assets/import-local', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function configureMcp(cfg: { command?: string; args?: string[]; url?: string }) {
  return request<{ ok: boolean; mode: string }>('/assets/mcp/configure', {
    method: 'POST',
    body: JSON.stringify(cfg),
  });
}

export async function listMcpResources() {
  return request<any[]>('/assets/mcp/resources');
}

export async function importMcpResource(uri: string, name?: string) {
  return request<AssetRecord>('/assets/mcp/import', {
    method: 'POST',
    body: JSON.stringify({ uri, name }),
  });
}
