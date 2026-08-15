// Omni Vision Tool — v5.0 Dual-Mode Multimodal Perception (backend intelligence)
//
// v5.0: the front end is UNCHANGED except the Trident-style mandatory context args.
// ALL storyline/memory/verify happens SILENTLY in the backend — the tool just
// returns better responses. The tool is NOT an agent.
//
// MODE 1 (direct) — Extract media to images, chain batch-read via tool.execute.after
//   Video → ffmpeg scene detection → keyframe PNGs → hook injects batch-read directive
//   PDF   → pdftoppm               → page PNGs   → hook injects batch-read directive
//   Image → single: read tool, multi: batch tool  → hook injects explicit tool call
//   Audio → MiMo API call (no native audio pipeline)
//   [UNCHANGED from v4]
//
// MODE 2 (api) — the v5.0 backend pipeline:
//   args gate (zod floors + named remedies) → Context Manager (storyline + context
//   chain from SQLite) → DPL1 brief (250-500 lines) → MiMo v2.5 analyzes the pixels
//   → silent consistency verify (DeepSeek V4 Flash) → write-through to SQLite
//   BEFORE return → TDB sync (async) → the clean analysis result.
//
// CHAIN MECHANISM (unchanged): tool.execute.after injects an EXPLICIT tool call
// directive (read/batch) for direct mode.

import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

// ── v5.0 backend imports ──
import { validateOmniVisionInput } from './backend/validator';
import { VisionMemory } from './backend/memory';
import { buildContext } from './backend/context-manager';
import { callVLM, callVLMMulti, type MediaType } from './backend/brain';
import { silentVerify } from './backend/silent-verify';
import { registerSidecar, touchSidecar, verifyMemoryReattach, handleSessionSwitch } from './backend/sidecar';
import { tdbSyncAnalysis } from './backend/tdb-sync';
import { LedgerWriter } from './shadow/sidecar/ledger.js';
import { QualityGate } from './shadow/sidecar/quality-gate.js';
import type { FsReadDeps } from './shadow/sidecar/types.js';
import { appendJson } from './shadow/sidecar/fs-utils.js';
import { briefHash } from './backend/brief-builder';

// ── THE WIRED FORKED MACHINERY (v5.1.0): ledger + quality gate on every api-mode analysis ──
async function emitLedgerAndGate(memory: VisionMemory, flags: string[], frameSeq: number): Promise<string> {
  const dataJsonPath = path.join(memory.sessionDir, 'analyses', 'data.json');
  try {
    // ── The tool-domain observation (the evidence line) ──
    const observation = {
      sessionId: memory.sessionKey,
      tool: 'omni_vision',
      mode: 'api',
      ok: flags.length === 0,
      flags,
      frameSeq,
      ts: new Date().toISOString(),
    };
    appendJson(path.join(memory.sessionDir, 'ledger', `obs-${frameSeq}.json`), observation);
    // ── The cumulative data.json the quality gate accepts (one event per
    //    analysis — the gate's minEvents:1 is the "an analysis landed" proof) ──
    //    ENOENT (the FIRST call — the file doesn't exist yet) means "start
    //    fresh": the file MUST be created on the first analysis or the gate
    //    fails forever (the M16 bug — the read threw, the catch swallowed,
    //    data.json was never written, the gate returned ERROR on every first
    //    call). Only the JSON.parse is allowed to fail into a fresh array.
    try {
      let events: unknown[] = [];
      try {
        const raw = fs.readFileSync(dataJsonPath, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        if (parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).events)) {
          events = (parsed as Record<string, unknown>).events as unknown[];
        }
      } catch {
        // ENOENT or a corrupt file — start fresh (never swallow the WRITE).
      }
      events.push({ seq: frameSeq, ts: new Date().toISOString(), flags });
      fs.mkdirSync(path.dirname(dataJsonPath), { recursive: true });
      fs.writeFileSync(dataJsonPath, JSON.stringify({ events }, null, 2), 'utf8');
    } catch (e) {
      console.error(`[vc-pipeline] data.json write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    // ── The forked LedgerWriter (the token accounting + the flags) ──
    const ledger = new LedgerWriter(memory.sessionDir);
    ledger.appendTokens(0);
    if (flags.length > 0) ledger.appendWarn(`flags: ${flags.join(', ')} (seq ${frameSeq})`);
  } catch (e) {
    console.error(`[vc-pipeline] ledger write failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const fsDeps: FsReadDeps = {
      read: async (path: string) => { try { return fs.readFileSync(path, 'utf8'); } catch { return null; } },
      grep: async () => [],
      stat: async (path: string) => { try { const st = fs.statSync(path); return { mtime: st.mtimeMs, size: st.size }; } catch { return null; } },
    };
    // THE REAL ACCEPTANCE: the session state file fresh + >= 1 analysis row.
    const gate = new QualityGate(fsDeps, {
      requiredFiles: [memory.sessionDir + '/state.json'],
      markers: [],
      dataJson: { path: dataJsonPath, minEvents: 1 },
    }, () => Date.now() - 120_000);
    const verdict = await gate.evaluate();
    if (verdict.verdict !== 'PASS') {
      return `ERROR: quality gate failed: ${JSON.stringify(verdict.checks ?? [])}`;
    }
    return '';
  } catch (e) {
    return `ERROR: quality gate error: ${e instanceof Error ? e.message : String(e)}`;
  }
}


const z = tool.schema;

// ── MiMo API Config (the vision step) ──
const MIMO_ENDPOINT = 'https://opencode.ai/zen/go/v1/chat/completions';
const MIMO_API_KEY = process.env.OPENCODE_API_KEY || '';

// ── Media Type Detection (unchanged) ──
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.avi', '.mov', '.mkv']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.ogg']);
const PDF_EXTS = new Set(['.pdf']);

