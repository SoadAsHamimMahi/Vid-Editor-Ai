/**
 * Unit Tests for ColabVideoService
 * ============================================================
 * Groups:
 *  1. URL Management
 *  2. testConnection
 *  3. buildWorkflow - LTX-Video
 *  4. buildWorkflow - Wan 2.1
 *  5. generateVideo - Happy Path & Progress
 *  6. generateVideo - Error Cases
 *  7. cancelJob
 *  8. Edge Cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────────
// Module mocks – must be before any imports of mocked modules
// NOTE: vi.mock factories are hoisted; no top-level vars allowed inside them.
// ──────────────────────────────────────────────────────────────

vi.mock('fs-extra', () => {
  // Create shared vi.fn() instances so both named exports and
  // the default object point to the SAME mock functions.
  // The service uses `import fs from 'fs-extra'` (default), so
  // updating the named export MUST also update the default object.
  const existsSync = vi.fn().mockReturnValue(true);
  const readFileSync = vi.fn().mockReturnValue('');
  const readFile = vi.fn().mockResolvedValue(Buffer.from('fake-image-bytes'));
  const ensureDir = vi.fn().mockResolvedValue(undefined);
  const writeFile = vi.fn().mockResolvedValue(undefined);
  const mod = { existsSync, readFileSync, readFile, ensureDir, writeFile };
  return { ...mod, default: mod };
});

vi.mock('ws', () => {
  // Must use a real class/function — arrow functions can't be `new`-ed
  class MockWebSocket {
    on = vi.fn();
    close = vi.fn();
  }
  return { WebSocket: MockWebSocket, default: MockWebSocket };
});

// Static imports AFTER vi.mock calls
import * as fsExtra from 'fs-extra';
import { ColabVideoService } from '../colabVideoService.js';

// ──────────────────────────────────────────────────────────────
// Reset mocks before each test
// ──────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset the shared vi.fn() – updates both named and default exports
  vi.mocked(fsExtra.existsSync).mockReturnValue(true);
  vi.mocked(fsExtra.readFileSync).mockReturnValue('' as any);
});

// ──────────────────────────────────────────────────────────────
// Fetch response helpers
// ──────────────────────────────────────────────────────────────

function okJson(json: any) {
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(json),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  });
}

function errResponse(status: number) {
  return Promise.resolve({
    ok: false, status,
    json: () => Promise.resolve({}),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  });
}

/**
 * Builds a standard fetch mock for a full successful generation flow.
 */
function buildFetch({ promptId = 'test-pid', historyNode = '9', wanVae = false } = {}) {
  return vi.fn().mockImplementation((url: string, opts?: any) => {
    if (url.includes('/upload/image'))
      return okJson({ name: 'upload.png' });
    if (url.includes('/object_info/CLIPLoader'))
      return okJson({ CLIPLoader: { input: { required: { clip_name: [['clip/t5xxl_fp8_e4m3fn.safetensors']] } } } });
    if (url.includes('/object_info/VAELoader'))
      return okJson({ VAELoader: { input: { required: { vae_name: wanVae ? ['Wan2_1_VAE_fp8.safetensors'] : [] } } } });
    if (url.includes('/prompt') && opts?.method === 'POST')
      return okJson({ prompt_id: promptId });
    if (url.includes('/queue'))
      return okJson({ queue_running: [] });
    if (url.includes('/history/' + promptId))
      return okJson({ [promptId]: { outputs: { [historyNode]: { videos: [{ filename: 'out.mp4' }] } } } });
    if (url.includes('/view'))
      return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)) });
    return okJson({});
  });
}

/**
 * Builds a fetch mock that also captures the dispatched ComfyUI workflow.
 */
