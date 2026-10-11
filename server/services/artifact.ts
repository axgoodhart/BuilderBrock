import prisma from '../lib/db.js';

const MAX_RETRIES = 3;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 100));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Unreachable');
}

export async function getArtifact(id: string) {
  return withRetry(() =>
    prisma.artifact.findUnique({
      where: { id },
      include: {
        revisions: { orderBy: { createdAt: 'asc' } },
      },
    })
  );
}

export async function getArtifactsByProject(projectId: string, includeDiscarded = false) {
  return withRetry(() =>
    prisma.artifact.findMany({
      where: {
        projectId,
        ...(includeDiscarded ? {} : { status: { not: 'discarded' } }),
      },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { revisions: true } } },
    })
  );
}

export async function createArtifact(data: {
  projectId: string;
  html: string;
  model: string;
  temperature?: number;
  variantIndex?: number;
  variantLabel?: string;
  status?: string;
  prompt?: string;
  imageRef?: string;
  errorMessage?: string | null;
}) {
  // Touch the parent project
  await prisma.project.update({
    where: { id: data.projectId },
    data: { lastActiveAt: new Date() },
  });

  return withRetry(() =>
    prisma.artifact.create({ data })
  );
}

export async function updateArtifact(id: string, data: {
  html?: string;
  status?: string;
  model?: string;
  errorMessage?: string | null;
}) {
  return withRetry(() =>
    prisma.artifact.update({ where: { id }, data })
  );
}

// Generation runs in the browser; any row still "streaming" when a client loads lost its stream.
export async function markInterrupted() {
  return withRetry(() =>
    prisma.artifact.updateMany({
      where: { status: 'streaming' },
      data: {
        status: 'interrupted',
        errorMessage: JSON.stringify({
          issue: {
            kind: 'interrupted',
            message: 'The page was reloaded or closed while this was generating.',
            model: '',
            at: Date.now(),
          },
        }),
      },
    })
  );
}

export async function discardArtifact(id: string) {
  return withRetry(() =>
    prisma.artifact.update({
      where: { id },
      data: { status: 'discarded' },
    })
  );
}

export async function restoreArtifact(id: string) {
  return withRetry(() =>
    prisma.artifact.update({
      where: { id },
      data: { status: 'complete' },
    })
  );
}

export async function createRevision(data: {
  artifactId: string;
  html: string;
  prompt: string;
  model?: string;
  selection?: string;
  diff?: string;
}) {
  return withRetry(() =>
    prisma.revision.create({ data })
  );
}

export async function getRevisions(artifactId: string) {
  return withRetry(() =>
    prisma.revision.findMany({
      where: { artifactId },
      orderBy: { createdAt: 'asc' },
    })
  );
}
