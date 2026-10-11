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

export async function getAllProjects() {
  return withRetry(() =>
    prisma.project.findMany({
      where: { status: { not: 'deleted' } },
      orderBy: { lastActiveAt: 'desc' },
      include: { _count: { select: { artifacts: true } } },
    })
  );
}

export async function getProject(id: string) {
  return withRetry(() =>
    prisma.project.findUnique({
      where: { id },
      include: {
        artifacts: {
          where: { status: { not: 'discarded' } },
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { revisions: true } } },
        },
      },
    })
  );
}

export async function createProject(data: {
  name: string;
  prompt?: string;
  mode?: string;
  creationMode?: string;
  settings?: string;
}) {
  return withRetry(() =>
    prisma.project.create({ data })
  );
}

export async function updateProject(id: string, data: {
  name?: string;
  prompt?: string;
  mode?: string;
  creationMode?: string;
  settings?: string;
  status?: string;
}) {
  return withRetry(() =>
    prisma.project.update({
      where: { id },
      data: { ...data, lastActiveAt: new Date() },
    })
  );
}

export async function deleteProject(id: string) {
  return withRetry(() =>
    prisma.project.update({
      where: { id },
      data: { status: 'deleted' },
    })
  );
}

export async function touchProject(id: string) {
  return withRetry(() =>
    prisma.project.update({
      where: { id },
      data: { lastActiveAt: new Date() },
    })
  );
}

export async function getOrCreateUserEditsProject() {
  return withRetry(async () => {
    const existing = await prisma.project.findFirst({
      where: { mode: 'user-edits', status: { not: 'deleted' } },
      include: {
        artifacts: {
          where: { status: { not: 'discarded' } },
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { revisions: true } } },
        },
      },
    });
    if (existing) return existing;
    return prisma.project.create({
      data: { name: 'User Edits', mode: 'user-edits' },
      include: {
        artifacts: {
          where: { status: { not: 'discarded' } },
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { revisions: true } } },
        },
      },
    });
  });
}