function buildFetchCapture({ promptId = 'pid', historyNode = '9', wanVae = false } = {}) {
  let captured: any = null;
  const fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
    if (url.includes('/upload/image')) return okJson({ name: 'img.png' });
    if (url.includes('/object_info/CLIPLoader')) return okJson({ CLIPLoader: { input: { required: { clip_name: [[]] } } } });
    if (url.includes('/object_info/VAELoader')) return okJson({ VAELoader: { input: { required: { vae_name: wanVae ? ['Wan2_1_VAE_fp8.safetensors'] : [] } } } });
    if (url.includes('/prompt') && opts?.method === 'POST') {
      captured = JSON.parse(opts.body).prompt;
      return okJson({ prompt_id: promptId });
    }
    if (url.includes('/queue')) return okJson({ queue_running: [] });
    if (url.includes('/history/' + promptId))
      return okJson({ [promptId]: { outputs: { [historyNode]: { videos: [{ filename: 'out.mp4' }] } } } });
    if (url.includes('/view')) return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
    return okJson({});
  });
  return { fetch, getWorkflow: () => captured };
}

function makeService(url = 'https://fake-tunnel.trycloudflare.com') {
  const svc = new ColabVideoService();
  svc.setTunnelUrl(url);
  return svc;
}

// ══════════════════════════════════════════════════════════════
//  1. URL Management
// ══════════════════════════════════════════════════════════════

describe('URL Management', () => {
  it('strips single trailing slash', () => {
    const svc = new ColabVideoService();
    svc.setTunnelUrl('https://my-tunnel.trycloudflare.com/');
    expect(svc.getTunnelUrl()).toBe('https://my-tunnel.trycloudflare.com');
  });

  it('strips multiple trailing slashes', () => {
    const svc = new ColabVideoService();
    svc.setTunnelUrl('https://my-tunnel.trycloudflare.com///');
    expect(svc.getTunnelUrl()).toBe('https://my-tunnel.trycloudflare.com');
  });

  it('returns empty string when no URL is set and no tunnel file exists', () => {
    vi.mocked(fsExtra.existsSync).mockReturnValue(false);
    const svc = new ColabVideoService();
    expect(svc.getTunnelUrl()).toBe('');
  });

  it('auto-detects tunnel URL from projects_data/current_tunnel.txt', () => {
    vi.mocked(fsExtra.existsSync).mockImplementation((p: any) =>
      String(p).includes('current_tunnel.txt')
    );
    vi.mocked(fsExtra.readFileSync).mockReturnValue('https://detected-tunnel.trycloudflare.com' as any);
    const svc = new ColabVideoService();
    expect(svc.getTunnelUrl()).toBe('https://detected-tunnel.trycloudflare.com');
  });
});

// ══════════════════════════════════════════════════════════════
//  2. testConnection
// ══════════════════════════════════════════════════════════════

describe('testConnection', () => {
  it('returns connected=true with GPU info on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({
        devices: [{ name: 'Tesla T4', vram_total: 15 * 1024 ** 3, vram_free: 10 * 1024 ** 3 }],
      }),
    });
    const r = await makeService().testConnection();
    expect(r.connected).toBe(true);
    expect(r.gpuName).toBe('Tesla T4');
    expect(r.vramTotalGb).toBe(15);
    expect(r.vramFreeGb).toBe(10);
  });

  it('returns connected=false on HTTP 503', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) });
    const r = await makeService().testConnection();
    expect(r.connected).toBe(false);
    expect(r.error).toMatch(/503/);
  });

  it('returns connected=false on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const r = await makeService().testConnection();
    expect(r.connected).toBe(false);
    expect(r.error).toMatch(/ECONNREFUSED/);
  });

  it('returns connected=false with "No Tunnel URL" when URL is empty', async () => {
    vi.mocked(fsExtra.existsSync).mockReturnValue(false);
    const svc = new ColabVideoService();
    const r = await svc.testConnection();
    expect(r.connected).toBe(false);
    expect(r.error).toBe('No Tunnel URL provided');
  });

  it('accepts a custom URL argument and stores it', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ devices: [] }) });
    vi.mocked(fsExtra.existsSync).mockReturnValue(false);
    const svc = new ColabVideoService();
    const r = await svc.testConnection('https://custom.trycloudflare.com');
    expect(r.connected).toBe(true);
    expect(r.url).toBe('https://custom.trycloudflare.com');
    expect(svc.getTunnelUrl()).toBe('https://custom.trycloudflare.com');
  });
});

