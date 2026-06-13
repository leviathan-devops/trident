import * as path from 'path';
import * as fs from 'fs/promises';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

async function resolveSecurePath(filePath: string, workspaceRoot: string): Promise<string> {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('resolveSecurePath: filePath is required');
  }
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    throw new Error('resolveSecurePath: workspaceRoot is required');
  }

  const resolvedInput = path.resolve(filePath);

  // Resolve workspaceRoot via fs.realpath() first (R14 TOCTOU fix).
  // Using path.resolve() alone can be tricked if workspaceRoot is a symlink.
  // By resolving root to its canonical path first, we establish a verified
  // baseline before processing any user-controlled path.
  let resolvedRoot: string;
  try {
    resolvedRoot = await fs.realpath(path.resolve(workspaceRoot));
  } catch (err: unknown) {
    console.error('[path-containment] Failed to resolve workspace root:', err instanceof Error ? err.message : String(err));
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot resolve real path for workspace root ${workspaceRoot}: ${message}`);
  }

  let realPath: string;
  try {
    await fs.access(resolvedInput);
    realPath = await fs.realpath(resolvedInput);
  } catch (err: unknown) {
    console.error('[path-containment] Failed to resolve input path:', err instanceof Error ? err.message : String(err));
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot resolve real path for ${resolvedInput}: ${message}`);
  }

  const normalizedRoot = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  if (!realPath.startsWith(normalizedRoot) && realPath !== resolvedRoot) {
    throw new Error(
      `Path traversal blocked: ${realPath} is outside workspace ${resolvedRoot}`
    );
  }

  const ext = path.extname(realPath).toLowerCase();
  const expectedMime = EXTENSION_TO_MIME[ext];
  if (!expectedMime || !ALLOWED_MIME_TYPES.has(expectedMime)) {
    throw new Error(
      `Invalid file type: ${ext || '(no extension)'}. Only image files are allowed: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`
    );
  }

  return realPath;
}

export { resolveSecurePath, EXTENSION_TO_MIME };