// ── The raw-video ceiling (module scope — shared by the API path and the
//    direct path): 36MB raw ≈ 48MB base64, under the 50MB MiMo API ceiling.
//    Larger files go the keyframe route (the base64 would exceed the limit). ──
const MAX_RAW_VIDEO_BYTES = 36 * 1024 * 1024;

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
};

function detectMediaType(filePath: string): MediaType | null {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (PDF_EXTS.has(ext)) return 'pdf';
  return null;
}

function getMime(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

// ── File I/O (unchanged) ──
function encodeBase64(filePath: string): string {
  return fs.readFileSync(filePath).toString('base64');
}

/** Best-effort temp-file cleanup: logs on failure, never throws (non-fatal). */
function safeUnlink(f: string): void {
  try { fs.unlinkSync(f); } catch (e) {
    console.error(`[omni-vision] temp cleanup failed for ${f}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch { return false; }
}

// ── ffmpeg Scene-Change Keyframe Extraction (unchanged from v4) ──
function extractVideoFrames(videoPath: string, threshold: number, maxFrames: number): string[] {
  const tmpDir = path.join(os.tmpdir(), `omni-vision-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    execSync('which ffmpeg', { stdio: 'pipe', timeout: 5000 });
  } catch {
    console.error('[omni-vision] ffmpeg not found, auto-installing...');
    try {
      execSync('apt-get update -qq && apt-get install -y -qq ffmpeg', { timeout: 120000, stdio: 'pipe' });
    } catch {
      return [];
    }
  }

  const framePattern = path.join(tmpDir, 'frame-%04d.png');
  const sceneFilters = [threshold, threshold * 0.5, 0.01];
  let frames: string[] = [];

  for (const st of sceneFilters) {
    const select = `select='gt(scene\\,${st})',setpts=N/(25*TB)`;
    try {
      execSync(
        `ffmpeg -i "${videoPath}" -vf "${select}" -vsync vfr -frames:v ${maxFrames} -y "${framePattern}"`,
        { timeout: 180000, stdio: 'pipe' }
      );
      frames = fs.readdirSync(tmpDir)
        .filter((f: string) => f.startsWith('frame-') && f.endsWith('.png'))
        .sort()
        .map((f: string) => path.join(tmpDir, f));
      if (frames.length >= 3) break;
      frames.forEach((f: string) => safeUnlink(f));
    } catch { continue; }
  }

  if (frames.length < 3) {
    frames.forEach((f: string) => safeUnlink(f));
    try {
      execSync(
        `ffmpeg -i "${videoPath}" -vf "fps=1,scale='min(1280,iw)':-2" -frames:v ${maxFrames} -y "${framePattern}"`,
        { timeout: 120000, stdio: 'pipe' }
      );
      frames = fs.readdirSync(tmpDir)
        .filter((f: string) => f.startsWith('frame-') && f.endsWith('.png'))
        .sort()
        .map((f: string) => path.join(tmpDir, f));
    } catch { return []; }
  }

  return frames;
}

// ── PDF to Images via pdftoppm (unchanged from v4) ──
function convertPdfToImages(pdfPath: string, maxPages: number): string[] {
  const tmpDir = path.join(os.tmpdir(), `omni-pdf-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const prefix = path.join(tmpDir, 'page');

  try {
    execSync('which pdftoppm', { stdio: 'pipe', timeout: 5000 });
  } catch {
    try {
      execSync('apt-get update -qq && apt-get install -y -qq poppler-utils', { timeout: 60000, stdio: 'pipe' });
    } catch { return []; }
  }

  try {
    execSync(`pdftoppm -png -r 150 -l ${maxPages} "${pdfPath}" "${prefix}"`, { timeout: 60000, stdio: 'pipe' });
  } catch { return []; }

  return fs.readdirSync(tmpDir)
    .filter((f: string) => f.startsWith('page-') && f.endsWith('.png'))
    .sort((a: string, b: string) => {
      const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return na - nb;
    })
    .map((f: string) => path.join(tmpDir, f));
}

// ── Legacy MiMo direct call (audio + the multi-image fallback in direct mode) ──
async function callMiMoDirect(
  mediaType: MediaType,
  base64Data: string,
  mime: string,
  prompt: string,
  fps: number = 2,
): Promise<string> {
  let contentParts: Array<Record<string, unknown>>;

  if (mediaType === 'image') {
    contentParts = [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${base64Data}` } },
      { type: 'text', text: prompt },
    ];
  } else if (mediaType === 'video') {
    contentParts = [
      { type: 'video_url', video_url: { url: `data:${mime};base64,${base64Data}` }, fps, media_resolution: 'default' },
      { type: 'text', text: prompt },
    ];
  } else if (mediaType === 'audio') {
    const audioFormat = mime.includes('mpeg') ? 'mp3' : mime.includes('wav') ? 'wav' : mime.includes('flac') ? 'flac' : 'mp3';
    contentParts = [
      { type: 'input_audio', input_audio: { data: base64Data, format: audioFormat } },
      { type: 'text', text: prompt },
    ];
  } else {
    contentParts = [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${base64Data}` } },
      { type: 'text', text: prompt },
    ];
  }

  try {
    const response = await fetch(MIMO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MIMO_API_KEY}`,
        'User-Agent': 'opencode/1.14.43',
      },
      body: JSON.stringify({
        model: 'mimo-v2.5',
        messages: [{ role: 'user', content: contentParts }],
        max_tokens: 128000,
        temperature: 0.1,
      })});

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`MiMo API ${response.status}: ${errText.substring(0, 300)}`);
    }

    const data: unknown = await response.json();
    // P2 guard (M19 fix #3): the cast is now RUNTIME-GUARDED — a non-object
    // response or a missing choices array fails to a loud throw instead of a
    // silent undefined-content return.
    if (data === null || typeof data !== 'object') {
      throw new Error(`MiMo API malformed response: expected an object envelope`);
    }
    const choicesRaw = (data as Record<string, unknown>).choices;
    if (!Array.isArray(choicesRaw)) {
      throw new Error(`MiMo API malformed response: expected choices array`);
    }
    const choices = choicesRaw as Array<{ message?: { content?: string; reasoning_content?: string } }>;
    const msg = choices[0]?.message;
    return msg?.content || msg?.reasoning_content || '';
  } catch (e) {
    console.error(`[omni-vision] callMiMoDirect (${mediaType}) failed:`, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

// ── Parse file_path: string or string[] (unchanged) ──
function resolveFilePaths(input: string | string[]): string[] {
  if (Array.isArray(input)) return input;
  if (input.includes(',')) return input.split(',').map((s: string) => s.trim());
  return [input];
}

// ── The v5.0 api-mode backend pipeline ──
async function runBackendAnalysis(params: {
  file_path: string | string[];
  media_context: string;
  analysis_goal: string;
  output_requirements: string[];
  storyline?: string;
  art_direction?: string;
  fps?: number;
  max_pages?: number;
}): Promise<string> {
  const paths = resolveFilePaths(params.file_path);
  const mediaType = detectMediaType(paths[0]);
  if (!mediaType) return `ERROR: Unsupported format. Supported: image, video, audio, PDF.`;

  // ── The tether: session_key + project_id (attached by the hook via globals;
  //    falls back to env or a per-call default — the hook normally sets these) ──
  const g = globalThis as Record<string, unknown>;
  const sessionKey =
    (typeof g.__vc_session_key === 'string' ? g.__vc_session_key : undefined) ||
    process.env.VC_SESSION_KEY || 'default-session';
  const projectId =
    (typeof g.__vc_project_id === 'string' ? g.__vc_project_id : undefined) ||
    process.env.VC_PROJECT_ID || 'default-project';
  const parentSessionId =
    (typeof g.__vc_parent_session_id === 'string' ? g.__vc_parent_session_id : undefined) ||
    process.env.VC_PARENT_SESSION_ID || null;
  const opencodePid =
    (typeof g.__vc_opencode_pid === 'number' ? g.__vc_opencode_pid : undefined) || process.pid;

  // ── Sidecar lifecycle: register + re-attach gate ──
  registerSidecar(opencodePid, sessionKey, projectId, parentSessionId ?? undefined);
  touchSidecar(opencodePid);
  handleSessionSwitch(opencodePid, sessionKey);

  const memory = new VisionMemory(projectId, sessionKey);
  await memory.open();
  try {
    const reattach = verifyMemoryReattach(opencodePid, sessionKey, memory.sessionDir);
    if (!reattach.ok) {
      return `ERROR: ${reattach.reason}`;
    }

    // ── Context Manager: storyline + context chain + epoch (silent) ──
    const ctx = await buildContext(memory, {
      projectId,
      mediaType,
      mediaPath: paths[0],
      mediaContext: params.media_context,
      analysisGoal: params.analysis_goal,
      outputRequirements: params.output_requirements,
      storyline: params.storyline,
      artDirection: params.art_direction,
    });

    // ── THE BRIEF PERSIST (M19 — the t2-frame-id observability fix): the
    //    brief (which carries the T2 cold-start hydration's t2-{sessionKey}-{seq}
    //    prior-analysis frames) was built but never persisted — only its hash
    //    landed in the analyses row, so the exact t2- frame strings were NOT
    //    post-hoc observable. Writing the brief to {sessionDir}/briefs/
    //    brief-{seq}.md makes the full injected context (storyline, the T1
    //    chain, the t2- frames, the supremacy contract, the media context)
    //    mechanically inspectable after the fact — the honest-limit #1 is now
    //    closed. One write covers ALL five tails (they all consume ctx.brief). ──
    try {
      fs.mkdirSync(path.join(memory.sessionDir, 'briefs'), { recursive: true });
      fs.writeFileSync(
        path.join(memory.sessionDir, 'briefs', `brief-${ctx.frameSeq}.md`),
        `# BRIEF seq ${ctx.frameSeq} (${projectId}/${sessionKey})\n\n${ctx.brief}\n`,
        'utf8',
      );
    } catch (e) {
      console.error(`[vc-pipeline] brief persist failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ── PDF: pages → per-page VLM calls ──
    if (mediaType === 'pdf') {
      const pages = convertPdfToImages(paths[0], params.max_pages ?? 10);
      if (pages.length === 0) return `ERROR: PDF conversion failed.`;
      const results: string[] = [];
      for (let i = 0; i < pages.length; i++) {
        const b64 = encodeBase64(pages[i]);
        const pagePrompt = `${ctx.brief}\n\n(page ${i + 1} of ${pages.length})`;
        const r = await callVLM('image', b64, 'image/png', pagePrompt);
        if (!r.ok) return `ERROR: MiMo page ${i + 1}: ${r.error}`;
        results.push(`--- Page ${i + 1} ---\n${r.content}`);
      }
      const joined = results.join('\n\n');
      const verified = await silentVerify(memory, joined, ctx.frameSeq, ctx.storylineUsed);
      const hash = briefHash(ctx.brief);
      memory.appendAnalysis({
        frame_id: `${projectId}_${sessionKey}_${ctx.frameSeq}`,
        seq: ctx.frameSeq,
        analysis_json: verified.analysis,
        brief_hash: hash,
        brain_model: 'deepseek-v4-flash',
        vlm_model: 'mimo-v2.5',
        created_at: new Date().toISOString(),
      });
      memory.registerFrame(`${projectId}_${sessionKey}_${ctx.frameSeq}`, paths[0], 'pdf', ctx.frameSeq);
      // TDB sync — fire and forget (non-blocking). MUST fire BEFORE the gate:
      // the gate's early return would otherwise starve the T2 durable write.
      void tdbSyncAnalysis(projectId, sessionKey, verified.analysis, ctx.frameSeq);
      const gateResult = await emitLedgerAndGate(memory, verified.flags, ctx.frameSeq);
      if (gateResult) return gateResult;
      return verified.analysis;
    }

    // ── Multi-image: ONE MiMo call with all images ──
    if (paths.length > 1 && mediaType === 'image') {
      const images = paths.map((p: string) => ({ base64: encodeBase64(p), mime: getMime(p) }));
      const r = await callVLMMulti(images, ctx.brief);
      if (!r.ok) return `ERROR: MiMo multi-image: ${r.error}`;
      const verified = await silentVerify(memory, r.content, ctx.frameSeq, ctx.storylineUsed);
      const hash = briefHash(ctx.brief);
      memory.appendAnalysis({
        frame_id: `${projectId}_${sessionKey}_${ctx.frameSeq}`,
        seq: ctx.frameSeq,
        analysis_json: verified.analysis,
        brief_hash: hash,
        brain_model: 'deepseek-v4-flash',
        vlm_model: 'mimo-v2.5',
        created_at: new Date().toISOString(),
      });
      memory.registerFrame(`${projectId}_${sessionKey}_${ctx.frameSeq}`, paths.join(','), 'image', ctx.frameSeq);
      void tdbSyncAnalysis(projectId, sessionKey, verified.analysis, ctx.frameSeq);
      const gateResult = await emitLedgerAndGate(memory, verified.flags, ctx.frameSeq);
      if (gateResult) return gateResult;
      return verified.analysis;
    }

    // ── Single media: the VLM call (sequential pipeline — video is converted
    //    to base64 FIRST, then the API is called in video mode; the model
    //    natively watches the video. No ffmpeg keyframe extraction on this path. ──
    //
    // ── Large-video guard (the MiMo API spec — docs.aimlapi.com: the base64
    //    payload limit is 50MB; a raw file up to ~37.5MB encodes under it.
    //    Files whose base64 would exceed the ceiling are sent as extracted
    //    keyframe images instead — the model cannot receive their raw video. ──
    if (mediaType === 'video') {
      const size = fs.statSync(paths[0]).size;
      if (size > MAX_RAW_VIDEO_BYTES) {
        const frames = extractVideoFrames(paths[0], 0.01, 12);
        if (frames.length === 0) return `ERROR: ffmpeg extraction failed for the large video.`;
        const images = frames.map((f: string) => ({ base64: encodeBase64(f), mime: 'image/png' }));
        const r = await callVLMMulti(images, ctx.brief + `\n\n(analyzed via ${frames.length} extracted keyframes — the source video was ${(size / (1024*1024)).toFixed(1)}MB, its base64 exceeds the 50MB MiMo API ceiling so the raw video_url path was not used)`);
        if (!r.ok) return `ERROR: MiMo keyframe analysis: ${r.error}`;
        const verified = await silentVerify(memory, r.content, ctx.frameSeq, ctx.storylineUsed);
        memory.appendAnalysis({
          frame_id: `${projectId}_${sessionKey}_${ctx.frameSeq}`,
          seq: ctx.frameSeq,
          analysis_json: verified.analysis,
          brief_hash: briefHash(ctx.brief),
          brain_model: 'deepseek-v4-flash',
          vlm_model: 'mimo-v2.5',
          created_at: new Date().toISOString(),
        });
        memory.registerFrame(`${projectId}_${sessionKey}_${ctx.frameSeq}`, paths[0], 'video', ctx.frameSeq);
        void tdbSyncAnalysis(projectId, sessionKey, verified.analysis, ctx.frameSeq);
        const gateResult = await emitLedgerAndGate(memory, verified.flags, ctx.frameSeq);
        if (gateResult) return gateResult;
        return verified.analysis;
      }
    }

    const fps = params.fps ?? 2;
    const base64 = encodeBase64(paths[0]);
    const mime = getMime(paths[0]);
    const r = await callVLM(mediaType, base64, mime, ctx.brief, fps);
    // ── The 500 auto-fallback (M17): the provider's raw-video path is flaky
    //    for mid-size files (a documented 500 on ~17MB videos). Instead of
    //    returning the error (the caller would have to extract keyframes by
    //    hand), retry ONCE through the internal keyframe path — the same path
    //    the >36MB guard uses. Deterministic recovery, no caller workaround. ──
    if (!r.ok && mediaType === 'video' && typeof r.error === 'string' && /HTTP 5\d\d|Internal server error/.test(r.error)) {
      const frames = extractVideoFrames(paths[0], 0.01, 12);
      if (frames.length > 0) {
        const images = frames.map((f: string) => ({ base64: encodeBase64(f), mime: 'image/png' }));
        const size = fs.statSync(paths[0]).size;
        const r2 = await callVLMMulti(images, ctx.brief + `\n\n(analyzed via ${frames.length} extracted keyframes — the raw video_url path returned a provider 500, so the keyframe fallback was used)`);
        if (r2.ok) {
          const verified2 = await silentVerify(memory, r2.content, ctx.frameSeq, ctx.storylineUsed);
          const hash2 = briefHash(ctx.brief);
          memory.appendAnalysis({
            frame_id: `${projectId}_${sessionKey}_${ctx.frameSeq}`,
            seq: ctx.frameSeq,
            analysis_json: verified2.analysis,
            brief_hash: hash2,
            brain_model: 'deepseek-v4-flash',
            vlm_model: 'mimo-v2.5',
            created_at: new Date().toISOString(),
          });
          memory.registerFrame(`${projectId}_${sessionKey}_${ctx.frameSeq}`, paths[0], 'video', ctx.frameSeq);
          void tdbSyncAnalysis(projectId, sessionKey, verified2.analysis, ctx.frameSeq);
          const gateResult2 = await emitLedgerAndGate(memory, verified2.flags, ctx.frameSeq);
          if (gateResult2) return gateResult2;
          return verified2.analysis;
        }
      }
    }
    if (!r.ok) return `ERROR: MiMo ${mediaType}: ${r.error}`;
    const verified = await silentVerify(memory, r.content, ctx.frameSeq, ctx.storylineUsed);
    const hash = briefHash(ctx.brief);
    memory.appendAnalysis({
      frame_id: `${projectId}_${sessionKey}_${ctx.frameSeq}`,
      seq: ctx.frameSeq,
      analysis_json: verified.analysis,
      brief_hash: hash,
      brain_model: 'deepseek-v4-flash',
      vlm_model: 'mimo-v2.5',
      created_at: new Date().toISOString(),
    });
    memory.registerFrame(`${projectId}_${sessionKey}_${ctx.frameSeq}`, paths[0], mediaType, ctx.frameSeq);
    void tdbSyncAnalysis(projectId, sessionKey, verified.analysis, ctx.frameSeq);
    const gateResult = await emitLedgerAndGate(memory, verified.flags, ctx.frameSeq);
    if (gateResult) return gateResult;
    return verified.analysis;
  } finally {
    memory.close();
  }
}

// ── THE EXPORTED TOOL DEF + THE CHAIN HOOK (2026-08-15 — the trident merge
// extraction): the plugin's tool + hook are lifted to top-level consts so the
// trident's createOmniVisionTool adapter consumes them directly (the plugin
// factory's standalone shape preserved below). ──
export const omniVisionToolDef = {
        description: `Omni-vision: Process media in two modes. The front end is UNCHANGED from v4 —
the ONLY difference is the api mode now REQUIRES Trident-style context args.

MODE 1 (direct — default): Direct read into your context.
  Video → Scene-detection keyframe extraction → batch-read all frames
  PDF   → pdftoppm page conversion → batch-read all pages
  Image → single: read() directly | multi: batch(read()) all at once
  Audio → API transcription (text summary)

MODE 2 (api): the v5.0 backend pipeline — the tool silently injects the project
  storyline + prior-frame context into the analysis and returns a grounded result.
  REQUIRED ARGS (the quality gate — DP L1 floors):
    media_context MINIMUM 500+ CHARS — WHAT this media is and should contain
    analysis_goal MINIMUM 200+ CHARS — WHAT to determine or verify
    output_requirements MINIMUM 3+ ITEMS — the required output sections
  OPTIONAL: storyline (200+ chars, backend-stored after the first call),
  art_direction (100+ chars, backend-stored after the first call).
  The bare 'prompt' arg is REJECTED with a named remedy.

Params:
  file_path: Path to media file. For multiple images, pass array or comma-separated.
  mode: "direct" (default) | "api"
  scene_threshold: Scene-change sensitivity 0.01-0.9 (default 0.01).
  max_pages: Max PDF pages to convert (default 10).
  fps: Video sampling (default 2).`,

        args: {
          file_path: z.union([z.string(), z.array(z.string())]).describe(
            'Absolute path to the media file(s). For multiple images, pass an array: ["file1.png", "file2.png"]'
          ),
          mode: z.enum(['direct', 'api']).optional().describe('"direct" (default): load into context. "api": the v5.0 backend analysis pipeline'),
          // ── THE v5.0 CONTEXT ARGS (the quality gate) ──
          media_context: z.string().optional().describe('MINIMUM 500+ CHARS (api mode). WHAT this media is and should contain: the scene, the asset, the frame, the shot. The VLM grounds its analysis against this.'),
          analysis_goal: z.string().optional().describe('MINIMUM 200+ CHARS (api mode). WHAT to determine or verify — NOT "describe this". Example: "verify the HUD alignment against the design spec, identify contrast violations, confirm the sprite matches the art direction".'),
          output_requirements: z.array(z.string()).optional().describe('MINIMUM 3+ ITEMS (api mode). The mandatory output sections. Example: ["FINDINGS", "STORYLINE_ALIGNMENT", "ISSUES_BY_SEVERITY"]'),
          storyline: z.string().optional().describe('The macro storyline context (200+ chars). OPTIONAL after the first call — the backend injects the stored bible. First call for a project: strongly recommended (seeds the memory).'),
          art_direction: z.string().optional().describe('Design tokens / visual spec (100+ chars). Stored in memory after the first call; injected silently later.'),
          prompt: z.string().optional().describe('DEPRECATED/REJECTED in api mode. Use the structured context args instead. (Audio in direct mode still accepts a transcription prompt.)'),
          scene_threshold: z.number().optional().describe('Video: scene-change sensitivity 0.01-0.9 (default 0.01). Lower = more frames.'),
          max_pages: z.number().optional().describe('PDF: max pages to convert (default 10)'),
          fps: z.number().optional().describe('Video: fallback fps if scene detection fails (default 2)'),
        },

        async execute(args: {
          file_path: string | string[];
          mode?: string;
          media_context?: string;
          analysis_goal?: string;
          output_requirements?: string[];
          storyline?: string;
          art_direction?: string;
          prompt?: string;
          scene_threshold?: number;
          max_pages?: number;
          fps?: number;
        }) {
          const mode = args.mode || 'direct';
          const paths = resolveFilePaths(args.file_path);

          // Validate all files exist
          const missing = paths.filter((p: string) => !fileExists(p));
          if (missing.length > 0) {
            return `ERROR: Files not found:\n${missing.join('\n')}`;
          }

          // Detect media type from first file
          const mediaType = detectMediaType(paths[0]);
          if (!mediaType) {
            return `ERROR: Unsupported format. Supported: image, video, audio, PDF.`;
          }

          // ── MODE 2: API — the v5.0 backend pipeline ──
          if (mode === 'api') {
            // The quality gate: structured args required, bare prompt rejected
            const validation = validateOmniVisionInput({
              media_context: args.media_context,
              analysis_goal: args.analysis_goal,
              output_requirements: args.output_requirements,
              storyline: args.storyline,
              art_direction: args.art_direction,
              prompt: args.prompt,
            });
            if (!validation.valid) return validation.error;

            return runBackendAnalysis({
              file_path: args.file_path,
              // P2 guard: these casts are UPSTREAM-GUARDED — validateOmniVisionInput
              // (the S2 gate) ran at :602-634 and returns the rejection BEFORE any
              // backend call, so the floors (media_context 500+/analysis_goal
              // 200+/output_requirements 3+) are guaranteed at this point. The
              // zod schema validated the same fields; the cast narrows the
              // runtime type to the documented contract.
              media_context: args.media_context as string,
              analysis_goal: args.analysis_goal as string,
              output_requirements: args.output_requirements as string[],
              storyline: args.storyline,
              art_direction: args.art_direction,
              fps: args.fps,
              max_pages: args.max_pages,
            });
          }

          // ── MODE 1: DIRECT READ ──

          // VIDEO: THE BASE64 PRIMARY + the keyframe fallback.
          // The operator directive: the raw video must be base64-encoded so
          // the calling model can process it directly — the same native method
          // the API path uses (video_url). The runtime cannot attach a video
          // part to the model context (the read tool refuses binary files —
          // "Cannot read binary file" — and the part model has no VideoPart),
          // so the data URI is persisted to disk + referenced in the result,
          // and the extracted frames remain the deliverable the calling model
          // sees (the fallback). >36MB: the base64 would exceed the raw-video
          // ceiling — the fallback only.
          if (mediaType === 'video') {
            const threshold = args.scene_threshold ?? 0.01;
            const maxFrames = 9999;
            const frames = extractVideoFrames(paths[0], threshold, maxFrames);
            if (frames.length === 0) {
              return `ERROR: ffmpeg extraction failed. Ensure ffmpeg is installed.`;
            }
            const vSize = fs.statSync(paths[0]).size;
            let videoBase64Path: string | null = null;
            if (vSize <= MAX_RAW_VIDEO_BYTES) {
              try {
                const b64 = encodeBase64(paths[0]);
                const vmime = getMime(paths[0]);
                const uri = `data:${vmime};base64,${b64}`;
                videoBase64Path = `${paths[0]}.b64`;
                fs.writeFileSync(videoBase64Path, uri, 'utf8');
              } catch {
                videoBase64Path = null; // the frame fallback still delivers
              }
            }
            return JSON.stringify({
              status: 'success',
              mode: 'direct',
              mediaType: 'video',
              sourceFile: paths[0],
              videoBase64Path,
              frameCount: frames.length,
              frames,
            });
          }

          // PDF: pdftoppm page conversion
          if (mediaType === 'pdf') {
            const pages = convertPdfToImages(paths[0], args.max_pages ?? 10);
            if (pages.length === 0) {
              return `ERROR: PDF conversion failed. Ensure poppler-utils is installed.`;
            }
            return JSON.stringify({
              status: 'success',
              mode: 'direct',
              mediaType: 'pdf',
              sourceFile: paths[0],
              frameCount: pages.length,
              frames: pages,
            });
          }

          // IMAGE: single or batch
          if (mediaType === 'image') {
            return JSON.stringify({
              status: 'success',
              mode: 'direct',
              mediaType: 'image',
              frameCount: paths.length,
              frames: paths,
            });
          }

          // AUDIO: no native audio pipeline, API call
          if (mediaType === 'audio') {
            try {
              const base64 = encodeBase64(paths[0]);
              const mime = getMime(paths[0]);
              const audioPrompt = args.prompt || 'Transcribe and describe this audio.';
              const result = await callMiMoDirect('audio', base64, mime, audioPrompt);
              if (result && result.trim().length > 0) return result;
              return `ERROR: Audio processing returned empty result.`;
            } catch (e: unknown) {
              return `ERROR processing audio: ${e instanceof Error ? e.message : String(e)}`;
            }
          }

          return `ERROR: Unreachable code path.`;
        },
};

// ── CHAIN HOOK: tool.execute.after (UNCHANGED from v4) — the batch-read
// directive injection for the direct mode ──
export const omniVisionChainHook = async (event: any, output: any) => {
      if (event?.tool !== 'omni_vision') return;

      let result: any;
      try {
        result = JSON.parse(output.output);
      } catch {
        return;
      }

      if (result.mode !== 'direct') return;
      if (!result.frames || result.frames.length === 0) return;
      if (result.mediaType === 'audio') return;

      const count = result.frames.length;
      const label = result.mediaType === 'video' ? 'frames' : result.mediaType === 'pdf' ? 'pages' : 'images';

      if (count === 1) {
        const toolCall = `read({filePath: "${result.frames[0].replace(/"/g, '\\"')}"})`;
        output.output = JSON.stringify({
          ...result,
          directive: `CALL THIS TOOL NOW (do not respond, do not explain):\n` + toolCall,
        }, null, 2);

      } else if (count <= 25) {
        const batchCalls = result.frames.map((f: string) =>
          `{tool: "read", parameters: {filePath: "${f.replace(/"/g, '\\"')}"}}`
        );
        const batchCall = `batch({tool_calls: [\n  ${batchCalls.join(',\n  ')}\n]})`;
        output.output = JSON.stringify({
          ...result,
          directive: `CALL THIS TOOL NOW (do not respond, do not explain):\n` + batchCall,
        }, null, 2);

      } else {
        const chunks: string[][] = [];
        for (let i = 0; i < result.frames.length; i += 25) {
          chunks.push(result.frames.slice(i, i + 25));
        }
        const batchDirectives = chunks.map((chunk, idx) => {
          const calls = chunk.map((f: string) =>
            `{tool: "read", parameters: {filePath: "${f.replace(/"/g, '\\"')}"}}`
          );
          return `Batch ${idx + 1}/${chunks.length}: batch({tool_calls: [\n  ${calls.join(',\n  ')}\n]})`;
        });
        output.output = JSON.stringify({
          ...result,
          directive: `CALL THESE TOOLS SEQUENTIALLY (do not respond, do not explain between them):\n\n` +
                     batchDirectives.join('\n\n'),
        }, null, 2);
      }
};

// ── THE PLUGIN ENTRY (the standalone shape preserved — the exported consts
// are what the trident adapter consumes) ──
const plugin: Plugin = async (input: PluginInput) => {
  console.error('[omni-vision] plugin loaded (v5.1.4 — the trident-wired backend intelligence)');
  return {
    tool: { omni_vision: omniVisionToolDef },
    'tool.execute.after': omniVisionChainHook,
  } as any;
};

export default plugin;