// ══════════════════════════════════════════════════════════════
//  3. buildWorkflow - LTX-Video
// ══════════════════════════════════════════════════════════════

describe('buildWorkflow - LTX-Video', () => {
  async function captureWorkflow(motionIntensity = 5, pid = 'ltx-pid') {
    const { fetch, getWorkflow } = buildFetchCapture({ promptId: pid });
    global.fetch = fetch;
    const svc = makeService();
    svc.setProgressCallback(() => {});
    await svc.generateVideo({ sceneId: 's1', imagePath: '/fake/img.png', prompt: 'test', engine: 'ltx-video', motionIntensity });
    return Object.values(getWorkflow() as Record<string, any>);
  }

  it('contains LTXVImgToVideo node with 49 frames', async () => {
    const nodes = await captureWorkflow();
    const ltx = nodes.find((n: any) => n.class_type === 'LTXVImgToVideo');
    expect(ltx).toBeDefined();
    expect(ltx.inputs.length).toBe(49);
  });

  it('strength stays within [0.40, 0.85] for all intensity levels', async () => {
    for (const mi of [1, 5, 10]) {
      const nodes = await captureWorkflow(mi, 'pid-' + mi);
      const ltx = nodes.find((n: any) => n.class_type === 'LTXVImgToVideo');
      expect(ltx.inputs.strength).toBeGreaterThanOrEqual(0.40);
      expect(ltx.inputs.strength).toBeLessThanOrEqual(0.85);
    }
  }, 20000);

  it('higher motionIntensity produces lower strength (more motion)', async () => {
    const n1 = await captureWorkflow(1, 'pid-mi1');
    const n10 = await captureWorkflow(10, 'pid-mi10');
    const s1 = n1.find((n: any) => n.class_type === 'LTXVImgToVideo').inputs.strength;
    const s10 = n10.find((n: any) => n.class_type === 'LTXVImgToVideo').inputs.strength;
    expect(s1).toBeGreaterThan(s10);
  }, 20000);

  it('default motionIntensity=5 gives strength ~0.75', async () => {
    const nodes = await captureWorkflow(5, 'pid-def');
    const s = nodes.find((n: any) => n.class_type === 'LTXVImgToVideo').inputs.strength;
    expect(s).toBeCloseTo(0.75, 2);
  });

  it('VHS_VideoCombine outputs h264-mp4 with save_output=true', async () => {
    const nodes = await captureWorkflow();
    const vhs = nodes.find((n: any) => n.class_type === 'VHS_VideoCombine');
    expect(vhs).toBeDefined();
    expect(vhs.inputs.format).toBe('video/h264-mp4');
    expect(vhs.inputs.save_output).toBe(true);
  });

  it('CLIPLoader type is "ltxv"', async () => {
    const nodes = await captureWorkflow();
    const clip = nodes.find((n: any) => n.class_type === 'CLIPLoader');
    expect(clip?.inputs?.type).toBe('ltxv');
  });

  it('KSampler uses 25 steps', async () => {
    const nodes = await captureWorkflow();
    const sampler = nodes.find((n: any) => n.class_type === 'KSampler');
    expect(sampler.inputs.steps).toBe(25);
  });
});

// ══════════════════════════════════════════════════════════════
//  4. buildWorkflow - Wan 2.1
// ══════════════════════════════════════════════════════════════

