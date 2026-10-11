/**
 * Omneon scene history: branches, revisions, conversations, messages.
 * Application-level Git semantics in SQLite — full SceneDocument snapshots,
 * automatic forks when editing an older revision, branch promotion.
 */
import prisma from '../lib/db.js';

const MAX_RETRIES = 3;
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 100));
      else throw error;
    }
  }
  throw new Error('Unreachable');
}

/* ------------------------------- Branches ------------------------------- */

export async function getOrCreateMainBranch(artifactId: string) {
  return withRetry(async () => {
    let branch = await prisma.sceneBranch.findFirst({
      where: { artifactId, name: 'main' },
    });
    if (!branch) {
      branch = await prisma.sceneBranch.create({
        data: { artifactId, name: 'main', parentRevisionId: null },
      });
    }
    return branch;
  });
}

export async function listBranches(artifactId: string) {
  return withRetry(() =>
    prisma.sceneBranch.findMany({
      where: { artifactId },
      orderBy: { createdAt: 'asc' },
      include: {
        revisions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })
  );
}

/** Create a branch forked at a given revision. */
export async function createBranch(artifactId: string, name: string, parentRevisionId: string | null) {
  return withRetry(async () => {
    const existing = await prisma.sceneBranch.findFirst({ where: { artifactId, name } });
    const finalName = existing ? `${name}-${Date.now().toString(36)}` : name;
    return prisma.sceneBranch.create({
      data: { artifactId, name: finalName, parentRevisionId },
    });
  });
}

/* ------------------------------- Revisions ------------------------------ */

export async function getHeadRevision(branchId: string) {
  return withRetry(() =>
    prisma.sceneRevision.findFirst({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
    })
  );
}

export async function createRevision(data: {
  artifactId: string;
  branchId: string;
  document: string;
  source: string;
  prompt?: string | null;
  operations?: string | null;
  selection?: string | null;
  model?: string | null;
}) {
  return withRetry(() => prisma.sceneRevision.create({ data }));
}

export async function getRevision(id: string) {
  return withRetry(() => prisma.sceneRevision.findUnique({ where: { id } }));
}

export async function listRevisions(artifactId: string, branchId?: string) {
  return withRetry(() =>
    prisma.sceneRevision.findMany({
      where: { artifactId, ...(branchId ? { branchId } : {}) },
      orderBy: { createdAt: 'asc' },
    })
  );
}

/* ----------------------------- Conversations ---------------------------- */

export async function getOrCreateConversation(artifactId: string, branchId: string | null) {
  return withRetry(async () => {
    let convo = await prisma.conversation.findFirst({
      where: { artifactId, branchId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!convo) {
      convo = await prisma.conversation.create({
        data: { artifactId, branchId },
        include: { messages: true },
      });
    }
    return convo;
  });
}

export async function addMessage(data: {
  conversationId: string;
  role: string;
  text: string;
  operations?: string | null;
  explanation?: string | null;
  beforeRevisionId?: string | null;
  afterRevisionId?: string | null;
  status?: string;
  model?: string | null;
}) {
  return withRetry(async () => {
    const msg = await prisma.message.create({ data });
    await prisma.conversation.update({
      where: { id: data.conversationId },
      data: { updatedAt: new Date() },
    });
    return msg;
  });
}

export async function updateMessage(id: string, data: {
  operations?: string | null;
  explanation?: string | null;
  beforeRevisionId?: string | null;
  afterRevisionId?: string | null;
  status?: string;
}) {
  return withRetry(() => prisma.message.update({ where: { id }, data }));
}

/* --------------------------- Branch operations -------------------------- */

/**
 * "Use this version": copy the target revision's document onto a new head
 * revision on the active branch.
 */
export async function promoteRevision(revisionId: string, toBranchId: string, prompt: string) {
  return withRetry(async () => {
    const rev = await prisma.sceneRevision.findUnique({ where: { id: revisionId } });
    if (!rev) throw new Error('Revision not found');
    return prisma.sceneRevision.create({
      data: {
        artifactId: rev.artifactId,
        branchId: toBranchId,
        document: rev.document,
        source: 'promote',
        prompt,
      },
    });
  });
}
