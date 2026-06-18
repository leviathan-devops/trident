import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveSecurePath, EXTENSION_TO_MIME } from '../security/path-containment.js';
import { TRIDENT_CONFIG } from '../config.js';

/**
 * TRIDENT VISION v2 — EXACT REPLICA OF SHARK-VISION
 *
 * Uses GLM-4.6V-Flash-Q4_K_M via llama-server HTTP API (OpenAI-compatible).
 * The VLM runs on a dedicated llama-server at localhost:8082.
 *
 * Architecture:
 * 1. Read image file from disk
 * 2. Base64-encode the image
 * 3. Send to llama-server /v1/chat/completions with image_url + text prompt
 * 4. Return the model's analysis text
 *
 * VLM configuration is sourced from TRIDENT_CONFIG (config.ts), which reads
 * TRIDENT_VLM_HOST and TRIDENT_VLM_MODEL environment variables with defaults.
 */

const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
const VLM_BASE_URL = TRIDENT_CONFIG.vlmBaseUrl.replace(/\/+$/, '');
const VLM_MODEL = TRIDENT_CONFIG.vlmModel;

export const tridentVisionTool = tool({
  description: 'Analyze images using GLM-4.6V-Flash VLM. Returns detailed description of image content, text, UI elements, errors, and context. Same engine as shark-vision.',
  args: {
    action: z.enum(['analyze', 'status']).default('analyze').describe('analyze=run VLM on image, status=check VLM server health'),
    image: z.string().describe('Absolute path to the image file to analyze'),
    prompt: z.string().optional().describe('Custom analysis prompt (optional)'),
    max_tokens: z.number().default(1024).describe('Maximum tokens in response'),
    temperature: z.number().default(0.1).describe('Sampling temperature (0.0-1.0)'),
  },
  execute: async (args) => {
    // --- STATUS CHECK ---
    if (args.action === 'status') {
      try {
        const resp = await fetch(`${VLM_BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
        if (resp.ok) {
          return JSON.stringify({
            available: true,
            server: VLM_BASE_URL,
            model: VLM_MODEL,
            status: 'READY',
          }, null, 2);
        }
      } catch (e: unknown) {
        console.error('[trident-vision] Status check failed:', e instanceof Error ? e.message : String(e));
      }
      return JSON.stringify({
        available: false,
        server: VLM_BASE_URL,
        status: 'VLM_SERVER_UNREACHABLE',
        tip: 'Cannot reach VLM server. Ensure llama-server is running. Configure via TRIDENT_VLM_HOST env or TRIDENT_CONFIG.vlmBaseUrl.',
      }, null, 2);
    }

    // --- ANALYZE ---
    const imagePath = args.image || '';
    if (!imagePath) {
      return JSON.stringify({ error: 'image path required for analyze action' }, null, 2);
    }

    let resolved: string;
    try {
      const workspaceRoot = process.cwd();
      resolved = await resolveSecurePath(imagePath, workspaceRoot);
    } catch (err: unknown) {
      console.error('[trident-vision] Path validation failed:', err instanceof Error ? err.message : String(err));
      return JSON.stringify({ error: 'Path validation failed', message: err instanceof Error ? err.message : String(err), path: imagePath }, null, 2);
    }
    try {

      const stat = await fs.stat(resolved);
      if (!stat.isFile()) {
        return JSON.stringify({ error: 'Path is not a file', path: resolved }, null, 2);
      }

      if (stat.size > 20 * 1024 * 1024) {
        return JSON.stringify({ error: 'File too large (max 20MB)', sizeBytes: stat.size }, null, 2);
      }

      const ext = path.extname(resolved).toLowerCase();
      const mimeType = EXTENSION_TO_MIME[ext] || 'image/png';

      const CHUNK_THRESHOLD = 5 * 1024 * 1024;
      let base64: string;

      if (stat.size > CHUNK_THRESHOLD) {
        const chunks: Buffer[] = [];
        const readBuffer = Buffer.alloc(1024 * 1024);
        let handle: fs.FileHandle | null = null;
        try {
          handle = await fs.open(resolved, 'r');
          let bytesRead: number;
          do {
            const result = await handle.read(readBuffer, 0, readBuffer.length, null);
            bytesRead = result.bytesRead;
            if (bytesRead > 0) {
              chunks.push(Buffer.from(readBuffer.subarray(0, bytesRead)));
            }
          } while (bytesRead > 0);
        } finally {
          if (handle) await handle.close();
        }
        base64 = Buffer.concat(chunks).toString('base64');
      } else {
        const buffer = await fs.readFile(resolved);
        base64 = buffer.toString('base64');
      }

      const analysisPrompt = args.prompt || 'Describe this image in detail including any text, errors, UI elements, and context';

      // Call llama-server API (OpenAI-compatible chat completions)
      const payload = {
        model: VLM_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
              { type: 'text', text: analysisPrompt },
            ],
          },
        ],
        max_tokens: args.max_tokens || 1024,
        temperature: args.temperature || 0.1,
      };

      const response = await fetch(`${VLM_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return JSON.stringify({
          error: 'VLM server error',
          statusCode: response.status,
          message: errorText.substring(0, 500),
          server: VLM_BASE_URL,
        }, null, 2);
      }

      const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; model?: string; usage?: unknown };
      const content = result?.choices?.[0]?.message?.content || 'No response from VLM';

      return JSON.stringify({
        success: true,
        path: resolved,
        sizeKB: (stat.size / 1024).toFixed(1),
        content: content.trim(),
        model: result?.model || VLM_MODEL,
        usage: result?.usage || null,
        server: VLM_BASE_URL,
      }, null, 2);

    } catch (err: unknown) {
      console.error('[trident-vision] Vision analysis failed:', err instanceof Error ? err.message : String(err));
      // Log error details for debugging
      const errorMessage = (err instanceof Error ? err.message : String(err));
      let errorType = 'VLM_ANALYSIS_FAILED';

      if (errorMessage.includes('AbortError') || errorMessage.includes('timeout')) {
        errorType = 'VLM_TIMEOUT';
      } else if (errorMessage.includes('fetch')) {
        errorType = 'VLM_CONNECTION_FAILED';
      }

      return JSON.stringify({
        error: 'Vision analysis failed',
        errorType,
        message: errorMessage,
        server: VLM_BASE_URL,
        tip: errorType === 'VLM_CONNECTION_FAILED'
          ? `Cannot reach llama-server at ${VLM_BASE_URL}. Ensure it's running. Configure via TRIDENT_VLM_HOST env or TRIDENT_CONFIG.vlmBaseUrl.`
          : undefined,
      }, null, 2);
    }
  },
});