describe('buildWorkflow - Wan 2.1', () => {
  async function captureWanWorkflow(pid = 'wan-pid', vaeList: string[] = ['Wan2_1_VAE_fp8.safetensors']) {
    let captured: any = null;
    global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (url.includes('/upload/image')) return okJson({ name: 'img.png' });
      if (url.includes('/object_info/CheckpointLoaderSimple'))
        return okJson({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [['wan2.1_i2v_1.3B_fp8.safetensors']] } } } });
      if (url.includes('/object_info/CLIPLoader'))
        return okJson({ CLIPLoader: { input: { required: { clip_name: [['umt5_xxl_fp8_e4m3fn.safetensors']] } } } });
      if (url.includes('/object_info/VAELoader'))
        return okJson({ VAELoader: { input: { required: { vae_name: [vaeList] } } } });
      if (url.includes('/prompt') && opts?.method === 'POST') {
        captured = JSON.parse(opts.body).prompt;
        return okJson({ prompt_id: pid });
      }
      if (url.includes('/queue')) return okJson({ queue_running: [] });
      if (url.includes('/history/' + pid)) return okJson({ [pid]: { outputs: { '10': { videos: [{ filename: 'ColabWan.mp4' }] } } } });
      if (url.includes('/view')) return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
      return okJson({});
    });
    const svc = makeService();
    svc.setProgressCallback(() => {});
    await svc.generateVideo({ sceneId: 'wan', imagePath: '/fake/img.png', prompt: 'test', engine: 'wan2.1', motionIntensity: 5 });
    return Object.values(captured as Record<string, any>);
  }

  it('CheckpointLoaderSimple uses wan2.1 model filename', async () => {
    const nodes = await captureWanWorkflow();
    const ckpt = nodes.find((n: any) => n.class_type === 'CheckpointLoaderSimple');
    expect(ckpt).toBeDefined();
    expect(ckpt.inputs.ckpt_name).toMatch(/wan2\.1/i);
  });

  it('includes separate VAELoader node', async () => {
    const nodes = await captureWanWorkflow();
    const vae = nodes.find((n: any) => n.class_type === 'VAELoader');
    expect(vae).toBeDefined();
    expect(vae.inputs.vae_name).toMatch(/wan/i);
  });

  it('falls back to LTX-Video when Wan VAE is absent', async () => {
    let fallbackCaptured: any = null;
    const pid = 'fallback-pid';
    global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (url.includes('/upload/image')) return okJson({ name: 'img.png' });
      if (url.includes('/object_info/CLIPLoader')) return okJson({ CLIPLoader: { input: { required: { clip_name: [[]] } } } });
      if (url.includes('/object_info/VAELoader')) return okJson({ VAELoader: { input: { required: { vae_name: [[]] } } } });
      if (url.includes('/prompt') && opts?.method === 'POST') {
        fallbackCaptured = JSON.parse(opts.body).prompt;
        return okJson({ prompt_id: pid });
      }
      if (url.includes('/queue')) return okJson({ queue_running: [] });
      if (url.includes('/history/' + pid)) return okJson({ [pid]: { outputs: { '9': { videos: [{ filename: 'ltx_out.mp4' }] } } } });
      if (url.includes('/view')) return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
      return okJson({});
    });
    const svc = makeService();
    svc.setProgressCallback(() => {});
    await svc.generateVideo({ sceneId: 'fb', imagePath: '/fake/img.png', prompt: 'test', engine: 'wan2.1' });
    const nodes = Object.values(fallbackCaptured as Record<string, any>);
    expect(nodes.some((n: any) => n.class_type === 'LTXVImgToVideo')).toBe(true);
    expect(nodes.some((n: any) => n.class_type === 'VAELoader')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
//  5. generateVideo - Happy Path & Progress
// ══════════════════════════════════════════════════════════════

describe('generateVideo - Happy Path', () => {
  it('returns a path ending in .mp4', async () => {
    global.fetch = buildFetch();
    const result = await makeService().generateVideo({ sceneId: 'happy', imagePath: '/fake/img.png', prompt: 'test', engine: 'ltx-video' });
    expect(result).toMatch(/\.mp4$/);
  });

  it('first progress status is "uploading"', async () => {
    global.fetch = buildFetch();
    const svc = makeService();
    const statuses: string[] = [];
    svc.setProgressCallback(p => statuses.push(p.status));
    await svc.generateVideo({ sceneId: 'seq', imagePath: '/fake/img.png', prompt: 'test', engine: 'ltx-video' });
    expect(statuses[0]).toBe('uploading');
  });

  it('last progress status is "ready"', async () => {
    global.fetch = buildFetch({ promptId: 'ready-pid' });
    const svc = makeService();
    const statuses: string[] = [];
    svc.setProgressCallback(p => statuses.push(p.status));
    await svc.generateVideo({ sceneId: 'seq2', imagePath: '/fake/img.png', prompt: 'test', engine: 'ltx-video' });
    expect(statuses[statuses.length - 1]).toBe('ready');
  });

  it('all progress percentages are between 0 and 100', async () => {
    global.fetch = buildFetch({ promptId: 'pct-pid' });
    const svc = makeService();
    const pcts: number[] = [];
    svc.setProgressCallback(p => pcts.push(p.progressPercent));
    await svc.generateVideo({ sceneId: 'pct', imagePath: '/fake/img.png', prompt: 'test', engine: 'ltx-video' });
    for (const p of pcts) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it('does not crash without a registered progress callback', async () => {
    global.fetch = buildFetch({ promptId: 'nocb-pid' });
    const svc = makeService();
    await expect(
      svc.generateVideo({ sceneId: 'nocb', imagePath: '/fake/img.png', prompt: 'test', engine: 'ltx-video' })
    ).resolves.toMatch(/\.mp4$/);
  });

  it('every progress event carries the correct sceneId', async () => {
    global.fetch = buildFetch({ promptId: 'sid-pid' });
    const svc = makeService();
    const events: any[] = [];
    svc.setProgressCallback(p => events.push(p));
    await svc.generateVideo({ sceneId: 'my-unique-scene', imagePath: '/fake/img.png', prompt: 'test', engine: 'ltx-video' });
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.sceneId).toBe('my-unique-scene');
    }
  });
});

// ══════════════════════════════════════════════════════════════
//  6. generateVideo - Error Cases
// ══════════════════════════════════════════════════════════════

describe('generateVideo - Error Cases', () => {
  it('throws "No Cloudflare Tunnel URL" when service has no URL', async () => {
    vi.mocked(fsExtra.existsSync).mockReturnValue(false);
    const svc = new ColabVideoService();
    await expect(
      svc.generateVideo({ sceneId: 'x', imagePath: '/img.png', prompt: 'test' })
    ).rejects.toThrow('No Cloudflare Tunnel URL');
  });

  it('throws when image file does not exist on disk', async () => {
    vi.mocked(fsExtra.existsSync).mockReturnValue(false);
    const svc = makeService();
    await expect(
      svc.generateVideo({ sceneId: 'x', imagePath: '/nonexistent.png', prompt: 'test' })
    ).rejects.toThrow(/does not exist/);
  });

  it('emits error status event when image is missing', async () => {
    vi.mocked(fsExtra.existsSync).mockReturnValue(false);
    const svc = makeService();
    const events: any[] = [];
    svc.setProgressCallback(p => events.push(p));
    await svc.generateVideo({ sceneId: 'err-x', imagePath: '/bad.png', prompt: 'test' }).catch(() => {});
    expect(events.some(e => e.status === 'error')).toBe(true);
    expect(events.find(e => e.status === 'error').sceneId).toBe('err-x');
  });

  it('throws on HTTP 413 from /upload/image', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/system_stats')) return okJson({ system: { os: 'linux' } });
      if (url.includes('/upload/image')) return Promise.resolve({ ok: false, status: 413, json: () => Promise.resolve({}) });
      return okJson({});
    });
    await expect(
      makeService().generateVideo({ sceneId: 'x', imagePath: '/fake/img.png', prompt: 'test' })
    ).rejects.toThrow(/Failed to upload image/);
  });

  it('throws on HTTP 422 from /prompt POST', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (url.includes('/upload/image')) return okJson({ name: 'img.png' });
      if (url.includes('/object_info/CLIPLoader')) return okJson({ CLIPLoader: { input: { required: { clip_name: [[]] } } } });
      if (url.includes('/object_info/VAELoader')) return okJson({ VAELoader: { input: { required: { vae_name: [[]] } } } });
      if (url.includes('/prompt') && opts?.method === 'POST') return errResponse(422);
      return okJson({});
    });
    await expect(
      makeService().generateVideo({ sceneId: 'x', imagePath: '/fake/img.png', prompt: 'test', engine: 'ltx-video' })
    ).rejects.toThrow(/Colab refused generation job/);
  });

  it('surfaces CUDA OOM error from ComfyUI history status', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (url.includes('/upload/image')) return okJson({ name: 'img.png' });
      if (url.includes('/object_info/CLIPLoader')) return okJson({ CLIPLoader: { input: { required: { clip_name: [[]] } } } });
      if (url.includes('/object_info/VAELoader')) return okJson({ VAELoader: { input: { required: { vae_name: [[]] } } } });
      if (url.includes('/prompt') && opts?.method === 'POST') return okJson({ prompt_id: 'oom-pid' });
      if (url.includes('/queue')) return okJson({ queue_running: [] });
      if (url.includes('/history/oom-pid')) return okJson({
        'oom-pid': {
          status: { status_str: 'error', messages: [['execution_error', { exception_message: 'CUDA out of memory' }]] },
          outputs: {},
        },
      });
      return okJson({});
    });
    const svc = makeService();
    svc.setProgressCallback(() => {});
    await expect(
      svc.generateVideo({ sceneId: 'oom', imagePath: '/fake/img.png', prompt: 'test', engine: 'ltx-video' })
    ).rejects.toThrow(/CUDA out of memory/);
  });
});

// ══════════════════════════════════════════════════════════════
//  7. cancelJob
// ══════════════════════════════════════════════════════════════

describe('cancelJob', () => {
  it('returns false for unknown sceneId (no active job)', async () => {
    expect(await makeService().cancelJob('ghost-scene')).toBe(false);
  });

  it('returns false after job completes (job removed from activeJobs)', async () => {
    global.fetch = buildFetch({ promptId: 'done-pid' });
    const svc = makeService();
    svc.setProgressCallback(() => {});
    await svc.generateVideo({ sceneId: 'done-scene', imagePath: '/fake/img.png', prompt: 'test', engine: 'ltx-video' });
    expect(await svc.cancelJob('done-scene')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
//  8. Edge Cases
// ══════════════════════════════════════════════════════════════

describe('Edge Cases', () => {
  it('defaults to ltx-video engine when no engine is specified', async () => {
    const { fetch, getWorkflow } = buildFetchCapture({ promptId: 'def-eng-pid' });
    global.fetch = fetch;
    const svc = makeService();
    svc.setProgressCallback(() => {});
    await svc.generateVideo({ sceneId: 'def-eng', imagePath: '/fake/img.png', prompt: 'test' });
    const nodes = Object.values(getWorkflow() as Record<string, any>);
    expect(nodes.some((n: any) => n.class_type === 'LTXVImgToVideo')).toBe(true);
  });

  it('KSampler seed is a non-negative integer', async () => {
    const { fetch, getWorkflow } = buildFetchCapture({ promptId: 'seed-pid' });
    global.fetch = fetch;
    const svc = makeService();
    svc.setProgressCallback(() => {});
    await svc.generateVideo({ sceneId: 'seed', imagePath: '/fake/img.png', prompt: 'test', engine: 'ltx-video' });
    const sampler = Object.values(getWorkflow() as Record<string, any>).find((n: any) => n.class_type === 'KSampler');
    expect(sampler.inputs.seed).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(sampler.inputs.seed)).toBe(true);
  });

  it('uploaded image name is injected into LoadImage node', async () => {
    const { fetch, getWorkflow } = buildFetchCapture({ promptId: 'img-inject-pid' });
    global.fetch = fetch;
    const svc = makeService();
    svc.setProgressCallback(() => {});
    await svc.generateVideo({ sceneId: 'img-inject', imagePath: '/fake/img.png', prompt: 'test', engine: 'ltx-video' });
    const loadImage = Object.values(getWorkflow() as Record<string, any>).find((n: any) => n.class_type === 'LoadImage');
    expect(loadImage.inputs.image).toBe('img.png');
  });

  it('multiple service instances have independent tunnel URLs', () => {
    const svc1 = makeService('https://url-one.trycloudflare.com');
    const svc2 = makeService('https://url-two.trycloudflare.com');
    expect(svc1.getTunnelUrl()).toBe('https://url-one.trycloudflare.com');
    expect(svc2.getTunnelUrl()).toBe('https://url-two.trycloudflare.com');
  });
});
