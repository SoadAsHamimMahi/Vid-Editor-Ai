import puppeteer, { Browser, Page } from 'puppeteer-core';
import http from 'http';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { FlowGenerationSettings } from '../../src/types';
import { projectStorage } from './projectStorage';

export interface AutomationJob {
  projectId?: string;
  sceneId: string;
  prompt: string;
  outputPath: string;
  mediaType?: 'image' | 'video' | 'animate';
  sourceImagePath?: string;
  settings?: FlowGenerationSettings;
}

interface InFlightCard {
  job: AutomationJob;
  sceneTag: string;
  promptSignature: string;
  submittedAt: number;
  assignedPort: number;
  initialUrls: string[];
  tileId?: string;
}

export function extractNormalizedTimecode(text: string): { full: string; short: string; seconds: number } | null {
  if (!text) return null;
  const clean = text.replace(/\b(?:16:9|9:16|16-9|9-16|4:3|3:4|21:9)\b/g, ' ');
  const m = clean.match(/#?(\d+)[-_:](\d{1,2}(?:\.\d+)?)/);
  if (!m) return null;
  const mins = parseInt(m[1], 10);
  const secsRaw = m[2];
  const secs = parseFloat(secsRaw);
  if (isNaN(mins) || isNaN(secs)) return null;
  const minsStr = mins.toString().padStart(2, '0');
  const [secInt, secDec] = secsRaw.split('.');
  const secIntStr = parseInt(secInt, 10).toString().padStart(2, '0');
  const full = secDec ? `${minsStr}-${secIntStr}.${secDec}` : `${minsStr}-${secIntStr}`;
  const short = `${minsStr}-${secIntStr}`;
  const totalSeconds = +(mins * 60 + secs).toFixed(3);
  return { full, short, seconds: totalSeconds };
}

/**
 * Generates a unique, non-colliding scene reference tag for Google Flow prompts.
 * Incorporates timecode digits (e.g. 151947) + deterministic hash to guarantee uniqueness.
 */
export function generateSceneTag(sceneId: string, prompt?: string, projectId?: string): string {
  const tc = extractNormalizedTimecode(sceneId || prompt || '');
  const tcPart = tc ? tc.full.replace(/[^0-9]/g, '') : '';
  const projPart = projectId ? crypto.createHash('md5').update(projectId).digest('hex').slice(0, 3).toUpperCase() : '';
  const hash = crypto.createHash('md5').update((projectId || '') + ':' + sceneId).digest('hex').slice(0, 4).toUpperCase();
  const prefix = projPart ? `P${projPart}_` : '';
  return tcPart ? `${prefix}SCN_${tcPart}_${hash}` : `${prefix}SCN_${hash}`;
}

/**
 * Detects whether a URL points to an active Google Flow project canvas.
 * Handles both legacy labs.google/fx/tools/flow/project/ and new flow.google.com/project/
 * Excludes auth sessions, API endpoints, and accounts login pages.
 */
export function isFlowProjectUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes('/api/') || url.includes('accounts.google.com') || url.includes('recaptcha')) return false;
  if (url.endsWith('/tools') || url.includes('/tools/') || url.endsWith('/edit') || url.includes('/edit/')) return false;
  return (
    url.includes('flow.google.com/project/') ||
    url.includes('flow.google.com/projects/') ||
    url.includes('labs.google/fx/tools/flow/project/')
  );
}

/**
 * Detects whether a URL belongs to Google Flow (either home, projects list, or canvas).
 * Excludes auth sessions, API endpoints, and accounts login pages.
 */
export function isFlowUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes('/api/') || url.includes('accounts.google.com') || url.includes('recaptcha')) return false;
  return (
    url.includes('flow.google.com') ||
    url.includes('labs.google/fx/tools/flow')
  );
}

export function scoreCandidateCard(
  cardText: string,
  sceneTag: string,
  prompt: string,
  tc: { full: string; short: string; seconds: number } | null
): number {
  let score = 0;
  const tagLower = sceneTag.toLowerCase();
  const textLower = (cardText || '').toLowerCase();

  // 1. Scene Tag Match (Highest confidence)
  if (textLower.includes(tagLower) || textLower.includes(`ref:${tagLower}`)) {
    score += 1000;
  }

  // 2. Exact Decimal Timecode Match (e.g. #00-12.93 or 00-12.93)
  if (tc) {
    if (textLower.includes(`#${tc.full}`) || textLower.includes(tc.full)) {
      score += 600;
    } else if (textLower.includes(`#${tc.short}`) || textLower.includes(tc.short)) {
      score += 200;
    }
  }

  // 3. Normalized Stem & Keyword Overlap
  const STOPWORDS = new Set([
    'scene', 'visual', 'shot', 'macro', 'cinematic', 'photo', 'realism', 'octane', 
    'render', 'style', 'aesthetic', '4k', '8k', 'image', 'more', 'vert', 'favorite', 
    'redo', 'download', 'prompt', 'generation', 'displaying', 'tile', 'user'
  ]);
  const promptLower = (prompt || '').toLowerCase();
  const promptWords = promptLower
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const cardWords = textLower
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  if (cardWords.length > 0 && promptWords.length > 0) {
    let matchedCardWords = 0;
    for (const cw of cardWords) {
      const matched = promptWords.some((pw) => {
        if (pw === cw) return true;
        if (cw.length >= 4 && pw.length >= 4) {
          return pw.startsWith(cw.slice(0, 4)) || cw.startsWith(pw.slice(0, 4)) || pw.includes(cw) || cw.includes(pw);
        }
        return false;
      });
      if (matched) {
        matchedCardWords++;
      }
    }

    const cardCoverage = matchedCardWords / cardWords.length;
    if (matchedCardWords >= 3) {
      score += 400;
    } else if (matchedCardWords >= 2) {
      score += 250;
    } else if (matchedCardWords === 1 && cardWords.length <= 5) {
      score += 160;
    }

    score += Math.round(cardCoverage * 150);
  }

  return score;
}

export class FlowAutomatorPool {
  private ports: number[];
  private browsers: Map<number, Browser> = new Map();
  private isProcessing: boolean = false;
  private queue: AutomationJob[] = [];
  private inFlightMap: Map<number, InFlightCard[]> = new Map(); // port -> in flight cards
  private activeWorkers: Set<number> = new Set(); // ports currently running a worker loop
  private rateLimitedPorts: Map<number, number> = new Map(); // port -> cooldown expiration timestamp
  private consumedUrls: Set<string> = new Set(); // Global set of harvested image/video URLs to prevent duplicate pulls
  private consumedFailedTiles: Set<string> = new Set(); // Track failed policy violation tiles to avoid duplicate alerts
  private harvestedContentHashes: Set<string> = new Set(); // Global SHA-256 content hashes to prevent duplicate image saves
  private maxConcurrentPerBrowser: number = 3; // Default to 3x Studio parallel mode
  private lastAppliedSettingsMap: Map<string, string> = new Map(); // canvas URL -> serialized settings key
  private onJobProgress?: (
    sceneId: string,
    status: 'generating' | 'ready' | 'error' | 'pending',
    mediaPath?: string,
    error?: string,
    mediaType?: 'image' | 'video',
    projectId?: string
  ) => void;

  constructor(ports: number[] = [9222, 9223]) {
    this.ports = Array.from(new Set(ports));
  }

  public getPorts(): number[] {
    return [...this.ports];
  }

  public setPorts(ports: number[]): number[] {
    const valid = Array.from(new Set(ports.filter((p) => Number.isInteger(p) && p >= 1024 && p <= 65535)));
    this.ports = valid.length > 0 ? valid : [9222, 9223];
    console.log('[FlowAutomator] CDP ports set to:', this.ports);
    return this.getPorts();
  }

  public addPort(port: number): number[] {
    if (Number.isInteger(port) && port >= 1024 && port <= 65535 && !this.ports.includes(port)) {
      this.ports.push(port);
      console.log(`[FlowAutomator] Added CDP port :${port}. Active ports:`, this.ports);
    }
    return this.getPorts();
  }

  public async removePort(port: number): Promise<number[]> {
    await this.closeInstance(port).catch(() => {});
    this.ports = this.ports.filter((p) => p !== port);
    this.browsers.delete(port);
    this.inFlightMap.delete(port);
    this.activeWorkers.delete(port);
    this.rateLimitedPorts.delete(port);
    console.log(`[FlowAutomator] Removed CDP port :${port}. Active ports:`, this.ports);
    return this.getPorts();
  }

  public setProgressCallback(
    cb: (
      sceneId: string,
      status: 'generating' | 'ready' | 'error' | 'pending',
      mediaPath?: string,
      error?: string,
      mediaType?: 'image' | 'video',
      projectId?: string
    ) => void
  ) {
    this.onJobProgress = cb;
  }

  public setMaxConcurrency(concurrency: number) {
    const newVal = Math.max(1, Math.min(4, concurrency));
    if (this.maxConcurrentPerBrowser === newVal) return;
    this.maxConcurrentPerBrowser = newVal;
    console.log(`[FlowAutomator] Max concurrent generations per browser set to: ${this.maxConcurrentPerBrowser}`);
  }

  private isPaused: boolean = false;

  public pauseGeneration(): boolean {
    this.isPaused = true;
    console.log('[FlowAutomator] ⏸️ Generation PAUSED by user. In-flight jobs will complete, but no new prompts will be dispatched.');
    return true;
  }

  public resumeGeneration(): boolean {
    this.isPaused = false;
    this.rateLimitedPorts.clear(); // Clear rate-limit cooldown on manual user resume
    console.log('[FlowAutomator] ▶️ Generation RESUMED by user. Continuing queue dispatch.');
    for (const port of this.ports) {
      const browser = this.browsers.get(port);
      if (browser && browser.isConnected()) {
        this.startWorkerForPort(port);
      }
    }
    return true;
  }

  public isGenerationPaused(): boolean {
    return this.isPaused;
  }

  public stopGeneration(): boolean {
    const dropped = this.queue.length;
    this.queue.length = 0;
    for (const [_, inFlight] of this.inFlightMap.entries()) {
      inFlight.length = 0;
    }
    this.isPaused = false;
    console.log(`[FlowAutomator] ⏹️ Generation STOPPED by user. Dropped ${dropped} queued scene(s).`);
    return true;
  }

  /**
   * Resets the global consumed URLs pool or removes specified URLs.
   */
  public resetConsumedUrls(specificUrls?: string[]): void {
    if (specificUrls && specificUrls.length > 0) {
      for (const url of specificUrls) {
        this.consumedUrls.delete(url);
      }
      console.log(`[FlowAutomator] Cleared ${specificUrls.length} consumed URLs. Remaining: ${this.consumedUrls.size}`);
    } else {
      const count = this.consumedUrls.size;
      this.consumedUrls.clear();
      this.consumedFailedTiles.clear();
      this.harvestedContentHashes.clear();
      console.log(`[FlowAutomator] Reset all ${count} consumed URLs, failed tile trackers, and content hashes.`);
    }
  }

  public clearConsumedUrl(url: string): void {
    if (url) {
      this.consumedUrls.delete(url);
    }
  }

  /**
   * PASSIVE status check — checks if remote debugging port is alive.
   * Auto-connects Puppeteer if Chrome is running, and validates Flow project canvas.
   * Called by the background poller every 12s. Safe to call at any time.
   */
  public async checkStatus(): Promise<{ port: number; connected: boolean; hasProjectOpen: boolean; browserOpen: boolean; credits?: number | null; creditsText?: string | null; email?: string | null }[]> {
    const results: { port: number; connected: boolean; hasProjectOpen: boolean; browserOpen: boolean; credits?: number | null; creditsText?: string | null; email?: string | null }[] = [];
    for (const port of this.ports) {
      try {
        let browser = this.browsers.get(port);
        if (!browser || !browser.isConnected()) {
          const isAlive = await this.checkPortStatus(port);
          if (isAlive) {
            await this.connectPort(port);
            browser = this.browsers.get(port);
          }
        }

        if (!browser || !browser.isConnected()) {
          results.push({ port, connected: false, hasProjectOpen: false, browserOpen: false });
          continue;
        }

        // We have an active Puppeteer session — check if a Flow project canvas or Flow tab is open
        const pages = await browser.pages().catch(() => []);
        const flowProjectPage = pages.find((p) => isFlowProjectUrl(p.url()));
        const anyFlowPage = flowProjectPage || pages.find((p) => isFlowUrl(p.url()));

        if (flowProjectPage && !flowProjectPage.isClosed()) {
          // Canvas is open and ready
          const creditInfo = await this.scrapeAccountCredits(flowProjectPage).catch(() => ({ credits: null, creditsText: null, email: null }));
          results.push({
            port,
            connected: true,
            hasProjectOpen: true,
            browserOpen: true,
            credits: creditInfo.credits,
            creditsText: creditInfo.creditsText,
            email: creditInfo.email,
          });
        } else if (anyFlowPage && !anyFlowPage.isClosed()) {
          // Chrome is on Google Flow, but user has not opened any project canvas yet
          const creditInfo = await this.scrapeAccountCredits(anyFlowPage).catch(() => ({ credits: null, creditsText: null, email: null }));
          results.push({
            port,
            connected: false,
            hasProjectOpen: false,
            browserOpen: true,
            credits: creditInfo.credits,
            creditsText: creditInfo.creditsText,
            email: creditInfo.email,
          });
        } else {
          // Chrome is open, but Flow is not loaded
          results.push({ port, connected: false, hasProjectOpen: false, browserOpen: true });
        }
      } catch {
        results.push({ port, connected: false, hasProjectOpen: false, browserOpen: false });
      }
    }
    return results;
  }

  /**
   * ACTIVE connect — creates a Puppeteer connection if not already connected.
   * Called only when the user explicitly clicks "Connect Flow" or "Reconnect".
   */
  public async connectAll(): Promise<{ port: number; connected: boolean; hasProjectOpen: boolean; browserOpen: boolean; credits?: number | null; creditsText?: string | null; email?: string | null }[]> {
    const results: { port: number; connected: boolean; hasProjectOpen: boolean; browserOpen: boolean; credits?: number | null; creditsText?: string | null; email?: string | null }[] = [];
    for (const port of this.ports) {
      try {
        const isAlive = await this.checkPortStatus(port);
        if (!isAlive) {
          this.browsers.delete(port);
          results.push({ port, connected: false, hasProjectOpen: false, browserOpen: false });
          continue;
        }

        const existingBrowser = this.browsers.get(port);
        let connected = false;
        if (existingBrowser && existingBrowser.isConnected()) {
          connected = true;
        } else {
          this.browsers.delete(port);
          connected = await this.connectPort(port);
        }

        let isFlowProjectReady = false;
        let creditInfo: { credits: number | null; creditsText: string | null; email: string | null } = { credits: null, creditsText: null, email: null };
        if (connected) {
          const browser = this.browsers.get(port);
          if (browser && browser.isConnected()) {
            const pages = await browser.pages().catch(() => []);
            const flowProjectPage = pages.find((p) => isFlowProjectUrl(p.url()));
            const anyFlowPage = flowProjectPage || pages.find((p) => isFlowUrl(p.url()));
            if (flowProjectPage && !flowProjectPage.isClosed()) {
              isFlowProjectReady = true;
              creditInfo = await this.scrapeAccountCredits(flowProjectPage).catch(() => ({ credits: null, creditsText: null, email: null }));
            } else if (anyFlowPage && !anyFlowPage.isClosed()) {
              creditInfo = await this.scrapeAccountCredits(anyFlowPage).catch(() => ({ credits: null, creditsText: null, email: null }));
            }
          }
        }

        results.push({
          port,
          connected: isFlowProjectReady,
          hasProjectOpen: isFlowProjectReady,
          browserOpen: true,
          credits: creditInfo.credits,
          creditsText: creditInfo.creditsText,
          email: creditInfo.email,
        });
      } catch {
        results.push({ port, connected: false, hasProjectOpen: false, browserOpen: false });
      }
    }
    return results;
  }

  public async spawnChromeInstance(port: number): Promise<boolean> {
    return await this.launchChromeInstance(port);
  }

  public async closeInstance(port: number): Promise<boolean> {
    try {
      const browser = this.browsers.get(port);
      if (browser) {
        try {
          await browser.close();
        } catch {
          browser.disconnect();
        }
        this.browsers.delete(port);
      }
      return true;
    } catch {
      this.browsers.delete(port);
      return false;
    }
  }

  public enqueue(job: AutomationJob) {
    this.submitJobs([job]).catch((err) => console.error('[FlowAutomator] Enqueue error:', err));
  }

  public async enqueueBatch(jobs: AutomationJob[]) {
    await this.submitJobs(jobs);
  }

  /**
   * Generates a batch of scenes via Google Flow's Agent feature.
   * Formats all scenes into a structured multi-card instruction and submits via Agent mode.
   */
  public async generateViaFlowAgent(jobs: AutomationJob[]): Promise<{ success: boolean; dispatched: number; error?: string }> {
    if (jobs.length === 0) return { success: true, dispatched: 0 };

    // MULTI-PORT PARALLEL AGENT MODE:
    // Each connected port (Google account) gets its own 20-scene batch simultaneously.
    // 1 port = 20 scenes/click, 2 ports = 40 scenes/click, 3 ports = 60 scenes/click.
    const AGENT_BATCH_LIMIT = 20;

    const pages = await this.getActiveFlowPages();
    if (pages.length === 0) {
      return { success: false, dispatched: 0, error: 'No active Google Flow browser tab connected. Please open Flow in Chrome first.' };
    }

    // Filter to only canvas pages (on a /project/ URL)
    const canvasPages = pages.filter((p) => p.page.url().includes('/project/'));
    if (canvasPages.length === 0) {
      return { success: false, dispatched: 0, error: 'Please open or select a project in Google Flow first so the canvas is visible.' };
    }

    // Assign one 20-scene batch to each available port
    const portBatches: { page: any; port: number; batch: AutomationJob[] }[] = [];
    let offset = 0;
    for (const { page, port } of canvasPages) {
      if (offset >= jobs.length) break;
      const batch = jobs.slice(offset, offset + AGENT_BATCH_LIMIT);
      if (batch.length > 0) {
        portBatches.push({ page, port, batch });
        offset += batch.length;
      }
    }

    const totalDispatched = portBatches.reduce((sum, pb) => sum + pb.batch.length, 0);
    console.log(`[FlowAutomator] 🚀 Parallel Agent Mode: ${portBatches.length} port(s) × ${AGENT_BATCH_LIMIT} scenes = dispatching ${totalDispatched} of ${jobs.length} scene(s) simultaneously...`);

    // Dispatch all port batches in parallel
    const results = await Promise.allSettled(
      portBatches.map(({ page, port, batch }) => this._dispatchAgentBatchToPort(page, port, batch))
    );

    let totalSuccess = 0;
    const errors: string[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.success) totalSuccess += result.value.dispatched;
        else if (result.value.error) errors.push(result.value.error);
      } else {
        errors.push(String(result.reason));
      }
    }

    if (totalSuccess === 0) {
      return { success: false, dispatched: 0, error: errors.join('; ') || 'All ports failed to dispatch.' };
    }

    return { success: true, dispatched: totalSuccess };
  }

  /**
   * Dispatches a single batch of ≤20 jobs to one specific Google Flow port via Agent mode.
   */
  private async _dispatchAgentBatchToPort(page: any, port: number, targetJobs: AutomationJob[]): Promise<{ success: boolean; dispatched: number; error?: string }> {
    if (targetJobs.length === 0) return { success: true, dispatched: 0 };
    console.log(`[FlowAutomator :${port}] Sending ${targetJobs.length} scene(s) via Google Flow Agent...`);

    // 1. If inside a card /edit/ view, navigate back to the canvas
    if (page.url().includes('/edit/')) {
      await page.evaluate(() => {
        const backBtn = Array.from(document.querySelectorAll('button')).find((b) =>
          (b.innerText || '').includes('arrow_back') || (b.innerText || '').toLowerCase().includes('go back')
        );
        if (backBtn) (backBtn as HTMLElement).click();
      });
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Close any open panels/popovers (Agent Instructions, Settings, etc.)
    await page.keyboard.press('Escape').catch(() => {});
    await new Promise((r) => setTimeout(r, 300));

    // 2. Ensure Agent mode button is active (check aria-pressed="true" or agent-mode-chip-checked class)
    try {
      const agentState = await page.evaluate(() => {
        // Specifically find the button element (not the inner span)
        const chip = (
          document.querySelector('button.agent-mode-chip, [class*="agent-mode-chip"], button:has(.agent-mode-chip-label)') ||
          document.querySelector('button[aria-label*="agent" i]')
        ) as HTMLElement | null;

        if (chip) {
          const isPressed = chip.getAttribute('aria-pressed') === 'true' || chip.classList.contains('agent-mode-chip-checked');
          if (!isPressed) {
            chip.click();
            return { toggled: true, wasPressed: false };
          }
          return { toggled: false, wasPressed: true };
        }

        // Fallback for custom or changed markup
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]')) as HTMLElement[];
        const agentBtn = buttons.find((b) => {
          const text = (b.innerText || '').trim().toLowerCase();
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          return text === 'agent' || text === '+ agent' || aria.includes('agent mode') || aria === 'agent';
        });

        if (agentBtn) {
          const isPressed = agentBtn.getAttribute('aria-pressed') === 'true' || agentBtn.classList.contains('agent-mode-chip-checked');
          if (!isPressed) {
            agentBtn.click();
            return { toggled: true, wasPressed: false };
          }
          return { toggled: false, wasPressed: true };
        }

        return { toggled: false, wasPressed: false, notFound: true };
      });

      if (agentState?.toggled) {
        console.log('[FlowAutomator] ✓ Activated Agent mode on Google Flow bottom toolbar.');
        await new Promise((r) => setTimeout(r, 600));
      } else if (agentState?.wasPressed) {
        console.log('[FlowAutomator] ✓ Agent mode was already enabled on Google Flow bottom toolbar.');
      } else if (agentState?.notFound) {
        console.warn('[FlowAutomator] ⚠️ Could not locate Agent mode button in Google Flow toolbar.');
      }
    } catch (err: any) {
      console.warn('[FlowAutomator] Error checking Agent mode button:', err.message);
    }

    // 3. Format all scenes into a structured master instruction list for Flow Agent
    const isVideo = targetJobs[0]?.mediaType === 'video';
    const agentLines: string[] = [
      `Create the following ${targetJobs.length} ${isVideo ? 'video' : 'image'} cards on the canvas. Create each as a SEPARATE card:`
    ];

    targetJobs.forEach((job, idx) => {
      const sceneTag = generateSceneTag(job.sceneId, job.prompt, job.projectId);
      const singleLinePrompt = job.prompt.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
      agentLines.push(`\n${idx + 1}. [REF:${sceneTag}] ${singleLinePrompt}`);
    });

    const agentMasterPrompt = agentLines.join('');

    // Snapshot pre-existing canvas image URLs to avoid harvesting old cards
    const initialUrls: string[] = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img, video')) as (HTMLImageElement | HTMLVideoElement)[];
      return imgs.map((i) => (i as HTMLImageElement).src || (i as HTMLVideoElement).currentSrc || '');
    }).catch(() => []);

    for (const u of initialUrls) {
      if (u) this.consumedUrls.add(u);
    }

    // 4. Submit the master agent prompt (isAgentMode=true skips mode-switching logic)
    console.log(`[FlowAutomator] Injecting ${targetJobs.length} prompts into Google Flow Agent...`);
    const submitted = await this.injectPromptAndSubmit(page, agentMasterPrompt, targetJobs[0]?.mediaType, targetJobs[0]?.settings, true);
    if (!submitted) {
      return { success: false, dispatched: 0, error: 'Failed to inject prompt into Google Flow. Make sure the Flow canvas is open and visible.' };
    }

    // 5. Mark scenes as generating
    targetJobs.forEach((job) => {
      this.onJobProgress?.(job.sceneId, 'generating', undefined, undefined, job.mediaType === 'video' ? 'video' : 'image', job.projectId);
    });
    console.log(`[FlowAutomator] ✓ Sent ${targetJobs.length} prompts to Google Flow Agent! Harvesting ready cards...`);

    // 6. Background polling worker to harvest ready cards as Flow Agent completes them
    const inFlightCards: InFlightCard[] = targetJobs.map((job) => {
      const sceneTag = generateSceneTag(job.sceneId, job.prompt, job.projectId);
      return {
        job,
        sceneTag,
        promptSignature: job.prompt.toLowerCase().replace(/[^a-z0-9]/g, ' ').slice(0, 45).trim(),
        submittedAt: Date.now(),
        assignedPort: port,
        initialUrls: [...initialUrls],
      };
    });

    // Start asynchronous monitoring loop
    (async () => {
      let remaining = [...inFlightCards];
      const timeoutMs = isVideo ? 600000 : Math.max(360000, targetJobs.length * 30000);
      const maxPollCycles = Math.ceil(timeoutMs / 2500) + 20;
      const startTime = Date.now();
      let agentRepliedCount = 0; // track how many times we auto-replied to agent questions

      for (let cycle = 0; cycle < maxPollCycles && remaining.length > 0; cycle++) {
        await new Promise((r) => setTimeout(r, 2500));
        if (page.isClosed() || !page.browser() || !page.browser().isConnected()) break;

        // Auto-reply if Flow Agent is waiting for user confirmation
        // (Flow Agent can ask "Should we start with the first 20 scenes?" etc.)
        if (agentRepliedCount < 5) {
          try {
            const agentQuestion = await page.evaluate(() => {
              // Look for the agent's response area - typically last message bubble in the chat
              const msgs = Array.from(document.querySelectorAll(
                '[class*="agent-message"], [class*="response-bubble"], [class*="chat-message"], [class*="message-content"]'
              ));

              // Also look inside the flow agent side panel or assistant chat
              const allText = Array.from(document.querySelectorAll('div, p, span')).map(el => {
                const t = (el as HTMLElement).innerText?.trim() || '';
                return t;
              }).filter(t => t.length > 20 && (
                t.includes('Should we start') ||
                t.includes('proceed that way') ||
                t.includes("Let me know if") ||
                t.includes("proceed with the first") ||
                t.includes("more than 24") ||
                t.includes("Can't process more") ||
                t.includes("handle the remaining") ||
                t.includes("follow-up batch") ||
                t.includes("want me to proceed") ||
                t.includes("ready to proceed") ||
                t.includes("shall I proceed") ||
                t.includes("shall we proceed")
              ));

              if (allText.length === 0) return null;

              // Check if the prompt input is currently empty (agent waiting for reply)
              const editor = document.querySelector('.ProseMirror[contenteditable="true"]') as HTMLElement;
              const editorText = editor?.innerText?.trim() || '';
              const isEditorEmpty = editorText === '' || editorText === 'What do you want to create?';

              return isEditorEmpty ? allText[0] : null;
            });

            if (agentQuestion) {
              console.log(`[FlowAutomator Agent] 🤖 Flow Agent asked a question: "${agentQuestion.slice(0, 100)}..."`);
              console.log('[FlowAutomator Agent] Auto-replying: "Yes, please proceed with all scenes."');

              // Type the reply into the editor
              const replied = await page.evaluate(() => {
                const editor = document.querySelector('.ProseMirror[contenteditable="true"]') as HTMLElement;
                if (!editor) return false;
                editor.focus();
                document.execCommand('selectAll', false);
                document.execCommand('insertText', false, 'Yes, please proceed with all the scenes.');
                return true;
              });

              if (replied) {
                await new Promise((r) => setTimeout(r, 500));
                // Click submit button or press Enter
                const replySubmitRes = await this.triggerFlowSubmit(page);
                if (replySubmitRes.x && replySubmitRes.y) {
                  await page.mouse.click(replySubmitRes.x, replySubmitRes.y).catch(() => {});
                }
                await page.evaluate(() => {
                  const editor = document.querySelector('.ProseMirror[contenteditable="true"], [contenteditable="true"]') as HTMLElement | null;
                  if (editor) editor.focus();
                }).catch(() => {});
                await page.keyboard.press('Enter').catch(() => {});
                agentRepliedCount++;
                console.log(`[FlowAutomator Agent] ✓ Auto-reply sent. (Reply #${agentRepliedCount})`);
                await new Promise((r) => setTimeout(r, 2000));
              }
            }
          } catch (qErr: any) {
            console.warn('[FlowAutomator Agent] Auto-reply check error:', qErr.message);
          }
        }

        try {
          const completedSceneIds = await this.pollAndHarvestReadyCards(page, remaining);
          if (completedSceneIds.length > 0) {
            remaining = remaining.filter((c) => !completedSceneIds.includes(c.job.sceneId));
            console.log(`[FlowAutomator Agent] ✓ Harvested ${completedSceneIds.length} scene(s) from Flow Agent. Remaining in flight: ${remaining.length}`);
          }
        } catch (err: any) {
          console.warn('[FlowAutomator Agent] Harvest poll warning:', err.message);
        }

        // Check overall timeout
        if (Date.now() - startTime > timeoutMs) {
          console.warn(`[FlowAutomator Agent] ⏱️ Timeout: ${remaining.length} scene(s) didn't complete in time. Auto-resetting to 'pending' for next batch retry...`);
          for (const dead of remaining) {
            // Reset to 'pending' instead of 'error' — this way the next Agent Bulk click
            // automatically picks them up and retries without any manual intervention.
            this.onJobProgress?.(
              dead.job.sceneId,
              'pending',
              undefined,
              undefined,
              dead.job.mediaType === 'video' ? 'video' : 'image',
              dead.job.projectId
            );
            console.log(`[FlowAutomator Agent] ♻️ Reset scene ${dead.job.sceneId} → pending (will retry in next batch)`);
          }
          break;
        }
      }
    })();

    return { success: true, dispatched: targetJobs.length };
  }

  /**
   * Scans active connected Google Flow tabs across all configured ports.
   */
  public async getActiveFlowPages(): Promise<{ port: number; page: Page }[]> {
    const active: { port: number; page: Page }[] = [];
    for (const port of this.ports) {
      if (!this.browsers.has(port)) {
        const isAlive = await this.checkPortStatus(port);
        if (isAlive) {
          await this.connectPort(port);
        }
      }
      const browser = this.browsers.get(port);
      if (browser && browser.isConnected()) {
        const page = await this.acquirePage(browser, port);
        if (page && !page.isClosed()) {
          active.push({ port, page });
        }
      }
    }
    return active;
  }

  /**
   * Pulls and recovers already generated images directly from the Google Flow canvas
   * without re-submitting prompts.
   */
  public async pullFromCanvas(
    jobs: AutomationJob[],
    options: { forceOverwrite?: boolean; targetSceneIds?: string[] } = {}
  ): Promise<{
    matched: number;
    total: number;
    details: Array<{ sceneId: string; success: boolean; imagePath?: string; reason?: string }>;
  }> {
    console.log(`[FlowAutomator] Starting Canvas Recovery for ${jobs.length} jobs...`);
    const pages = await this.getActiveFlowPages();
    if (pages.length === 0) {
      console.warn('[FlowAutomator] No active Google Flow browser tab connected to pull from.');
      return {
        matched: 0,
        total: jobs.length,
        details: jobs.map((j) => ({
          sceneId: j.sceneId,
          success: false,
          reason: 'No connected Chrome browser with Google Flow open.',
        })),
      };
    }

    const filteredJobs = options.targetSceneIds && options.targetSceneIds.length > 0
      ? jobs.filter((j) => options.targetSceneIds!.includes(j.sceneId))
      : jobs;

    let matchedCount = 0;
    const details: Array<{ sceneId: string; success: boolean; imagePath?: string; reason?: string }> = [];

    for (const { port, page } of pages) {
      try {
        const candidates = await this.extractCanvasCards(page);
        console.log(`[FlowAutomator :${port}] Found ${candidates.length} completed image cards on canvas.`);

        const unconsumed = candidates.filter((c) => options.forceOverwrite || !this.consumedUrls.has(c.src));
        const availablePool = [...unconsumed];

        // Step 1: Deterministic Multi-Tier Match (Tier 0 boundSceneId -> Tier 1 tag/tileId -> Tier 2 semantic with competitive bidding)
        for (const job of filteredJobs) {
          if (details.some((d) => d.sceneId === job.sceneId && d.success)) continue;

          const sceneTag = generateSceneTag(job.sceneId, job.prompt, job.projectId);
          const sceneTc = extractNormalizedTimecode(job.prompt || job.sceneId || '');

          // Hard exclusion: Never allow matching candidates stamped for a DIFFERENT scene
          const jobPool = availablePool.filter((cand) => {
            if (cand.boundSceneId && cand.boundSceneId !== job.sceneId) return false;
            if (cand.boundSceneTag && sceneTag && cand.boundSceneTag !== sceneTag) return false;
            if (cand.tileId && (job as any).tileId && cand.tileId !== (job as any).tileId) return false;
            return true;
          });

          if (jobPool.length === 0) continue;

          let bestIdx = -1;
          let highestScore = -1;

          // Tier 0: Direct Match by stamped boundSceneId (100% Deterministic DOM Binding)
          bestIdx = jobPool.findIndex((cand) => cand.boundSceneId && cand.boundSceneId === job.sceneId);

          // Tier 1: Match by explicit sceneTag or tileId
          if (bestIdx === -1) {
            bestIdx = jobPool.findIndex((cand) => cand.boundSceneTag && cand.boundSceneTag === sceneTag);
          }

          // Tier 2: Match by cardText semantic / sceneTag score with CROSS-TALK COMPETITIVE BIDDING GUARD
          if (bestIdx === -1) {
            for (let i = 0; i < jobPool.length; i++) {
              const cand = jobPool[i];
              const score = scoreCandidateCard(cand.cardText, sceneTag, job.prompt, sceneTc);
              if (score >= 80 && score > highestScore) {
                // Competitive bidding: Ensure no other unassigned filtered job has a HIGHER score for this candidate
                let hasBetterCompetitor = false;
                for (const otherJob of filteredJobs) {
                  if (otherJob.sceneId === job.sceneId) continue;
                  if (details.some((d) => d.sceneId === otherJob.sceneId && d.success)) continue;
                  const otherTag = generateSceneTag(otherJob.sceneId, otherJob.prompt, otherJob.projectId);
                  const otherTc = extractNormalizedTimecode(otherJob.prompt || otherJob.sceneId || '');
                  const otherScore = scoreCandidateCard(cand.cardText, otherTag, otherJob.prompt, otherTc);
                  if (otherScore > score) {
                    hasBetterCompetitor = true;
                    break;
                  }
                }

                if (!hasBetterCompetitor) {
                  highestScore = score;
                  bestIdx = i;
                }
              }
            }
          }

          if (bestIdx !== -1) {
            const matchedCand = jobPool[bestIdx];
            const poolIdx = availablePool.indexOf(matchedCand);
            if (poolIdx !== -1) availablePool.splice(poolIdx, 1);
            try {
              const saved = await this.saveCandidateToDisk(page, matchedCand.src, job.outputPath);
              if (saved) {
                matchedCount++;
                this.consumedUrls.add(matchedCand.src);
                this.onJobProgress?.(job.sceneId, 'ready', job.outputPath, undefined, 'image', job.projectId);
                details.push({ sceneId: job.sceneId, success: true, imagePath: job.outputPath });
                console.log(`[FlowAutomator] ✓ RECOVERED image from canvas for scene ${job.sceneId} [${sceneTag}] -> ${job.outputPath}`);
              }
            } catch (err: any) {
              console.warn(`[FlowAutomator] Error saving candidate for ${job.sceneId}:`, err.message);
            }
          }
        }
      } catch (err: any) {
        console.error(`[FlowAutomator :${port}] Error during pullFromCanvas:`, err.message);
      }
    }

    // Step 2: Strict failure for unmatched scenes (PREVENTS CASCADING OFF-BY-ONE SHIFTS)
    const remainingJobs = filteredJobs.filter((j) => !details.some((d) => d.sceneId === j.sceneId && d.success));
    for (const job of remainingJobs) {
      console.warn(`[FlowAutomator] Scene ${job.sceneId} has no verified matching card on canvas.`);
      details.push({
        sceneId: job.sceneId,
        success: false,
        reason: 'No completed card matching this scene was found on the Google Flow canvas.',
      });
    }

    return {
      matched: matchedCount,
      total: filteredJobs.length,
      details,
    };
  }

  /**
   * Pulls and recovers already generated videos directly from the Google Flow canvas.
   */
  public async pullVideosFromCanvas(
    jobs: AutomationJob[],
    options: { forceOverwrite?: boolean; targetSceneIds?: string[] } = {}
  ): Promise<{
    matched: number;
    total: number;
    details: Array<{ sceneId: string; success: boolean; videoPath?: string; reason?: string }>;
  }> {
    console.log(`[FlowAutomator] Starting Canvas Video Recovery for ${jobs.length} jobs...`);
    const pages = await this.getActiveFlowPages();
    if (pages.length === 0) {
      console.warn('[FlowAutomator] No active Google Flow browser tab connected to pull videos from.');
      return {
        matched: 0,
        total: jobs.length,
        details: jobs.map((j) => ({
          sceneId: j.sceneId,
          success: false,
          reason: 'No connected Chrome browser with Google Flow open.',
        })),
      };
    }

    const filteredJobs = options.targetSceneIds && options.targetSceneIds.length > 0
      ? jobs.filter((j) => options.targetSceneIds!.includes(j.sceneId))
      : jobs;

    let matchedCount = 0;
    const details: Array<{ sceneId: string; success: boolean; videoPath?: string; reason?: string }> = [];

    for (const { port, page } of pages) {
      try {
        const candidates = await this.extractCanvasVideoCards(page);
        console.log(`[FlowAutomator :${port}] Found ${candidates.length} completed video cards on canvas.`);

        const unconsumed = candidates.filter((c) => options.forceOverwrite || !this.consumedUrls.has(c.src));
        const availablePool = [...unconsumed];

        // Step 1: Deterministic Multi-Tier Match (Tier 0 boundSceneId -> Tier 1 tag/tileId -> Tier 2 semantic with competitive bidding)
        for (const job of filteredJobs) {
          if (details.some((d) => d.sceneId === job.sceneId && d.success)) continue;

          const sceneTag = generateSceneTag(job.sceneId, job.prompt, job.projectId);
          const sceneTc = extractNormalizedTimecode(job.prompt || job.sceneId || '');

          // Hard exclusion: Never allow matching candidates stamped for a DIFFERENT scene
          const jobPool = availablePool.filter((cand) => {
            if (cand.boundSceneId && cand.boundSceneId !== job.sceneId) return false;
            if (cand.boundSceneTag && sceneTag && cand.boundSceneTag !== sceneTag) return false;
            if (cand.tileId && (job as any).tileId && cand.tileId !== (job as any).tileId) return false;
            return true;
          });

          if (jobPool.length === 0) continue;

          let bestIdx = -1;
          let highestScore = -1;

          // Tier 0: Direct Match by stamped boundSceneId (100% Deterministic DOM Binding)
          bestIdx = jobPool.findIndex((cand) => cand.boundSceneId && cand.boundSceneId === job.sceneId);

          // Tier 1: Match by explicit sceneTag or tileId
          if (bestIdx === -1) {
            bestIdx = jobPool.findIndex((cand) => cand.boundSceneTag && cand.boundSceneTag === sceneTag);
          }

          // Tier 2: Match by cardText semantic / sceneTag score with CROSS-TALK COMPETITIVE BIDDING GUARD
          if (bestIdx === -1) {
            for (let i = 0; i < jobPool.length; i++) {
              const cand = jobPool[i];
              const score = scoreCandidateCard(cand.cardText, sceneTag, job.prompt, sceneTc);
              if (score >= 100 && score > highestScore) {
                // Competitive bidding: Ensure no other unassigned filtered job has a HIGHER score for this candidate
                let hasBetterCompetitor = false;
                for (const otherJob of filteredJobs) {
                  if (otherJob.sceneId === job.sceneId) continue;
                  if (details.some((d) => d.sceneId === otherJob.sceneId && d.success)) continue;
                  const otherTag = generateSceneTag(otherJob.sceneId, otherJob.prompt, otherJob.projectId);
                  const otherTc = extractNormalizedTimecode(otherJob.prompt || otherJob.sceneId || '');
                  const otherScore = scoreCandidateCard(cand.cardText, otherTag, otherJob.prompt, otherTc);
                  if (otherScore > score) {
                    hasBetterCompetitor = true;
                    break;
                  }
                }

                if (!hasBetterCompetitor) {
                  highestScore = score;
                  bestIdx = i;
                }
              }
            }
          }

          if (bestIdx !== -1) {
            const matchedCand = jobPool[bestIdx];
            const poolIdx = availablePool.indexOf(matchedCand);
            if (poolIdx !== -1) availablePool.splice(poolIdx, 1);
            try {
              const saved = await this.saveVideoCandidateToDisk(page, matchedCand.src, job.outputPath);
              if (saved) {
                matchedCount++;
                this.consumedUrls.add(matchedCand.src);
                this.onJobProgress?.(job.sceneId, 'ready', job.outputPath, undefined, 'video', job.projectId);
                details.push({ sceneId: job.sceneId, success: true, videoPath: job.outputPath });
                console.log(`[FlowAutomator] ✓ RECOVERED video from canvas for scene ${job.sceneId} [${sceneTag}] -> ${job.outputPath}`);
              }
            } catch (err: any) {
              console.warn(`[FlowAutomator] Error saving video candidate for ${job.sceneId}:`, err.message);
            }
          }
        }

        // Step 2: Strict failure for unmatched scenes (PREVENTS CASCADING OFF-BY-ONE SHIFTS)
        const remainingJobs = filteredJobs.filter((j) => !details.some((d) => d.sceneId === j.sceneId && d.success));
        for (const job of remainingJobs) {
          console.warn(`[FlowAutomator] Video scene ${job.sceneId} has no verified matching card on canvas. Leaving empty/failed.`);
          this.onJobProgress?.(job.sceneId, 'error', undefined, 'Video not found on canvas or was blocked by Google Flow safety filters.', 'video', job.projectId);
          details.push({
            sceneId: job.sceneId,
            success: false,
            reason: 'No verified video card matching scene tag, timecode, or prompt was found on canvas.',
          });
        }
      } catch (err: any) {
        console.error(`[FlowAutomator :${port}] Error during pullVideosFromCanvas:`, err.message);
      }
    }

    for (const job of filteredJobs) {
      if (!details.some((d) => d.sceneId === job.sceneId)) {
        details.push({
          sceneId: job.sceneId,
          success: false,
          reason: 'No matching completed video card found on Google Flow canvas.',
        });
      }
    }

    return {
      matched: matchedCount,
      total: filteredJobs.length,
      details,
    };
  }

  /**
   * Verifies all placed scene images against filesystem integrity and Google Flow canvas cards.
   * Returns detected mismatches, missing files, or tag anomalies.
   */
  public async verifyCanvasPlacements(
    scenes: { id: string; prompt: string; localImagePath?: string; status?: string }[]
  ): Promise<{
    mismatches: Array<{ sceneId: string; reason: string; suggestedTag?: string }>;
    validCount: number;
    totalChecked: number;
  }> {
    const mismatches: Array<{ sceneId: string; reason: string; suggestedTag?: string }> = [];
    let validCount = 0;

    const pages = await this.getActiveFlowPages();
    let allCanvasCards: any[] = [];
    for (const { page } of pages) {
      try {
        const cards = await this.extractCanvasCards(page);
        allCanvasCards.push(...cards);
      } catch {}
    }

    for (const scene of scenes) {
      const sceneTag = generateSceneTag(scene.id, scene.prompt, (scene as any).projectId);
      const tagLower = sceneTag.toLowerCase();

      // Check 1: If marked ready with localImagePath, verify file actually exists and is readable
      if (scene.localImagePath) {
        try {
          const exists = await fs.pathExists(scene.localImagePath);
          if (!exists) {
            mismatches.push({
              sceneId: scene.id,
              reason: 'Local image file does not exist on disk.',
              suggestedTag: sceneTag,
            });
            continue;
          }
          const stat = await fs.stat(scene.localImagePath);
          if (stat.size < 100) {
            mismatches.push({
              sceneId: scene.id,
              reason: 'Local image file is corrupted or empty (0 bytes).',
              suggestedTag: sceneTag,
            });
            continue;
          }
        } catch (e: any) {
          mismatches.push({
            sceneId: scene.id,
            reason: `Error reading disk file: ${e.message}`,
            suggestedTag: sceneTag,
          });
          continue;
        }
      } else if (scene.status === 'ready') {
        mismatches.push({
          sceneId: scene.id,
          reason: 'Scene is marked ready but has no local image path assigned.',
          suggestedTag: sceneTag,
        });
        continue;
      }

      // Check 2: If scene is missing an image or in error, check if a matching card is waiting on canvas
      if ((!scene.localImagePath || scene.status !== 'ready') && allCanvasCards.length > 0) {
        const promptWords = scene.prompt.toLowerCase().replace(/[^a-z0-9]/g, ' ').slice(0, 45).split(/\s+/).filter((w) => w.length > 3);
        const cardMatch = allCanvasCards.find((c) => 
          c.cardText.includes(tagLower) || 
          c.cardText.includes(`ref:${tagLower}`) ||
          promptWords.filter((w) => c.cardText.includes(w)).length >= 2
        );

        if (cardMatch) {
          mismatches.push({
            sceneId: scene.id,
            reason: 'Generated image is ready on Google Flow canvas but has not been pulled yet.',
            suggestedTag: sceneTag,
          });
          continue;
        }
      }

      validCount++;
    }

    return {
      mismatches,
      validCount,
      totalChecked: scenes.length,
    };
  }

  /**
   * Scans all scenes, project disk files, and Google Flow canvas cards to automatically
   * match and re-map images that were placed in the wrong scene or are missing.
   */
  public async autoRemapCanvasPlacements(
    scenes: { id: string; prompt: string; localImagePath?: string; status?: string }[],
    projectId?: string
  ): Promise<{
    remappedScenes: Array<{ id: string; localImagePath: string; status: 'ready' }>;
    remappedCount: number;
    summary: string;
  }> {
    const pId = projectId || 'default_project';
    const imagesDir = projectStorage.getImagesDir(pId);
    await fs.ensureDir(imagesDir);

    const remappedScenes: Array<{ id: string; localImagePath: string; status: 'ready' }> = [];
    let remappedCount = 0;

    // 1. Gather all disk image files in project images folder
    const diskFiles = await fs.readdir(imagesDir).catch(() => []);
    const diskImagePaths = diskFiles
      .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .map((f) => path.join(imagesDir, f));

    // 2. Gather all completed canvas cards from Google Flow tabs
    const pages = await this.getActiveFlowPages();
    let allCanvasCards: any[] = [];
    let activePage: Page | null = null;
    for (const { page } of pages) {
      try {
        if (!activePage) activePage = page;
        const cards = await this.extractCanvasCards(page);
        allCanvasCards.push(...cards);
      } catch {}
    }

    // 3. For each scene, find its exact matching image candidate from disk or canvas
    for (const scene of scenes) {
      const sceneTag = generateSceneTag(scene.id, scene.prompt, projectId).toLowerCase();
      const sceneTc = extractNormalizedTimecode(scene.prompt || scene.id || '');

      let matchedImagePath: string | null = null;

      // Check A: Match from disk files (fastest & highest fidelity)
      if (diskImagePaths.length > 0) {
        // Pass 1: Exact full timecode match (e.g. '00-12.93')
        if (sceneTc) {
          for (const filePath of diskImagePaths) {
            const fileName = path.basename(filePath).toLowerCase();
            const fileTc = extractNormalizedTimecode(fileName);
            if (fileTc && fileTc.full === sceneTc.full) {
              matchedImagePath = filePath;
              break;
            }
          }
        }

        // Pass 2: Scene ID exact match
        if (!matchedImagePath) {
          for (const filePath of diskImagePaths) {
            const fileName = path.basename(filePath).toLowerCase();
            if (fileName.includes(scene.id.toLowerCase())) {
              matchedImagePath = filePath;
              break;
            }
          }
        }

        // Pass 3: Short timecode match (only if neither has decimals)
        if (!matchedImagePath && sceneTc && !sceneTc.full.includes('.')) {
          for (const filePath of diskImagePaths) {
            const fileName = path.basename(filePath).toLowerCase();
            const fileTc = extractNormalizedTimecode(fileName);
            if (fileTc && fileTc.short === sceneTc.short && !fileTc.full.includes('.')) {
              matchedImagePath = filePath;
              break;
            }
          }
        }
      }

      // Check B: Canvas cards match by Tag, boundSceneId, Timecode or Keywords if not found on disk
      if (!matchedImagePath && allCanvasCards.length > 0 && activePage) {
        let bestCard: any = null;
        let highestScore = -1;

        // Priority 1: Match by boundSceneId or exact sceneTag
        const exactBound = allCanvasCards.find((c) => c.boundSceneId === scene.id || (c.boundSceneTag && c.boundSceneTag === sceneTag));
        if (exactBound) {
          bestCard = exactBound;
        } else {
          for (const c of allCanvasCards) {
            if (c.boundSceneId && c.boundSceneId !== scene.id) continue;
            const score = scoreCandidateCard(c.cardText, sceneTag, scene.prompt, sceneTc);
            if (score > highestScore && score >= 100) {
              highestScore = score;
              bestCard = c;
            }
          }
        }

        if (bestCard && bestCard.src) {
          const targetPath = projectStorage.getImagePathForScene(scene.id, pId);
          try {
            const saved = await this.saveCandidateToDisk(activePage, bestCard.src, targetPath);
            if (saved) {
              matchedImagePath = targetPath;
              this.consumedUrls.add(bestCard.src);
            }
          } catch {}
        }
      }

      // If we found a valid matching image and it's different from the scene's current image
      if (matchedImagePath && matchedImagePath !== scene.localImagePath) {
        remappedScenes.push({
          id: scene.id,
          localImagePath: matchedImagePath,
          status: 'ready',
        });
        remappedCount++;
      }
    }

    return {
      remappedScenes,
      remappedCount,
      summary: `Auto-remapped ${remappedCount} scene images to their exact matching prompts & timecodes.`,
    };
  }

  /**
   * Helper: Extracts all completed image card candidates from Google Flow canvas.
   */
  private async extractCanvasCards(page: Page): Promise<any[]> {
    return await page.evaluate(() => {
      const allImgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];

      const validMedia = allImgs.filter((img) => {
        const src = img.src || img.getAttribute('data-src') || '';
        if (!src || src.trim() === '' || src === 'about:blank') return false;
        const rect = img.getBoundingClientRect();
        const isMedia =
          src.includes('flow-content.google') ||
          src.includes('flow.google.com/asb') ||
          src.includes('media.getMediaUrlRedirect') ||
          src.includes('googleusercontent') ||
          (img.alt && img.alt.includes('Tile displaying')) ||
          src.startsWith('blob:') ||
          src.startsWith('data:image');
        const notIcon =
          !src.includes('avatar') &&
          !src.includes('googlelogo') &&
          !src.includes('icon') &&
          !src.includes('favicon') &&
          !src.includes('profile');
        const hasSize = (img.naturalWidth > 150 || rect.width > 80) && (img.naturalHeight > 80 || rect.height > 40);
        const isNotHeaderOrNav = !img.closest('header') && !img.closest('nav');
        return isMedia && notIcon && hasSize && isNotHeaderOrNav;
      });

      // Filter out generating cards (strictly bounded to the card tile container)
      const completedOnly = validMedia.filter((img) => {
        let parent = img.parentElement;
        for (let lvl = 0; lvl < 8 && parent; lvl++) {
          if (
            parent.tagName === 'BODY' ||
            parent.tagName === 'MAIN' ||
            parent.classList?.contains('tile-row') ||
            parent.classList?.contains('virtual-scroll-container') ||
            parent.classList?.contains('virtual-item-container') ||
            parent.classList?.contains('cdk-virtual-scroll-viewport')
          ) {
            break;
          }
          const text = parent.innerText || '';
          if (/\b\d{1,2}%\b/.test(text) || text.includes('Generating') || text.includes('Creating') || text.includes('Rendering')) {
            return false;
          }
          if (parent.tagName === 'FLOW-GRID-TILE-CONTAINER' || parent.hasAttribute('data-tile-id')) {
            break;
          }
          parent = parent.parentElement;
        }
        return true;
      });

      return completedOnly.map((img) => {
        let parent = img.parentElement;
        let cardText = '';
        let tileId = '';
        let boundSceneId = '';
        let boundSceneTag = '';
        let createdTime: string | null = null;
        let posX: number | null = null;
        let posY: number | null = null;

        const tileContainer = img.closest('flow-grid-tile-container, flow-tile-container, [class*="tile-container"]');
        if (tileContainer) {
          const tcAria = tileContainer.getAttribute('aria-label') || '';
          const tcTitle = tileContainer.getAttribute('title') || '';
          const tcText = (tileContainer as HTMLElement).innerText || '';
          cardText += ` ${tcAria} ${tcTitle} ${tcText}`;
          tileId = tileContainer.getAttribute('data-vg-tile-id') || tileContainer.getAttribute('data-tile-id') || '';
          boundSceneId = tileContainer.getAttribute('data-vg-scene-id') || '';
          boundSceneTag = tileContainer.getAttribute('data-vg-scene-tag') || '';
        }

        for (let lvl = 0; lvl < 8 && parent; lvl++) {
          if (
            parent.tagName === 'BODY' ||
            parent.tagName === 'MAIN' ||
            parent.id === 'main-content' ||
            parent.classList?.contains('tile-row') ||
            parent.classList?.contains('virtual-scroll-container') ||
            parent.classList?.contains('virtual-item-container') ||
            parent.classList?.contains('cdk-virtual-scroll-viewport') ||
            (parent.className && typeof parent.className === 'string' && parent.className.includes('page-layout'))
          ) {
            break;
          }
          if (!tileId) {
            tileId = parent.getAttribute('data-vg-tile-id') || parent.getAttribute('data-tile-id') || '';
          }
          if (!boundSceneId) {
            boundSceneId = parent.getAttribute('data-vg-scene-id') || '';
          }
          if (!boundSceneTag) {
            boundSceneTag = parent.getAttribute('data-vg-scene-tag') || '';
          }
          const pText = parent.innerText || '';
          const pAria = parent.getAttribute('aria-label') || '';
          const pTitle = parent.getAttribute('title') || '';
          const pPrompt = parent.getAttribute('data-prompt') || '';
          const pRef = parent.getAttribute('data-ref') || '';
          cardText += ` ${pText} ${pAria} ${pTitle} ${pPrompt} ${pRef}`;

          if (!createdTime || posX === null) {
            try {
              const rKey = Object.keys(parent).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
              if (rKey) {
                const fiber = (parent as any)[rKey];
                const p = fiber?.memoizedProps;
                if (p?.tile) {
                  if (!createdTime && p.tile.createdTime && typeof p.tile.createdTime === 'string') {
                    createdTime = p.tile.createdTime;
                  }
                  if (p.tile.prompt && typeof p.tile.prompt === 'string') {
                    cardText += ' ' + p.tile.prompt;
                  }
                  if (p.tile.title && typeof p.tile.title === 'string') {
                    cardText += ' ' + p.tile.title;
                  }
                  if (!tileId && p.tile.id) tileId = p.tile.id;
                  // Capture tile position from React state if available
                  if (posX === null && typeof p.tile.x === 'number') posX = p.tile.x;
                  if (posY === null && typeof p.tile.y === 'number') posY = p.tile.y;
                }
              }
            } catch {}
          }

          const isBoundary = parent.tagName === 'FLOW-GRID-TILE-CONTAINER' || parent.hasAttribute('data-tile-id');
          parent = parent.parentElement;
          if (isBoundary) break;
        }

        // getBoundingClientRect only works for visible elements; offsetTop/offsetLeft works for all
        const visibleRect = img.getBoundingClientRect();
        // Use offset position as fallback — accumulated from offsetParent chain
        let accOffsetTop = 0;
        let accOffsetLeft = 0;
        let el: HTMLElement | null = img;
        while (el) {
          accOffsetTop += (el as HTMLElement).offsetTop || 0;
          accOffsetLeft += (el as HTMLElement).offsetLeft || 0;
          el = (el as HTMLElement).offsetParent as HTMLElement | null;
        }

        // Fallback to in-memory ledger if React virtualization stripped DOM attributes
        const win = window as any;
        if ((!boundSceneId || !boundSceneTag) && win.__CINEFLOW_LEDGER__) {
          if (tileId && win.__CINEFLOW_LEDGER__.has(tileId)) {
            const entry = win.__CINEFLOW_LEDGER__.get(tileId);
            if (!boundSceneId) boundSceneId = entry.sceneId;
            if (!boundSceneTag) boundSceneTag = entry.sceneTag;
          }
        }

        return {
          tileId,
          boundSceneId,
          boundSceneTag,
          src: img.src || img.getAttribute('data-src') || '',
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          cardText: cardText.toLowerCase(),
          createdTime,
          // Prefer React fiber position, then visible rect, then accumulated offset
          coordX: posX !== null ? posX : (visibleRect.x !== 0 ? visibleRect.x : accOffsetLeft),
          coordY: posY !== null ? posY : (visibleRect.y !== 0 ? visibleRect.y : accOffsetTop),
        };
      });
    }).catch(() => []);
  }

  /**
   * Records a cryptographic audit entry in projects_data/projects/<id>/harvest_ledger.json.
   * Provides full provenance and proof of assignment for every harvested media card.
   */
  public async recordHarvestAudit(entry: {
    projectId?: string;
    sceneId: string;
    sceneTag: string;
    tileId?: string;
    sha256?: string;
    matchTier: string;
    matchScore: number;
    diskPath: string;
    mediaType: 'image' | 'video';
  }): Promise<void> {
    try {
      const pId = entry.projectId || 'default_project';
      const projectDir = projectStorage.getProjectDir(pId);
      await fs.ensureDir(projectDir);
      const ledgerFile = path.join(projectDir, 'harvest_ledger.json');
      let ledger: any[] = [];
      if (await fs.pathExists(ledgerFile)) {
        ledger = await fs.readJson(ledgerFile).catch(() => []);
      }
      ledger.push({
        ...entry,
        timestamp: new Date().toISOString(),
      });
      if (ledger.length > 500) ledger = ledger.slice(-500);
      await fs.writeJson(ledgerFile, ledger, { spaces: 2 });
    } catch (err: any) {
      console.warn('[FlowAutomator] Failed to record harvest audit:', err.message);
    }
  }

  /**
   * Helper: Saves candidate image (via fetch blob or screenshot) to output path on disk.
   */
  private async saveCandidateToDisk(page: Page, src: string, outputPath: string): Promise<boolean> {
    try {
      if (!src || src.trim().length < 5) return false;

      const harvestResult: any = await page.evaluate(async (srcToFetch: string) => {
        try {
          const res = await fetch(srcToFetch);
          const blob = await res.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result as string;
              resolve({
                status: 'ready',
                base64: dataUrl.replace(/^data:image\/\w+;base64,/, ''),
                src: srcToFetch,
              });
            };
            reader.onerror = () => resolve({ status: 'needs_canvas_shot', src: srcToFetch });
            reader.readAsDataURL(blob);
          });
        } catch {
          return { status: 'needs_canvas_shot', src: srcToFetch };
        }
      }, src);

      if (harvestResult?.status === 'ready' && harvestResult.base64) {
        const buf = Buffer.from(harvestResult.base64, 'base64');
        if (buf.length < 500) {
          console.warn(`[FlowAutomator] saveCandidateToDisk rejected: payload too small (${buf.length} bytes).`);
          return false;
        }
        const contentHash = crypto.createHash('sha256').update(buf).digest('hex');
        if (this.harvestedContentHashes.has(contentHash)) {
          console.warn(`[FlowAutomator] Duplicate image content detected (SHA-256: ${contentHash.slice(0, 10)}...). Refusing duplicate.`);
          return false;
        }
        this.harvestedContentHashes.add(contentHash);

        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeFile(outputPath, buf);
        return true;
      } else if (harvestResult?.status === 'needs_canvas_shot' && harvestResult.src) {
        const imgHandle = await page.evaluateHandle((srcToMatch: string) => {
          const imgs = Array.from(document.querySelectorAll('img'));
          return imgs.find((i) => i.src === srcToMatch || i.getAttribute('data-src') === srcToMatch) || null;
        }, harvestResult.src);

        const el = imgHandle.asElement();
        if (el) {
          await fs.ensureDir(path.dirname(outputPath));
          await el.screenshot({ path: outputPath, type: 'png' });
          const stat = await fs.stat(outputPath).catch(() => null);
          if (!stat || stat.size < 500) {
            await fs.remove(outputPath).catch(() => {});
            return false;
          }
          const shotBuf = await fs.readFile(outputPath).catch(() => null);
          if (shotBuf) {
            const shotHash = crypto.createHash('sha256').update(shotBuf).digest('hex');
            if (this.harvestedContentHashes.has(shotHash)) {
              console.warn(`[FlowAutomator] Duplicate screenshot image detected (SHA-256: ${shotHash.slice(0, 10)}...).`);
              await fs.remove(outputPath).catch(() => {});
              return false;
            }
            this.harvestedContentHashes.add(shotHash);
          }
          return true;
        }
      }
      return false;
    } catch (err) {
      console.warn('[FlowAutomator] saveCandidateToDisk error:', err);
      return false;
    }
  }

  /**
   * Helper: Extracts all completed video card candidates from Google Flow canvas.
   */
  private async extractCanvasVideoCards(page: Page): Promise<any[]> {
    return await page.evaluate(() => {
      const allVideos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];

      const validMedia = allVideos.filter((v) => {
        const src = v.src || v.currentSrc || (v.querySelector('source')?.src) || v.getAttribute('data-src') || '';
        if (!src || src.trim() === '' || src === 'about:blank') return false;

        const rect = v.getBoundingClientRect();
        const isMedia =
          src.includes('flow-content.google') ||
          src.includes('flow.google.com/asb') ||
          src.includes('media.getMediaUrlRedirect') ||
          src.includes('googleusercontent') ||
          src.startsWith('blob:') ||
          src.includes('.mp4') ||
          src.includes('.webm') ||
          src.startsWith('data:video');
        const hasSize = (v.videoWidth > 150 || rect.width > 100) && (v.videoHeight > 100 || rect.height > 60);
        return (isMedia || src.length > 5) && (hasSize || v.readyState >= 1);
      });

      // Filter out generating cards (strictly bounded to the card tile container)
      const completedOnly = validMedia.filter((v) => {
        let parent = v.parentElement;
        for (let lvl = 0; lvl < 8 && parent; lvl++) {
          if (
            parent.tagName === 'BODY' ||
            parent.tagName === 'MAIN' ||
            parent.classList?.contains('tile-row') ||
            parent.classList?.contains('virtual-scroll-container') ||
            parent.classList?.contains('virtual-item-container') ||
            parent.classList?.contains('cdk-virtual-scroll-viewport')
          ) {
            break;
          }
          const text = parent.innerText || '';
          if (/\b\d{1,2}%\b/.test(text) || text.includes('Generating') || text.includes('Creating') || text.includes('Rendering') || text.includes('Processing')) {
            return false;
          }
          if (parent.tagName === 'FLOW-GRID-TILE-CONTAINER' || parent.hasAttribute('data-tile-id')) {
            break;
          }
          parent = parent.parentElement;
        }
        return true;
      });

      return completedOnly.map((v) => {
        let parent = v.parentElement;
        let cardText = '';
        let tileId = '';
        let boundSceneId = '';
        let boundSceneTag = '';
        let createdTime: string | null = null;

        const tileContainer = v.closest('flow-grid-tile-container, flow-tile-container, [class*="tile-container"]');
        if (tileContainer) {
          const tcAria = tileContainer.getAttribute('aria-label') || '';
          const tcTitle = tileContainer.getAttribute('title') || '';
          const tcText = (tileContainer as HTMLElement).innerText || '';
          cardText += ` ${tcAria} ${tcTitle} ${tcText}`;
          tileId = tileContainer.getAttribute('data-vg-tile-id') || tileContainer.getAttribute('data-tile-id') || '';
          boundSceneId = tileContainer.getAttribute('data-vg-scene-id') || '';
          boundSceneTag = tileContainer.getAttribute('data-vg-scene-tag') || '';
        }

        for (let lvl = 0; lvl < 8 && parent; lvl++) {
          if (
            parent.tagName === 'BODY' ||
            parent.tagName === 'MAIN' ||
            parent.id === 'main-content' ||
            parent.classList?.contains('tile-row') ||
            parent.classList?.contains('virtual-scroll-container') ||
            parent.classList?.contains('virtual-item-container') ||
            parent.classList?.contains('cdk-virtual-scroll-viewport') ||
            (parent.className && typeof parent.className === 'string' && parent.className.includes('page-layout'))
          ) {
            break;
          }
          if (!tileId) {
            tileId = parent.getAttribute('data-vg-tile-id') || parent.getAttribute('data-tile-id') || '';
          }
          if (!boundSceneId) {
            boundSceneId = parent.getAttribute('data-vg-scene-id') || '';
          }
          if (!boundSceneTag) {
            boundSceneTag = parent.getAttribute('data-vg-scene-tag') || '';
          }
          const pText = parent.innerText || '';
          const pAria = parent.getAttribute('aria-label') || '';
          const pTitle = parent.getAttribute('title') || '';
          const pPrompt = parent.getAttribute('data-prompt') || '';
          const pRef = parent.getAttribute('data-ref') || '';
          cardText += ` ${pText} ${pAria} ${pTitle} ${pPrompt} ${pRef}`;

          if (!createdTime) {
            try {
              const rKey = Object.keys(parent).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
              if (rKey) {
                const fiber = (parent as any)[rKey];
                const p = fiber?.memoizedProps;
                if (p?.tile?.createdTime && typeof p.tile.createdTime === 'string') {
                  createdTime = p.tile.createdTime;
                } else if (p?.children?.props?.tile?.createdTime && typeof p.children.props.tile.createdTime === 'string') {
                  createdTime = p.children.props.tile.createdTime;
                }
              }
            } catch {}
          }

          const isBoundary = parent.tagName === 'FLOW-GRID-TILE-CONTAINER' || parent.hasAttribute('data-tile-id');
          parent = parent.parentElement;
          if (isBoundary) break;
        }

        const rect = v.getBoundingClientRect();
        const effectiveSrc = v.src || v.currentSrc || (v.querySelector('source')?.src) || v.getAttribute('data-src') || '';

        // Fallback to in-memory ledger if React virtualization stripped DOM attributes
        const win = window as any;
        if ((!boundSceneId || !boundSceneTag) && win.__CINEFLOW_LEDGER__) {
          if (tileId && win.__CINEFLOW_LEDGER__.has(tileId)) {
            const entry = win.__CINEFLOW_LEDGER__.get(tileId);
            if (!boundSceneId) boundSceneId = entry.sceneId;
            if (!boundSceneTag) boundSceneTag = entry.sceneTag;
          }
        }

        return {
          tileId,
          boundSceneId,
          boundSceneTag,
          src: effectiveSrc,
          duration: v.duration || 5,
          cardText: cardText.toLowerCase(),
          createdTime,
          coordX: rect.x,
          coordY: rect.y,
        };
      });
    }).catch(() => []);
  }

  /**
   * Helper: Saves candidate video stream to MP4 file on disk with multi-tier fallback.
   */
  private async saveVideoCandidateToDisk(page: Page, src: string, outputPath: string): Promise<boolean> {
    try {
      if (!src || src.trim().length < 5) return false;

      const harvestResult: any = await page.evaluate(async (srcToFetch: string) => {
        try {
          const res = await fetch(srcToFetch);
          if (!res.ok && res.status !== 200 && res.status !== 0) {
            throw new Error(`Fetch status ${res.status}`);
          }
          const blob = await res.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result as string;
              resolve({
                status: 'ready',
                base64: dataUrl.replace(/^data:video\/\w+;base64,/, '').replace(/^data:application\/\w+;base64,/, '').replace(/^data:.*?;base64,/, ''),
                src: srcToFetch,
              });
            };
            reader.onerror = () => resolve({ status: 'error', src: srcToFetch });
            reader.readAsDataURL(blob);
          });
        } catch (fetchErr) {
          // Fallback: If blob URL was revoked, attempt to find matching <video> element and extract via canvas capture or refreshed currentSrc
          try {
            const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
            const matchingVideo = videos.find((v) => v.src === srcToFetch || v.currentSrc === srcToFetch || (v.querySelector('source')?.src) === srcToFetch);
            if (matchingVideo && matchingVideo.currentSrc && matchingVideo.currentSrc !== srcToFetch) {
              const freshRes = await fetch(matchingVideo.currentSrc);
              const freshBlob = await freshRes.blob();
              return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const dataUrl = reader.result as string;
                  resolve({
                    status: 'ready',
                    base64: dataUrl.replace(/^data:video\/\w+;base64,/, '').replace(/^data:.*?;base64,/, ''),
                    src: matchingVideo.currentSrc,
                  });
                };
                reader.onerror = () => resolve({ status: 'error', src: srcToFetch });
                reader.readAsDataURL(freshBlob);
              });
            }
          } catch {}
          return { status: 'error', src: srcToFetch };
        }
      }, src);

      if (harvestResult?.status === 'ready' && harvestResult.base64 && harvestResult.base64.length > 500) {
        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeFile(outputPath, Buffer.from(harvestResult.base64, 'base64'));
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[FlowAutomator] saveVideoCandidateToDisk error:', err);
      return false;
    }
  }

  /**
   * Ensures the requested mode (Image vs Video / Veo) is active on Google Flow.
   */
  private async ensureMode(page: Page, mode: 'image' | 'video'): Promise<boolean> {
    return await page.evaluate((targetMode: string) => {
      // Exclude sidebar navigation elements and canvas card nodes
      const allElements = (Array.from(document.querySelectorAll('button, div[role="tab"], div[role="button"], span')) as HTMLElement[]).filter((el) => {
        const rect = el.getBoundingClientRect();
        const inSidebarOrHeader = el.closest('nav, aside, header') || rect.left < 200;
        const inCanvasCard = el.closest('[data-tile-id], .react-flow__node, [data-testid*="node"], [data-testid*="tile"], [role="menu"]');
        return !inSidebarOrHeader && !inCanvasCard && rect.top > window.innerHeight * 0.35;
      });

      if (targetMode === 'video') {
        const videoBtn = allElements.find((el) => {
          const text = (el.innerText || el.getAttribute('aria-label') || '').toLowerCase().trim();
          return text === 'video' || text === 'veo' || text === 'veo 2' || text.includes('text to video') || text.includes('video mode');
        });
        if (videoBtn && !videoBtn.classList.contains('active') && videoBtn.getAttribute('aria-selected') !== 'true') {
          videoBtn.click();
          return true;
        }
      } else {
        const imageBtn = allElements.find((el) => {
          const text = (el.innerText || el.getAttribute('aria-label') || '').toLowerCase().trim();
          return text === 'image' || text === 'imagen' || text === 'imagen 3' || text.includes('text to image') || text.includes('image mode');
        });
        if (imageBtn && !imageBtn.classList.contains('active') && imageBtn.getAttribute('aria-selected') !== 'true') {
          imageBtn.click();
          return true;
        }
      }
      return false;
    }, mode).catch(() => false);
  }

  /**
   * Scrapes the user's available credits from Google Flow (from top bar, user profile, or banner).
   * Strictly differentiates between account balance and per-prompt generation cost.
   */
  public async scrapeAccountCredits(page: Page): Promise<{ credits: number | null; creditsText: string | null; email: string | null }> {
    try {
      return await page.evaluate(() => {
        let email: string | null = null;
        const profileElements = Array.from(document.querySelectorAll('[aria-label*="@"], [title*="@"], img[alt*="@"]')) as HTMLElement[];
        for (const el of profileElements) {
          const match = (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || '').match(/[\w.-]+@[\w.-]+\.\w+/);
          if (match) {
            email = match[0];
            break;
          }
        }

        // Search candidate elements, prioritizing headers and navigation banners
        const bannerElements = Array.from(document.querySelectorAll('header *, [role="banner"] *, nav *, [aria-label*="credit" i]')) as HTMLElement[];
        const generalElements = Array.from(document.querySelectorAll('button *, div, span, p')) as HTMLElement[];
        const allCandidates = [...bannerElements, ...generalElements];

        let credits: number | null = null;
        let creditsText: string | null = null;

        for (const el of allCandidates) {
          const text = (el.innerText || '').trim();
          if (!text) continue;

          // Reject per-prompt generation cost strings
          const isCostText =
            /use\s+\d+\s+credits?/i.test(text) ||
            /generating\s+will\s+use/i.test(text) ||
            /cost:\s*\d+/i.test(text) ||
            /per\s+(?:prompt|generation|video|image)/i.test(text);

          if (isCostText) continue;

          // Match balance expressions like "1,420 Credits", "Credits: 1,420", "1420 credits remaining"
          const creditMatch = text.match(/^([\d,]+)\s*credits?$/i) ||
                             text.match(/credits?:\s*([\d,]+)/i) ||
                             text.match(/([\d,]+)\s*credits?\s*(?:remaining|left|available)/i) ||
                             text.match(/([\d,]+)\s*credits?/i);

          if (creditMatch && creditMatch[1]) {
            const parsed = parseInt(creditMatch[1].replace(/,/g, ''), 10);
            if (!isNaN(parsed) && parsed >= 0) {
              // Avoid zero or trivial 1-digit numbers matching unrelated icons unless in banner
              const inBanner = el.closest('header, [role="banner"], nav');
              if (parsed > 0 || inBanner) {
                credits = parsed;
                creditsText = `${creditMatch[1]} Credits`;
                break;
              }
            }
          }
        }

        return { credits, creditsText, email };
      });
    } catch {
      return { credits: null, creditsText: null, email: null };
    }
  }

  /**
   * Applies duration, model, aspect ratio, and batch count settings in Google Flow.
   */
  public async applyFlowSettings(
    page: Page,
    settings: FlowGenerationSettings,
    force: boolean = false
  ): Promise<{ success: boolean; creditCost?: number; error?: string }> {
    try {
      const pageUrl = page.url();
      const settingsKey = `${pageUrl}::${settings.mode}::${settings.aspectRatio}::${settings.videoModel || settings.imageModel || ''}::${settings.videoDuration || ''}::${settings.batchCount || ''}`;

      // 0. Cache Check: If settings were already applied to this canvas, skip completely!
      if (!force && this.lastAppliedSettingsMap.get(pageUrl) === settingsKey) {
        return { success: true };
      }

      // Fast in-DOM inspection: If the settings trigger pill already reflects the target settings, skip opening popover!
      const isAlreadyMatching = await page.evaluate((s) => {
        const pill = document.querySelector('button[aria-label*="Settings trigger" i]') ||
          Array.from(document.querySelectorAll('button')).find((b) => {
            const t = (b.innerText || '').toLowerCase();
            return t.includes('banana') || t.includes('veo') || t.includes('imagen') || t.includes('omni') || t.includes('crop_');
          });

        if (!pill) return false;
        const pillText = ((pill as any).innerText || pill.textContent || '').toLowerCase();

        // Check ratio match (e.g. "16:9" or "crop_16_9")
        const targetRatio = (s.aspectRatio || '16:9').replace(':', '_');
        const hasRatio = pillText.includes(targetRatio) || pillText.includes(s.aspectRatio || '16:9');

        // Check model match
        const modelTarget = (s.videoModel || s.imageModel || '').toLowerCase();
        let hasModel = true;
        if (modelTarget) {
          if (modelTarget.includes('flash') || modelTarget.includes('nano') || modelTarget.includes('banana')) {
            hasModel = pillText.includes('banana') || pillText.includes('flash') || pillText.includes('nano');
          } else if (modelTarget.includes('veo')) {
            hasModel = pillText.includes('veo');
          } else if (modelTarget.includes('imagen')) {
            hasModel = pillText.includes('imagen');
          }
        }

        // Check batch count match (e.g. "x1", "x2")
        const hasBatch = s.batchCount ? pillText.includes(s.batchCount.toLowerCase()) : true;

        return hasRatio && hasModel && hasBatch;
      }, settings).catch(() => false);

      if (isAlreadyMatching && !force) {
        this.lastAppliedSettingsMap.set(pageUrl, settingsKey);
        return { success: true };
      }

      console.log(`[FlowAutomator] Applying settings to canvas: mode=${settings.mode}, ratio=${settings.aspectRatio}, model=${settings.videoModel || settings.imageModel}, duration=${settings.videoDuration}, batch=${settings.batchCount}`);

      // 1. Ensure the bottom settings popover is open
      let isPopoverOpen = await page.evaluate(() => {
        const popover = document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper], div[class*="popover"]');
        if (popover) {
          const t = (popover as HTMLElement).innerText || '';
          if (t.includes('Aspect Ratio') || t.includes('Model') || t.includes('Duration') || t.includes('Batch') || t.includes('Generating will use') || t.includes('credits')) {
            return true;
          }
        }
        const textElements = Array.from(document.querySelectorAll('div, button, span')) as HTMLElement[];
        return textElements.some((el) => {
          if (el.closest('[data-tile-id], .react-flow__node')) return false;
          const text = el.innerText || '';
          return (
            (text.includes('Omni Flash') || text.includes('Veo 3.1') || text.includes('Veo 2') || text.includes('Nano Banana') || text.includes('Banana')) &&
            (text.includes('4s') || text.includes('6s') || text.includes('8s') || text.includes('10s') || text.includes('Generating will use'))
          );
        });
      });

      if (!isPopoverOpen) {
        // Find the settings pill strictly inside the bottom prompt bar (NEVER touch canvas card buttons)
        const clickedPill = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, div[role="button"]')) as HTMLElement[];
          const bottomButtons = buttons.filter((b) => {
            const rect = b.getBoundingClientRect();
            const inSidebarOrHeader = b.closest('nav, aside, header') || rect.left < 200;
            // STRICT: Must NEVER be inside a canvas tile, node, menu, or modal
            const inCanvasCard = b.closest('[data-tile-id], .react-flow__node, [data-testid*="node"], [data-testid*="tile"], [role="menu"], [role="dialog"]');
            // The prompt toolbar is pinned to the bottom of the viewport
            const atBottomBar = rect.bottom > window.innerHeight - 90;
            return !inSidebarOrHeader && !inCanvasCard && atBottomBar;
          });
          
          const settingsPill = bottomButtons.find((b) => {
            const text = (b.innerText || '').trim();
            const aria = (b.getAttribute('aria-label') || b.getAttribute('title') || '').toLowerCase();
            
            // Strictly exclude generate/submit or media picker buttons
            if (aria.includes('generate') || aria.includes('submit') || aria.includes('send') || aria.includes('create') || aria.includes('add media') || text.includes('Create')) {
              return false;
            }

            return (
              text.includes('·') ||
              text.includes('Nano Banana') ||
              text.includes('Banana') ||
              text.includes('Omni Flash') ||
              text.includes('Veo') ||
              text.includes('Imagen') ||
              text.includes('Image ·') ||
              text.includes('Video ·') ||
              text.includes('16:9') ||
              text.includes('9:16') ||
              text.includes('720p') ||
              text.includes('1080p') ||
              text.includes('4s') ||
              text.includes('6s') ||
              text.includes('8s') ||
              text.includes('10s')
            );
          });

          if (settingsPill) {
            settingsPill.click();
            return true;
          }
          return false;
        });

        if (clickedPill) {
          // Poll for popover to render
          for (let pCheck = 0; pCheck < 5; pCheck++) {
            await new Promise((r) => setTimeout(r, 200));
            isPopoverOpen = await page.evaluate(() => {
              const text = document.body?.innerText || '';
              return text.includes('Omni Flash') || text.includes('Veo 3.1') || text.includes('Banana') || text.includes('Generating will use');
            });
            if (isPopoverOpen) break;
          }
        }
      }

      // 2. Select Image vs Video mode (strictly excluding sidebar and canvas card nodes)
      await page.evaluate((targetMode: string) => {
        const buttons = (Array.from(document.querySelectorAll('button, div[role="tab"], div[role="button"]')) as HTMLElement[]).filter(
          (b) => !b.closest('nav, aside, header, [data-tile-id], .react-flow__node, [data-testid*="node"], [data-testid*="tile"]') && b.getBoundingClientRect().left >= 200
        );
        if (targetMode === 'video') {
          const videoBtn = buttons.find((b) => {
            const text = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase().trim();
            return text === 'video' || text.includes('text to video') || text === 'veo';
          });
          if (videoBtn && !videoBtn.classList.contains('active') && videoBtn.getAttribute('aria-selected') !== 'true') {
            videoBtn.click();
          }
        } else {
          const imageBtn = buttons.find((b) => {
            const text = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase().trim();
            return text === 'image' || text.includes('text to image') || text === 'imagen';
          });
          if (imageBtn && !imageBtn.classList.contains('active') && imageBtn.getAttribute('aria-selected') !== 'true') {
            imageBtn.click();
          }
        }
      }, settings.mode);
      await new Promise((r) => setTimeout(r, 350));

      // 3. Select Aspect Ratio (9:16 vs 16:9)
      if (settings.aspectRatio) {
        await page.evaluate((targetRatio: string) => {
          const buttons = (Array.from(document.querySelectorAll('button, div[role="button"], div[role="tab"]')) as HTMLElement[]).filter(
            (b) => !b.closest('nav, aside, header, [data-tile-id], .react-flow__node, [data-testid*="node"], [data-testid*="tile"]') && b.getBoundingClientRect().left >= 200
          );
          const ratioBtn = buttons.find((b) => {
            const text = (b.innerText || b.getAttribute('aria-label') || '').trim();
            return text.includes(targetRatio) || text === targetRatio;
          });
          if (ratioBtn) {
            ratioBtn.click();
          }
        }, settings.aspectRatio);
        await new Promise((r) => setTimeout(r, 250));
      }

      // 4. Select Video Model if in video mode
      if (settings.mode === 'video' && settings.videoModel) {
        const openedDropdown = await page.evaluate(async (targetModel: string) => {
          const allElements = (Array.from(document.querySelectorAll('button, div[role="button"], div[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"]')) as HTMLElement[]).filter(
            (b) => !b.closest('nav, aside, header, [data-tile-id], .react-flow__node, [data-testid*="node"], [data-testid*="tile"]') && b.getBoundingClientRect().left >= 200
          );
          
          const dropdownTrigger = allElements.find((el) => {
            const text = el.innerText || '';
            return text.includes('Omni Flash') || text.includes('Veo 3.1') || text.includes('Lite') || text.includes('Fast') || text.includes('Quality');
          });

          if (dropdownTrigger) {
            const currentText = dropdownTrigger.innerText || '';
            if (currentText.toLowerCase().includes(targetModel.toLowerCase())) {
              return true; // Already selected
            }
            dropdownTrigger.click();
            return false; // Triggered open
          }
          return true;
        }, settings.videoModel);

        if (!openedDropdown) {
          // Wait for menu items to appear
          await new Promise((r) => setTimeout(r, 350));
          await page.evaluate((targetModel: string) => {
            const menuItems = (Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], div[role="button"], button, span')) as HTMLElement[]).filter(
              (b) => !b.closest('nav, aside, header, [data-tile-id], .react-flow__node, [data-testid*="node"], [data-testid*="tile"]') && b.getBoundingClientRect().left >= 200
            );
            const targetItem = menuItems.find((el) => {
              const text = (el.innerText || '').toLowerCase().trim();
              return text === targetModel.toLowerCase() || text.includes(targetModel.toLowerCase());
            });
            if (targetItem) {
              targetItem.click();
            }
          }, settings.videoModel);
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      // 5. Select Duration (4s, 6s, 8s, 10s)
      if (settings.mode === 'video' && settings.videoDuration) {
        await page.evaluate((targetDur: string) => {
          const buttons = (Array.from(document.querySelectorAll('button, div[role="button"], div[role="tab"]')) as HTMLElement[]).filter(
            (b) => !b.closest('nav, aside, header, [data-tile-id], .react-flow__node, [data-testid*="node"], [data-testid*="tile"]') && b.getBoundingClientRect().left >= 200
          );
          const durBtn = buttons.find((b) => {
            const text = (b.innerText || '').trim().toLowerCase();
            return text === targetDur.toLowerCase();
          });
          if (durBtn) {
            durBtn.click();
          }
        }, settings.videoDuration);
        await new Promise((r) => setTimeout(r, 250));
      }

      // 6. Select Batch Count (x1, x2, x3, x4)
      if (settings.batchCount) {
        await page.evaluate((targetBatch: string) => {
          const buttons = (Array.from(document.querySelectorAll('button, div[role="button"], div[role="tab"]')) as HTMLElement[]).filter(
            (b) => !b.closest('nav, aside, header, [data-tile-id], .react-flow__node, [data-testid*="node"], [data-testid*="tile"]') && b.getBoundingClientRect().left >= 200
          );
          const batchBtn = buttons.find((b) => {
            const text = (b.innerText || '').trim().toLowerCase();
            return text === targetBatch.toLowerCase() || text === targetBatch.replace('x', '');
          });
          if (batchBtn) {
            batchBtn.click();
          }
        }, settings.batchCount);
        await new Promise((r) => setTimeout(r, 250));
      }

      // 7. Settle delay: Give React 400ms to calculate and update credit cost in footer
      await new Promise((r) => setTimeout(r, 400));
      const creditCost = await page.evaluate(() => {
        const textElements = Array.from(document.querySelectorAll('p, span, div, a')) as HTMLElement[];
        for (const el of textElements) {
          const text = el.innerText || '';
          const match = text.match(/use\s+(\d+)\s+credits?/i);
          if (match && match[1]) {
            return parseInt(match[1], 10);
          }
        }
        return null;
      });

      // 8. Close settings popover cleanly by pressing Escape
      await page.keyboard.press('Escape').catch(() => {});
      await new Promise((r) => setTimeout(r, 200));

      this.lastAppliedSettingsMap.set(pageUrl, settingsKey);
      return { success: true, creditCost: creditCost || undefined };
    } catch (err: any) {
      console.warn('[FlowAutomator] applyFlowSettings warning:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Health check on http://127.0.0.1:<port>/json/version before invoking puppeteer.connect
   */
  public checkPortStatus(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        {
          host: '127.0.0.1',
          port,
          path: '/json/version',
          timeout: 1500,
        },
        (res) => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            resolve(false);
          }
          res.resume();
        }
      );

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Spawns an external Chrome window with remote debugging enabled on the specified port.
   */
  public async launchChromeInstance(port: number): Promise<boolean> {
    const defaultChromePaths: Record<string, string[]> = {
      win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      ],
      darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
      linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser'],
    };

    const candidates = defaultChromePaths[process.platform] || [];
    let chromePath = '';
    for (const p of candidates) {
      if (p && (await fs.pathExists(p))) {
        chromePath = p;
        break;
      }
    }

    if (!chromePath) {
      console.error('[FlowAutomator] Chrome executable not found.');
      return false;
    }

    const profileDir = path.join(process.cwd(), 'projects_data', 'chrome_profiles', `profile_${port}`);
    await fs.ensureDir(profileDir);

    // Clean up dead zombie Chrome lock files from previous crashes to prevent "profile in use" hangs
    for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      const lockPath = path.join(profileDir, lock);
      if (await fs.pathExists(lockPath)) {
        await fs.remove(lockPath).catch(() => {});
      }
    }

    // If port is already responding, check if we can simply bring the Flow tab to the front
    const isAlreadyAlive = await this.checkPortStatus(port);
    if (isAlreadyAlive) {
      try {
        const connected = await this.connectPort(port);
        if (connected) {
          const browser = this.browsers.get(port);
          if (browser) {
            const pages = await browser.pages().catch(() => []);
            let flowPage = pages.find((p) => isFlowProjectUrl(p.url())) || pages.find((p) => isFlowUrl(p.url()));
            if (flowPage) {
              await flowPage.bringToFront().catch(() => {});
              return true;
            } else {
              flowPage = await browser.newPage().catch(() => null);
              if (flowPage) {
                await flowPage.goto('https://flow.google.com/').catch(() => {});
                return true;
              }
            }
          }
        }
      } catch {}
      // If we couldn't interact with the existing process, terminate ghost handle so a fresh window opens
      await this.closeInstance(port);
      await new Promise((r) => setTimeout(r, 600));
    }

    console.log(`[FlowAutomator] Launching Chrome on port ${port}...`);
    console.log(`[FlowAutomator] Exe: ${chromePath}`);
    console.log(`[FlowAutomator] Profile: ${profileDir}`);

    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-mode',
      '--disable-sync',
      '--disable-features=WebAccountManager,AccountConsistency',
      '--window-size=1440,900',
      '--start-maximized',
      'https://flow.google.com/',
    ];

    const proc = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();

    console.log(`[FlowAutomator] Waiting for Chrome to bind port :${port}...`);
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 600));
      const ok = await this.checkPortStatus(port);
      if (ok) {
        console.log(`[FlowAutomator] ✓ Chrome successfully ready on port :${port}`);
        await this.connectPort(port);
        return true;
      }
    }

    console.warn(`[FlowAutomator] Timeout waiting for Chrome to bind port :${port}`);
    return false;
  }

  /**
   * Connects Puppeteer to the given port.
   */
  public async connectPort(port: number): Promise<boolean> {
    const isAlive = await this.checkPortStatus(port);
    if (!isAlive) {
      console.warn(`[FlowAutomator] Cannot connect: Port ${port} is not responding.`);
      this.browsers.delete(port);
      return false;
    }

    try {
      if (this.browsers.has(port)) {
        try {
          this.browsers.get(port)?.disconnect();
        } catch {}
        this.browsers.delete(port);
      }

      const browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${port}`,
        defaultViewport: null,
      });

      this.browsers.set(port, browser);
      this.rateLimitedPorts.delete(port); // Fresh connect clears any stale rate limit cooldown
      console.log(`[FlowAutomator] ✓ Connected successfully to Chrome on :${port}`);

      browser.on('disconnected', () => {
        console.warn(`[FlowAutomator] Chrome disconnected on port :${port}`);
        this.browsers.delete(port);
        this.activeWorkers.delete(port);
      });

      return true;
    } catch (err: any) {
      console.error(`[FlowAutomator] Failed to connect to port ${port}:`, err.message);
      this.browsers.delete(port);
      this.activeWorkers.delete(port);
      return false;
    }
  }

  /**
   * Helper to find or open the Google Flow tab in the browser.
   */
  private async acquirePage(browser: Browser, port: number): Promise<Page | null> {
    try {
      const pages = await browser.pages();
      // Prioritize active project canvas first, then any Flow tab (excluding auth/API endpoints)
      let page = pages.find((p) => isFlowProjectUrl(p.url())) || pages.find((p) => isFlowUrl(p.url()));

      if (!page) {
        if (pages.length > 0 && pages[0].url() === 'about:blank') {
          page = pages[0];
          await page.goto('https://flow.google.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        } else {
          page = await browser.newPage();
          await page.goto('https://flow.google.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        }
      }

      await page.bringToFront().catch(() => {});
      const outerDims = await page.evaluate(() => ({
        w: window.outerWidth || 1920,
        h: window.outerHeight || 1080,
      })).catch(() => ({ w: 1920, h: 1080 }));

      await page.setViewport({
        width: Math.max(1280, outerDims.w),
        height: Math.max(720, outerDims.h - 100),
        deviceScaleFactor: 1,
      }).catch(() => {});

      // Ensure content container is never hidden by stray menu selectors
      await page.evaluate(() => {
        const el = document.querySelector('.content-container') as HTMLElement | null;
        if (el && el.style.display === 'none') {
          el.style.display = '';
        }
      }).catch(() => {});

      // Check if page crashed with React "Application error"
      const isCrashed = await page.evaluate(() => {
        return document.body?.innerText?.includes('Application error') ||
               document.body?.innerText?.includes('client-side exception');
      }).catch(() => false);

      if (isCrashed) {
        console.warn(`[FlowAutomator :${port}] Google Flow tab is on Application Error crash screen. Auto-reloading...`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 3000));
      }

      // If on the projects list page, enter the active or new project
      const curUrl = page.url();
      if (
        curUrl === 'https://flow.google.com' ||
        curUrl === 'https://flow.google.com/' ||
        curUrl.startsWith('https://flow.google.com/projects') ||
        curUrl === 'https://labs.google/fx/tools/flow' ||
        curUrl === 'https://labs.google/fx/tools/flow/'
      ) {
        await page.evaluate(() => {
          const projLink = (document.querySelector('a[href*="/project/"]') ||
                           Array.from(document.querySelectorAll('button')).find((b) => (b.innerText || '').includes('New project'))) as HTMLElement;
          if (projLink) projLink.click();
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2000));
      }

      // If currently on the /tools page, navigate back to the main project canvas
      if (page.url().includes('/project/') && page.url().includes('/tools')) {
        const cleanCanvasUrl = page.url().replace(/\/tools(?:\/.*)?$/, '');
        console.log(`[FlowAutomator :${port}] Google Flow tab is on /tools. Navigating to project canvas: ${cleanCanvasUrl}`);
        await page.goto(cleanCanvasUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2000));
      }

      return page;
    } catch (err: any) {
      console.error(`[FlowAutomator :${port}] Error acquiring active page:`, err.message);
      return null;
    }
  }

  /**
   * Starts an independent background worker loop for the given port if one isn't already active.
   */
  public startWorkerForPort(port: number): void {
    if (this.activeWorkers.has(port)) return;
    const browser = this.browsers.get(port);
    if (!browser || !browser.isConnected()) return;

    // Check if port is in rate-limit cooldown
    const rateLimitExpiry = this.rateLimitedPorts.get(port);
    if (rateLimitExpiry && Date.now() < rateLimitExpiry) {
      console.log(`[FlowAutomator :${port}] Port ${port} is in usage limit cooldown (${Math.round((rateLimitExpiry - Date.now()) / 1000)}s remaining).`);
      return;
    }

    this.activeWorkers.add(port);
    this.isProcessing = true;
    console.log(`[FlowAutomator :${port}] ▶️ Started browser worker for port ${port}. Active workers: ${this.activeWorkers.size}`);

    this.runBrowserWorker(port)
      .catch((err) => console.error(`[FlowAutomator :${port}] Worker error:`, err.message))
      .finally(() => {
        this.activeWorkers.delete(port);
        console.log(`[FlowAutomator :${port}] ⏹️ Worker finished for port ${port}. Remaining workers: ${this.activeWorkers.size}`);
        if (this.activeWorkers.size === 0 && this.queue.length === 0) {
          this.isProcessing = false;
          console.log('[FlowAutomator] Automation processing cycle completed.');
        }
      });
  }

  /**
   * Submits a list of generation jobs into the central queue and initiates workers.
   */
  public async submitJobs(jobs: AutomationJob[]): Promise<void> {
    // Clear pause and cooldowns on explicit user submission / retry
    this.isPaused = false;
    this.rateLimitedPorts.clear();

    const incomingCompoundKeys = new Set(jobs.map((j) => `${j.projectId || 'default'}::${j.sceneId}`));
    // Remove any stale queue entries for these exact project scenes
    this.queue = this.queue.filter((q) => !incomingCompoundKeys.has(`${q.projectId || 'default'}::${q.sceneId}`));

    // Reset retry counts and push fresh jobs
    for (const job of jobs) {
      (job as any).retryCount = 0;
      this.queue.push(job);
    }
    console.log(`[FlowAutomator] Enqueued ${jobs.length} jobs (fresh retry states). Total queue: ${this.queue.length}`);

    // Connect any configured ports that are responding
    for (const port of this.ports) {
      if (!this.browsers.has(port)) {
        await this.connectPort(port).catch(() => false);
      }
    }

    // Check if at least one browser is connected
    const anyConnected = Array.from(this.browsers.values()).some((b) => b.isConnected());
    if (!anyConnected) {
      console.warn('[FlowAutomator] No active Chrome ports available. Attempting launch on 9222...');
      const launched = await this.launchChromeInstance(9222);
      if (launched) {
        await this.connectPort(9222);
      }
    }

    // Launch worker for every connected port that isn't already working
    for (const port of this.ports) {
      const browser = this.browsers.get(port);
      if (browser && browser.isConnected()) {
        this.startWorkerForPort(port);
      }
    }
  }

  /**
   * Dedicated Browser Worker: Handles 1x Solo (1-by-1) or Parallel (up to maxConcurrency)
   * with guaranteed two-way scene reference tag correlation and disconnect recovery.
   */
  private async runBrowserWorker(port: number): Promise<void> {
    let browser = this.browsers.get(port);
    if (!browser) {
      await this.connectPort(port);
      browser = this.browsers.get(port);
    }
    if (!browser) return;

    let page = await this.acquirePage(browser, port);
    if (!page) return;

    const inFlight = this.inFlightMap.get(port) || [];
    this.inFlightMap.set(port, inFlight);

    while (this.queue.length > 0 || inFlight.length > 0) {
      // If this port hit an account usage limit, break worker loop so another browser can work
      const expiry = this.rateLimitedPorts.get(port);
      if (expiry && Date.now() < expiry) {
        console.log(`[FlowAutomator :${port}] Port ${port} is in usage limit cooldown. Pausing this browser worker.`);
        break;
      }

      // 0. Pause Handler: While paused, do NOT inject new prompts into the editor!
      // In-flight cards already on the canvas can still be cleanly polled and harvested.
      while (this.isPaused) {
        if (inFlight.length > 0 && page && !page.isClosed()) {
          const completedScenes = await this.pollAndHarvestReadyCards(page, inFlight).catch(() => []);
          if (completedScenes.length > 0) {
            const remaining = inFlight.filter((c) => !completedScenes.includes(c.job.sceneId));
            inFlight.length = 0;
            inFlight.push(...remaining);
            this.inFlightMap.set(port, inFlight);
          }
        }
        await new Promise((r) => setTimeout(r, 600));
        if (this.queue.length === 0 && inFlight.length === 0) break;
      }

      if (this.queue.length === 0 && inFlight.length === 0) break;

      // Auto-reconnect check if Chrome session was temporarily disconnected (BUG 6-B fix)
      if (!browser || !browser.isConnected() || !page || page.isClosed()) {
        console.warn(`[FlowAutomator :${port}] Connection lost. Attempting auto-reconnect...`);
        let reconnected = false;
        for (let rAttempt = 0; rAttempt < 3; rAttempt++) {
          await new Promise((r) => setTimeout(r, 2000));
          reconnected = await this.connectPort(port);
          if (reconnected) {
            browser = this.browsers.get(port);
            if (browser) {
              page = await this.acquirePage(browser, port);
              if (page && !page.isClosed()) {
                console.log(`[FlowAutomator :${port}] ✓ Successfully reconnected to Chrome session.`);
                break;
              }
            }
          }
        }

        if (!reconnected || !page || page.isClosed()) {
          console.error(`[FlowAutomator :${port}] Chrome session could not be recovered. Re-queuing ${inFlight.length} in-flight jobs...`);
          for (const inf of inFlight) {
            this.queue.unshift(inf.job);
          }
          inFlight.length = 0;
          this.inFlightMap.set(port, inFlight);
          break;
        }
      }

      // 1. If in-flight window is full, WAIT to pull at least 1 image/video before sending more!
      while (inFlight.length >= this.maxConcurrentPerBrowser) {
        const isVideoBatch = inFlight.some((c) => c.job.mediaType === 'video');
        console.log(`[FlowAutomator :${port}] In-flight window full (${inFlight.length}/${this.maxConcurrentPerBrowser}). Waiting for ${isVideoBatch ? 'video (Veo)' : 'image'} generation & harvest...`);
        await new Promise((r) => setTimeout(r, 2000));

        if (page && !page.isClosed()) {
          const completedScenes = await this.pollAndHarvestReadyCards(page, inFlight);
          if (completedScenes.length > 0) {
            const remaining = inFlight.filter((c) => !completedScenes.includes(c.job.sceneId));
            inFlight.length = 0;
            inFlight.push(...remaining);
            this.inFlightMap.set(port, inFlight);
            console.log(`[FlowAutomator :${port}] ✓ Successfully harvested ${completedScenes.length} scene media item(s)! Remaining in flight: ${inFlight.length}`);
            
            // Clean delay for Solo mode before next prompt injection
            if (this.maxConcurrentPerBrowser === 1) {
              await new Promise((r) => setTimeout(r, 1500));
            }
            break;
          }
        }

        // Timeout check for stuck jobs (> 240s for videos, > 150s for images)
        const now = Date.now();
        const timedOut = inFlight.filter((c) => {
          const limit = c.job.mediaType === 'video' ? 240000 : 150000;
          return now - c.submittedAt > limit;
        });
        if (timedOut.length > 0) {
          for (const dead of timedOut) {
            console.warn(`[FlowAutomator :${port}] Generation timed out for scene ${dead.job.sceneId} (${dead.job.mediaType || 'image'})`);
            this.onJobProgress?.(dead.job.sceneId, 'error', undefined, 'Google Flow generation timed out.', dead.job.mediaType === 'video' ? 'video' : 'image', dead.job.projectId);
          }
          const remaining = inFlight.filter((c) => {
            const limit = c.job.mediaType === 'video' ? 240000 : 150000;
            return now - c.submittedAt <= limit;
          });
          inFlight.length = 0;
          inFlight.push(...remaining);
          this.inFlightMap.set(port, inFlight);
          
          // Add cooldown after timeout to allow browser to recover (BUG 4-A fix)
          await new Promise((r) => setTimeout(r, 2000));
          break;
        }
      }

      // 2. If room is available in window and queue has items, send ONE tagged prompt cleanly
      if (this.queue.length > 0 && inFlight.length < this.maxConcurrentPerBrowser) {
        // Project-Affinity Dispatch: Prefer jobs belonging to the project this worker/port is already generating
        let jobIdx = -1;
        const currentActiveProjectId = inFlight[0]?.job.projectId;
        if (currentActiveProjectId) {
          jobIdx = this.queue.findIndex((j) => j.projectId === currentActiveProjectId);
        }
        if (jobIdx === -1) {
          const otherPortActiveProjectIds = new Set(
            Array.from(this.inFlightMap.entries())
              .filter(([p]) => p !== port)
              .flatMap(([_, cards]) => cards.map((c) => c.job.projectId).filter(Boolean))
          );
          jobIdx = this.queue.findIndex((j) => !otherPortActiveProjectIds.has(j.projectId));
          if (jobIdx === -1) jobIdx = 0;
        }

        const job = this.queue.splice(jobIdx, 1)[0];
        if (job) {
          this.onJobProgress?.(job.sceneId, 'generating', undefined, undefined, job.mediaType === 'video' ? 'video' : 'image', job.projectId);

          // Check page liveness and bring Google Flow canvas to front
          if (!page || page.isClosed() || !browser?.isConnected()) {
            page = browser ? await this.acquirePage(browser, port) : null;
          }
          if (page && !page.isClosed()) {
            await page.bringToFront().catch(() => {});
            // If the tab navigated to /tools or a subpage, navigate back to the project canvas
            if (page.url().includes('/project/') && page.url().includes('/tools')) {
              const cleanCanvasUrl = page.url().replace(/\/tools(?:\/.*)?$/, '');
              console.log(`[FlowAutomator :${port}] Google Flow tab is on /tools before job submission. Restoring canvas: ${cleanCanvasUrl}`);
              await page.goto(cleanCanvasUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
              await new Promise((r) => setTimeout(r, 2000));
            }
          }
          if (!page || page.isClosed()) {
            console.warn(`[FlowAutomator :${port}] Page unavailable, re-queuing scene ${job.sceneId}`);
            this.queue.unshift(job);
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }

          // Generate unique non-colliding scene reference tag incorporating timecode + project hash
          const sceneTag = generateSceneTag(job.sceneId, job.prompt, job.projectId);
          const taggedPrompt = job.prompt.includes('[REF:')
            ? job.prompt
            : `[REF:${sceneTag}] ${job.prompt.trim()}`;

          // Snapshot existing media URLs and mark all existing canvas tile containers as known before submission
          const initialUrls: string[] = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img, video')) as (HTMLImageElement | HTMLVideoElement)[];
            const urls = imgs.map((i) => (i as HTMLImageElement).src || (i as HTMLVideoElement).currentSrc || '');

            const tiles = Array.from(document.querySelectorAll('flow-grid-tile-container, flow-tile-container, [class*="tile-container"]'));
            for (const t of tiles) {
              t.setAttribute('data-vg-known', 'true');
            }

            return urls;
          }).catch(() => []);

          // Wake up canvas and keep camera centered so newly spawned card is visible in real-time
          if (page && !page.isClosed()) {
            await this.wakeAndCenterCanvas(page);
            await new Promise((r) => setTimeout(r, 300));
          }

          console.log(`[FlowAutomator :${port}] Submitting ${job.mediaType === 'video' ? 'VIDEO (Veo)' : 'IMAGE'} prompt for scene ${job.sceneId} [Tag: ${sceneTag}] (${inFlight.length + 1}/${this.maxConcurrentPerBrowser} in flight)...`);

          let injectSuccess = false;
          try {
            injectSuccess = await this.injectPromptAndSubmit(page, taggedPrompt, job.mediaType, job.settings);
          } catch (injectErr: any) {
            console.error(`[FlowAutomator :${port}] Prompt injection error:`, injectErr.message);
          }

          if (!injectSuccess) {
            const retries = (job as any).retryCount || 0;
            if (retries >= 2) {
              console.error(`[FlowAutomator :${port}] Max submit retries (2) reached for scene ${job.sceneId}. Aborting scene to prevent infinite loop.`);
              this.onJobProgress?.(job.sceneId, 'error', undefined, 'Failed to submit prompt to Google Flow after 2 attempts.', job.mediaType === 'video' ? 'video' : 'image', job.projectId);
            } else {
              (job as any).retryCount = retries + 1;
              console.warn(`[FlowAutomator :${port}] Prompt submit unconfirmed for ${job.sceneId} (attempt ${retries + 1}/2), re-queuing...`);
              this.queue.unshift(job);
              await new Promise((r) => setTimeout(r, 3000));
            }
            continue;
          }

          // Detect and stamp newly spawned tile container on canvas
          let tileId: string | undefined = undefined;
          try {
            const stampResult = await page.evaluate(async (info: { sceneId: string; sceneTag: string; prompt: string }) => {
              // Ensure in-browser persistent ledger exists
              const win = window as any;
              if (!win.__CINEFLOW_LEDGER__) {
                win.__CINEFLOW_LEDGER__ = new Map();
              }

              const findNewTile = () => {
                const tiles = Array.from(document.querySelectorAll('flow-grid-tile-container, flow-tile-container, [class*="tile-container"]'));
                const unk = tiles.filter((t) => !t.hasAttribute('data-vg-known'));
                if (unk.length === 0) return null;

                // Priority 1: Check if any unk tile contains the sceneTag in its text, aria-label, title, or dataset
                const tagLower = info.sceneTag.toLowerCase();
                const tagMatch = unk.find((t) => {
                  const text = ((t as HTMLElement).innerText || '') + ' ' + (t.getAttribute('aria-label') || '') + ' ' + (t.getAttribute('title') || '');
                  return text.toLowerCase().includes(tagLower);
                });
                if (tagMatch) return tagMatch;

                // Priority 2: Check for prompt keyword overlap
                const promptWords = info.prompt.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter((w) => w.length > 4);
                if (promptWords.length >= 2) {
                  const bestWordMatch = unk.find((t) => {
                    const text = ((t as HTMLElement).innerText || '').toLowerCase();
                    const matches = promptWords.filter((pw) => text.includes(pw)).length;
                    return matches >= 2;
                  });
                  if (bestWordMatch) return bestWordMatch;
                }

                // Priority 3: Fall back to most recently mounted tile
                return unk[unk.length - 1];
              };

              let targetTile = findNewTile();
              if (!targetTile) {
                for (let i = 0; i < 15; i++) {
                  await new Promise((r) => setTimeout(r, 300));
                  targetTile = findNewTile();
                  if (targetTile) break;
                }
              }

              if (targetTile) {
                const generatedTileId = `vg_tile_${info.sceneTag}_${Date.now()}`;
                targetTile.setAttribute('data-vg-known', 'true');
                targetTile.setAttribute('data-vg-tile-id', generatedTileId);
                targetTile.setAttribute('data-vg-scene-id', info.sceneId);
                targetTile.setAttribute('data-vg-scene-tag', info.sceneTag);
                targetTile.setAttribute('data-tile-id', generatedTileId);

                // Register in persistent in-browser memory ledger
                win.__CINEFLOW_LEDGER__.set(generatedTileId, {
                  sceneId: info.sceneId,
                  sceneTag: info.sceneTag,
                  prompt: info.prompt,
                  timestamp: Date.now(),
                });

                const internalId = targetTile.getAttribute('id') || targetTile.getAttribute('data-node-id');
                if (internalId) {
                  win.__CINEFLOW_LEDGER__.set(internalId, {
                    sceneId: info.sceneId,
                    sceneTag: info.sceneTag,
                    prompt: info.prompt,
                    timestamp: Date.now(),
                  });
                }

                if (targetTile.parentElement) {
                  targetTile.parentElement.setAttribute('data-vg-scene-id', info.sceneId);
                  targetTile.parentElement.setAttribute('data-vg-scene-tag', info.sceneTag);
                  targetTile.parentElement.setAttribute('data-vg-tile-id', generatedTileId);
                  targetTile.parentElement.setAttribute('data-tile-id', generatedTileId);
                }

                const inners = Array.from(targetTile.querySelectorAll('flow-tile-container, flow-image-tile, flow-video-tile, [class*="tile"], div'));
                for (const inner of inners.slice(0, 10)) {
                  inner.setAttribute('data-vg-scene-id', info.sceneId);
                  inner.setAttribute('data-vg-scene-tag', info.sceneTag);
                  inner.setAttribute('data-vg-tile-id', generatedTileId);
                  inner.setAttribute('data-tile-id', generatedTileId);
                }

                return { tileId: generatedTileId, found: true };
              }

              return { tileId: undefined, found: false };
            }, { sceneId: job.sceneId, sceneTag, prompt: job.prompt });

            if (stampResult && stampResult.tileId) {
              tileId = stampResult.tileId;
              console.log(`[FlowAutomator :${port}] ✓ Stamped and bound DOM canvas tile ID ${tileId} to scene ${job.sceneId} [${sceneTag}]`);
            }
          } catch (stampErr: any) {
            console.warn(`[FlowAutomator :${port}] DOM tile stamping attempt:`, stampErr.message);
          }

          // Complete remaining spawn wait (total ~3.5s)
          await new Promise((r) => setTimeout(r, 1000));
          await this.wakeAndCenterCanvas(page);

          const promptSig = job.prompt.toLowerCase().replace(/[^a-z0-9]/g, ' ').slice(0, 45).trim();
          inFlight.push({
            job,
            sceneTag,
            promptSignature: promptSig,
            submittedAt: Date.now(),
            assignedPort: port,
            initialUrls,
            tileId,
          });
        }
      }

      if (inFlight.length === 0 && this.queue.length === 0) break;

      // 3. Poll canvas to harvest ready cards
      await new Promise((r) => setTimeout(r, 2000));

      if (page && !page.isClosed()) {
        try {
          // Keep canvas awake and centered so WebGL repaints in real-time
          await this.wakeAndCenterCanvas(page);

          const completedScenes = await this.pollAndHarvestReadyCards(page, inFlight);
          if (completedScenes.length > 0) {
            const remaining = inFlight.filter((c) => !completedScenes.includes(c.job.sceneId));
            inFlight.length = 0;
            inFlight.push(...remaining);
            this.inFlightMap.set(port, inFlight);
            console.log(`[FlowAutomator :${port}] ✓ Successfully harvested ${completedScenes.length} tail scene item(s)! Remaining in flight: ${inFlight.length}`);
          }
        } catch (pollErr: any) {
          console.warn(`[FlowAutomator :${port}] Poll harvest warning:`, pollErr.message);
        }
      }

      // 4. Tail Timeout Check: Crucial for ending jobs when queue is empty or inFlight < maxConcurrentPerBrowser
      // Prevents remaining tail generations from freezing in 'Flow Gen' state indefinitely
      if (inFlight.length > 0) {
        const now = Date.now();
        const timedOut = inFlight.filter((c) => {
          const limit = c.job.mediaType === 'video' ? 240000 : 150000;
          return now - c.submittedAt > limit;
        });

        if (timedOut.length > 0) {
          for (const dead of timedOut) {
            console.warn(`[FlowAutomator :${port}] Generation timed out for tail scene ${dead.job.sceneId} (${dead.job.mediaType || 'image'})`);
            this.onJobProgress?.(
              dead.job.sceneId,
              'error',
              undefined,
              'Google Flow generation timed out.',
              dead.job.mediaType === 'video' ? 'video' : 'image',
              dead.job.projectId
            );
          }
          const remaining = inFlight.filter((c) => {
            const limit = c.job.mediaType === 'video' ? 240000 : 150000;
            return now - c.submittedAt <= limit;
          });
          inFlight.length = 0;
          inFlight.push(...remaining);
          this.inFlightMap.set(port, inFlight);
        }
      }
    }
  }

  /**
   * Wakes up Google Flow's WebGL / React Canvas by dispatching gentle pointer interaction
   * and fitting all cards into view (Shift+1) so newly spawned cards are always visible in real-time.
   */
  private async wakeAndCenterCanvas(page: Page): Promise<void> {
    try {
      if (!page || page.isClosed()) return;
      
      const vp = page.viewport() || { width: 1280, height: 800 };
      const midX = Math.round(vp.width / 2);
      const midY = Math.round(vp.height * 0.45);
      
      // 1. Move mouse gently over canvas area to trigger requestAnimationFrame repaint
      await page.mouse.move(midX, midY).catch(() => {});
      await page.mouse.move(midX + 4, midY + 4).catch(() => {});

      // 2. Dispatch resize and pointermove on canvas so WebGL repaints
      await page.evaluate(() => {
        window.dispatchEvent(new Event('resize'));
        const canvas = document.querySelector('canvas');
        if (canvas) {
          canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2, bubbles: true }));
        }
      }).catch(() => {});

      // 3. Zoom-to-fit: Google Flow canvas supports Shift+1 to fit all nodes into viewport.
      // This prevents React virtualization from unmounting off-screen tail cards.
      // Only fire if the automator/user is not actively typing in an input field.
      const isInputActive = await page.evaluate(() => {
        const el = document.activeElement;
        return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable));
      }).catch(() => false);

      if (!isInputActive) {
        await page.keyboard.down('Shift').catch(() => {});
        await page.keyboard.press('Digit1').catch(() => {});
        await page.keyboard.up('Shift').catch(() => {});
      }
    } catch {}
  }

  /**
   * Scans Google Flow canvas specifically for Failed / Policy Violation cards (which lack <img> tags).
   */
  private async detectFailedCanvasCards(page: Page): Promise<Array<{
    tileId?: string;
    cardText: string;
    reason: string;
    isUsageLimit?: boolean;
    coordX?: number;
    coordY?: number;
    createdTime?: string | null;
  }>> {
    const consumedFailed = Array.from(this.consumedFailedTiles);
    return await page.evaluate((consumedFailedList: string[]) => {
      const consumedSet = new Set(consumedFailedList);
      const results: Array<{
        tileId?: string;
        boundSceneId?: string;
        boundSceneTag?: string;
        cardText: string;
        reason: string;
        isUsageLimit?: boolean;
        coordX?: number;
        coordY?: number;
        createdTime?: string | null;
      }> = [];

      // Find all elements that indicate a generation failure / policy block.
      // IMPORTANT: Scope to canvas tile containers ONLY — never the chat sidebar or agent responses!
      // The Flow canvas tiles live inside flow-grid-tile-container, .react-flow__node, or [data-tile-id].
      // We exclude the chat/agent panel to prevent Flow Agent messages like
      // "I can't process more than 24 items" from being mis-detected as policy violations.
      const canvasRoot = (
        document.querySelector('flow-canvas, .flow-canvas, [class*="canvas-container"], .react-flow, [class*="ReactFlow"]') ||
        document.querySelector('main') ||
        document.body
      ) as HTMLElement;

      // Only search within tile wrappers inside the canvas, never chat/sidebar panels
      const tileScopeSelectors = [
        '[data-tile-id]',
        'flow-error-tile',
        'flow-image-tile',
        'flow-video-tile',
        '.error-tile',
        '.error-message',
        'flow-grid-tile-container',
        'flow-tile-container',
        '.react-flow__node',
      ];
      const scopedTiles = Array.from(canvasRoot.querySelectorAll(tileScopeSelectors.join(','))) as HTMLElement[];

      // Also look for any div that is visually in the canvas area (not in a known chat/sidebar panel)
      const chatPanels = Array.from(document.querySelectorAll(
        '[class*="chat"], [class*="Chat"], [class*="agent"], [class*="sidebar"], [class*="Sidebar"], [class*="panel"], [class*="Panel"], [class*="conversation"], [role="log"]'
      )) as HTMLElement[];

      const isChatDescendant = (el: HTMLElement) => chatPanels.some((panel) => panel.contains(el));

      const errorElements = scopedTiles.filter((el) => {
        if (isChatDescendant(el)) return false; // never flag chat messages
        const text = (el.innerText || '').toLowerCase();
        const hasPolicyPhrase =
          text.includes('violate our policies') ||
          text.includes('violates our policies') ||
          text.includes('generation might violate') ||
          text.includes('violates safety') ||
          text.includes('blocked by safety') ||
          text.includes('prohibited content') ||
          text.includes("can't generate image") ||
          text.includes('cannot generate image');
        const hasFailedPhrase =
          text.includes('image failed to generate') ||
          text.includes('failed to generate') ||
          text.includes('sorry, this image failed') ||
          text.includes('video failed to generate') ||
          text.includes('sorry, this video failed') ||
          (text.includes('failed') && (text.includes('charged') || text.includes('try a different prompt') || text.includes('different prompt')));
        const hasUsageLimitPhrase =
          text.includes('usage limit') ||
          text.includes('rate limit') ||
          text.includes('unusual activity') ||
          (text.includes('try again later') && text.includes('reached'));
        return (hasPolicyPhrase || hasFailedPhrase || hasUsageLimitPhrase) && el.childElementCount < 25;
      });

      for (const el of errorElements) {
        // Enclose strictly within the tile container so cardText NEVER escapes to body / prompt editor!
        const tileContainer = (el.closest('flow-grid-tile-container, flow-tile-container, flow-image-tile, flow-video-tile, [data-tile-id], .react-flow__node') || el) as HTMLElement;
        let tileId = tileContainer.getAttribute('data-vg-tile-id') || tileContainer.getAttribute('data-tile-id') || '';
        let boundSceneId = tileContainer.getAttribute('data-vg-scene-id') || '';
        let boundSceneTag = tileContainer.getAttribute('data-vg-scene-tag') || '';
        let cardText = (tileContainer.innerText || el.innerText || '') + ' ' + (tileContainer.getAttribute('aria-label') || '');
        let createdTime: string | null = null;

        try {
          const rTarget = tileContainer || el;
          const rKey = Object.keys(rTarget).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
          if (rKey) {
            const fiber = (rTarget as any)[rKey];
            const p = fiber?.memoizedProps;
            if (p?.tile?.createdTime) createdTime = p.tile.createdTime;
            else if (p?.children?.props?.tile?.createdTime) createdTime = p.children.props.tile.createdTime;
            if (!tileId && p?.tile?.id) tileId = p.tile.id;
          }
        } catch {}

        const textLower = (el.innerText || '').toLowerCase() + ' ' + cardText.toLowerCase();
        const isUnusualActivity = textLower.includes('unusual activity');
        const isUsageLimit = isUnusualActivity || textLower.includes('usage limit') || textLower.includes('rate limit') || (textLower.includes('try again later') && textLower.includes('reached'));
        const isPolicy = textLower.includes('violate') || textLower.includes('safety') || textLower.includes('prohibited');

        const rect = el.getBoundingClientRect();
        const coordKey = `tile_fail_${Math.round(rect.x / 20)}_${Math.round(rect.y / 20)}`;
        if (tileId && consumedSet.has(tileId)) continue;
        if (!tileId && consumedSet.has(coordKey)) continue;

        const resolvedReason = isUnusualActivity
          ? 'Google Flow cooldown: "We noticed some unusual activity". Google requires a brief verification or cooldown period on this account. Please check the browser window or wait a few minutes.'
          : isUsageLimit
          ? 'Google Flow usage limit reached: You have reached your generation limit on this Google account. Please wait before trying again.'
          : isPolicy
          ? 'Google Flow content policy violation: This prompt was flagged by Google Flow safety filters ("This generation might violate our policies").'
          : 'Google Flow generation failed: "Sorry, this image failed to generate. You have not been charged for this generation." (Flow backend overload or failure).';

        results.push({
          tileId: tileId || coordKey,
          boundSceneId,
          boundSceneTag,
          cardText: cardText.toLowerCase(),
          reason: resolvedReason,
          isUsageLimit,
          coordX: rect.x,
          coordY: rect.y,
          createdTime,
        });
      }

      // Deduplicate
      const unique: typeof results = [];
      for (const r of results) {
        if (r.tileId && unique.some((u) => u.tileId === r.tileId)) continue;
        if (!r.tileId && unique.some((u) => Math.abs((u.coordX || 0) - (r.coordX || 0)) < 30 && Math.abs((u.coordY || 0) - (r.coordY || 0)) < 30)) continue;
        unique.push(r);
      }
      return unique;
    }, consumedFailed).catch(() => []);
  }

  /**
   * Deterministic Card Harvesting: Scans completed image and video cards on the Flow canvas.
   * Also strictly detects and ejects policy-violation / failed cards to prevent off-by-one shifts.
   */
  private async pollAndHarvestReadyCards(page: Page, inFlightCards: InFlightCard[]): Promise<string[]> {
    if (inFlightCards.length === 0) return [];

    const harvestedSceneIds: string[] = [];

    // Step 0: STRICT FAILURE SCANNER - Detect any cards that failed policy on the canvas
    try {
      const failedCards = await this.detectFailedCanvasCards(page);
      if (failedCards.length > 0) {
        // If an account-wide usage limit is on canvas, handle gracefully
        const usageLimitCard = failedCards.find((f) => f.isUsageLimit);
        if (usageLimitCard) {
          const isUnusual = (usageLimitCard.cardText || '').includes('unusual activity');
          const currentPort = inFlightCards[0]?.assignedPort;
          console.warn(`[FlowAutomator :${currentPort}] ⚠️ ${isUnusual ? 'Google Flow unusual activity security cooldown' : 'Google Flow account usage limit reached'} on port ${currentPort}.`);
          if (currentPort) {
            this.rateLimitedPorts.set(currentPort, Date.now() + 15 * 60 * 1000); // 15-minute cooldown for this port
          }
          if (usageLimitCard.tileId) this.consumedFailedTiles.add(usageLimitCard.tileId);

          // Return in-flight jobs back to the head of the queue so other browsers (e.g. port 9222) can take them!
          for (const card of inFlightCards) {
            console.log(`[FlowAutomator :${currentPort}] Re-queuing scene ${card.job.sceneId} for another available browser instance...`);
            this.queue.unshift(card.job);
            harvestedSceneIds.push(card.job.sceneId);
          }

          // Check if any other connected browser is available and not in cooldown
          const otherAvailablePort = this.ports.find(
            (p) => p !== currentPort && this.browsers.has(p) && (!this.rateLimitedPorts.get(p) || Date.now() >= this.rateLimitedPorts.get(p)!)
          );

          if (otherAvailablePort) {
            console.log(`[FlowAutomator] Port ${otherAvailablePort} is available with a different account! Shifting queue to port ${otherAvailablePort}.`);
            this.startWorkerForPort(otherAvailablePort);
          } else {
            console.warn('[FlowAutomator] All available browser instances reached usage limit or cooldown. Pausing automator.');
            this.isPaused = true;
            this.onJobProgress?.(
              inFlightCards[0]?.job.sceneId || '',
              'error',
              undefined,
              isUnusual
                ? 'Google Flow Security Cooldown: Google noticed unusual activity on this account. Please wait 15–30 minutes or check Chrome to verify.'
                : 'Google Flow Usage Limit Reached: All connected Google accounts reached their limit. Please wait or connect another Chrome account.',
              'image',
              inFlightCards[0]?.job.projectId
            );
          }
        } else {
          for (const card of inFlightCards) {
            const sceneTc = extractNormalizedTimecode(card.job.prompt || card.job.sceneId || '');
            const matchedFailed = failedCards.find((f: any) => {
              // Direct binding: If failed card has boundSceneId, match 1-to-1
              if (f.boundSceneId && f.boundSceneId === card.job.sceneId) return true;
              if (f.tileId && card.tileId && f.tileId === card.tileId) return true;
              if (f.boundSceneId && f.boundSceneId !== card.job.sceneId) return false;

              // Text-based score match
              const score = scoreCandidateCard(f.cardText, card.sceneTag, card.job.prompt, sceneTc);
              if (score >= 80) return true;

              // If only 1 card is in-flight on this browser, any newly detected failed card belongs to it!
              if (inFlightCards.length === 1) return true;

              return false;
            });

            if (matchedFailed) {
              const failReason = matchedFailed.reason || 'Google Flow rejected this generation / failed to generate.';
              console.warn(`[FlowAutomator] ❌ MATCH: Detected Google Flow Failure for scene ${card.job.sceneId} [${card.sceneTag}]: ${failReason}. Marking failed & ejecting from in-flight queue.`);
              this.onJobProgress?.(
                card.job.sceneId,
                'error',
                undefined,
                failReason,
                card.job.mediaType === 'video' ? 'video' : 'image',
                card.job.projectId
              );
              if (matchedFailed.tileId) this.consumedFailedTiles.add(matchedFailed.tileId);
              harvestedSceneIds.push(card.job.sceneId);
            }
          }

          // Step 0B: Unassigned Failed Tile Correlator (Parallel Mode First-Run Failure Resolver)
          // If unconsumed failed cards exist on canvas that couldn't be matched by text/ID (due to React re-mount):
          const unconsumedFailed = failedCards.filter((f) => f.tileId && !this.consumedFailedTiles.has(f.tileId));
          if (unconsumedFailed.length > 0) {
            for (const card of inFlightCards) {
              if (harvestedSceneIds.includes(card.job.sceneId)) continue;
              if (unconsumedFailed.length === 0) break;

              const elapsed = Date.now() - card.submittedAt;
              // If card has been in-flight for >= 3.5s (Google Flow has displayed the failure card)
              if (elapsed >= 3500) {
                const targetFailed = unconsumedFailed.shift()!;
                const failReason = targetFailed.reason || 'Google Flow rejected this generation / failed to generate.';
                console.warn(`[FlowAutomator] ❌ FIRST-RUN DETECT: Unassigned failure card on canvas matched to scene ${card.job.sceneId} [${card.sceneTag}]: ${failReason}. Ejecting immediately.`);
                this.onJobProgress?.(
                  card.job.sceneId,
                  'error',
                  undefined,
                  failReason,
                  card.job.mediaType === 'video' ? 'video' : 'image',
                  card.job.projectId
                );
                if (targetFailed.tileId) this.consumedFailedTiles.add(targetFailed.tileId);
                harvestedSceneIds.push(card.job.sceneId);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[FlowAutomator] Failed card scan error:', err.message);
    }

    const remainingInFlight = inFlightCards.filter((c) => !harvestedSceneIds.includes(c.job.sceneId));
    if (remainingInFlight.length === 0) return harvestedSceneIds;

    const videoCards = remainingInFlight.filter((c) => c.job.mediaType === 'video');
    const imageCards = remainingInFlight.filter((c) => c.job.mediaType !== 'video');

    // 1. Process Video cards if any in-flight
    if (videoCards.length > 0) {
      const vidHarvested = await this.pollAndHarvestReadyVideoCards(page, videoCards);
      harvestedSceneIds.push(...vidHarvested);
    }

    // 2. Process Image cards if any in-flight
    if (imageCards.length > 0) {
      const imgHarvested = await this.pollAndHarvestReadyImageCards(page, imageCards);
      harvestedSceneIds.push(...imgHarvested);
    }

    return harvestedSceneIds;
  }

  /**
   * Scans completed video cards on the Flow canvas and matches them deterministically.
   */
  private async pollAndHarvestReadyVideoCards(page: Page, inFlightCards: InFlightCard[]): Promise<string[]> {
    if (inFlightCards.length === 0) return [];

    const harvestedSceneIds: string[] = [];
    const candidates = await this.extractCanvasVideoCards(page);
    const unconsumed = candidates.filter((c) => c.src && c.src.length > 5 && !this.consumedUrls.has(c.src));

    if (!unconsumed || unconsumed.length === 0) return [];

    interface VideoCandidatePair {
      card: InFlightCard;
      cand: any;
      score: number;
      tier: 'DOM_STAMP' | 'TILE_ID' | 'TAG_EXACT' | 'TIMECODE' | 'SEMANTIC' | 'FALLBACK';
    }

    const candidatePairs: VideoCandidatePair[] = [];

    for (const card of inFlightCards) {
      const initialSet = new Set(card.initialUrls || []);
      const sceneTc = extractNormalizedTimecode(card.job.prompt || card.job.sceneId || '');

      for (const cand of unconsumed) {
        if (!cand.src || cand.src.length < 5) continue;

        // Hard exclusion: Never allow matching candidates stamped for a DIFFERENT scene
        if (cand.boundSceneId && cand.boundSceneId !== card.job.sceneId) continue;
        if (cand.boundSceneTag && card.sceneTag && cand.boundSceneTag !== card.sceneTag) continue;
        if (cand.tileId && card.tileId && cand.tileId !== card.tileId) continue;

        // Foreign [REF:...] tag check
        const candText = (cand.cardText || '').toLowerCase();
        const foreignRefMatch = candText.match(/ref:(?:p\d+_)?scn_([a-z0-9_]+)/i);
        if (foreignRefMatch && !card.sceneTag.toLowerCase().includes(foreignRefMatch[1].toLowerCase())) {
          continue;
        }

        // A newly submitted or regenerated job MUST NEVER match media that already existed on canvas before submission!
        if (initialSet.has(cand.src)) {
          continue;
        }

        let score = 0;
        let tier: VideoCandidatePair['tier'] = 'SEMANTIC';

        // Tier 0: Direct Match by stamped boundSceneId
        if (cand.boundSceneId && cand.boundSceneId === card.job.sceneId) {
          score = 20000;
          tier = 'DOM_STAMP';
        }
        // Tier 1: Explicit tileId match
        else if (card.tileId && cand.tileId && cand.tileId === card.tileId) {
          score = 10000;
          tier = 'TILE_ID';
        }
        // Tier 2: CardText semantic / tag score
        else {
          const rawScore = scoreCandidateCard(cand.cardText, card.sceneTag, card.job.prompt, sceneTc);
          if (rawScore >= 100) {
            score = rawScore;
            tier = rawScore >= 1000 ? 'TAG_EXACT' : rawScore >= 600 ? 'TIMECODE' : 'SEMANTIC';
          } else {
            // Tier 3: Strict Fallback
            const canUseTier3 = (this.maxConcurrentPerBrowser === 1 || inFlightCards.length === 1);
            const elapsed = Date.now() - card.submittedAt;
            const requiredElapsed = canUseTier3 ? 30000 : 45000;
            if (elapsed >= requiredElapsed && (canUseTier3 || rawScore >= 40)) {
              score = 10 + rawScore;
              tier = 'FALLBACK';
            }
          }
        }

        if (score > 0) {
          candidatePairs.push({ card, cand, score, tier });
        }
      }
    }

    if (candidatePairs.length === 0) return [];

    // Global Bipartite Confidence Sort: Highest score pair wins first
    candidatePairs.sort((a, b) => b.score - a.score);

    const matchedSceneIds = new Set<string>();
    const matchedCandidateUrls = new Set<string>();

    for (const pair of candidatePairs) {
      if (matchedSceneIds.has(pair.card.job.sceneId)) continue;
      if (matchedCandidateUrls.has(pair.cand.src)) continue;

      matchedSceneIds.add(pair.card.job.sceneId);
      matchedCandidateUrls.add(pair.cand.src);

      try {
        const saved = await this.saveVideoCandidateToDisk(page, pair.cand.src, pair.card.job.outputPath);
        if (saved) {
          console.log(`[FlowAutomator] ✓ MATCHED & SAVED VIDEO for scene ${pair.card.job.sceneId} [${pair.card.sceneTag}] (Tier: ${pair.tier}, Score: ${pair.score}) -> ${pair.card.job.outputPath}`);
          this.consumedUrls.add(pair.cand.src);
          await this.recordHarvestAudit({
            projectId: pair.card.job.projectId,
            sceneId: pair.card.job.sceneId,
            sceneTag: pair.card.sceneTag,
            tileId: pair.cand.tileId,
            matchTier: pair.tier,
            matchScore: pair.score,
            diskPath: pair.card.job.outputPath,
            mediaType: 'video',
          });
          this.onJobProgress?.(pair.card.job.sceneId, 'ready', pair.card.job.outputPath, undefined, 'video', pair.card.job.projectId);
          harvestedSceneIds.push(pair.card.job.sceneId);
        }
      } catch (err: any) {
        console.warn(`[FlowAutomator] Video harvest error for scene ${pair.card.job.sceneId}:`, err.message);
      }
    }

    return harvestedSceneIds;
  }

  /**
   * Scans completed image cards on the Flow canvas and matches them deterministically.
   */
  private async pollAndHarvestReadyImageCards(page: Page, inFlightCards: InFlightCard[]): Promise<string[]> {
    if (inFlightCards.length === 0) return [];

    const harvestedSceneIds: string[] = [];
    const consumedList = Array.from(this.consumedUrls);

    // 1. Scan canvas for newly completed images not yet consumed
    const candidates: any[] = await page.evaluate((consumedUrls: string[]) => {
      const consumedSet = new Set(consumedUrls);
      const allImgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];

      const validMedia = allImgs.filter((img) => {
        const src = img.src || img.getAttribute('data-src') || '';
        if (!src || src.trim() === '' || src === 'about:blank') return false;
        const rect = img.getBoundingClientRect();
        const isMedia =
          src.includes('flow-content.google') ||
          src.includes('flow.google.com/asb') ||
          src.includes('media.getMediaUrlRedirect') ||
          src.includes('googleusercontent') ||
          (img.alt && img.alt.includes('Tile displaying')) ||
          src.startsWith('blob:') ||
          src.startsWith('data:image');
        const notIcon =
          !src.includes('avatar') &&
          !src.includes('googlelogo') &&
          !src.includes('icon') &&
          !src.includes('favicon') &&
          !src.includes('profile');
        const hasSize = (img.naturalWidth > 150 || rect.width > 80) && (img.naturalHeight > 80 || rect.height > 40);
        const isNotHeaderOrNav = !img.closest('header') && !img.closest('nav');
        return isMedia && notIcon && hasSize && isNotHeaderOrNav;
      });

      // Filter out images whose card is still generating (strictly bounded to card tile container)
      const completedOnly = validMedia.filter((img) => {
        if (consumedSet.has(img.src)) return false;
        let parent = img.parentElement;
        for (let lvl = 0; lvl < 8 && parent; lvl++) {
          if (
            parent.tagName === 'BODY' ||
            parent.tagName === 'MAIN' ||
            parent.classList?.contains('tile-row') ||
            parent.classList?.contains('virtual-scroll-container') ||
            parent.classList?.contains('virtual-item-container') ||
            parent.classList?.contains('cdk-virtual-scroll-viewport')
          ) {
            break;
          }
          const text = parent.innerText || '';
          if (/\b\d{1,2}%\b/.test(text) || text.includes('Generating') || text.includes('Creating') || text.includes('Rendering')) {
            return false;
          }
          if (parent.tagName === 'FLOW-GRID-TILE-CONTAINER' || parent.hasAttribute('data-tile-id')) {
            break;
          }
          parent = parent.parentElement;
        }
        return true;
      });

      return completedOnly.map((img) => {
        let parent = img.parentElement;
        let cardText = '';
        let tileId = '';
        let boundSceneId = '';
        let boundSceneTag = '';
        let createdTime: string | null = null;
        const siblingUrls: string[] = [];

        const tileContainer = img.closest('flow-grid-tile-container, flow-tile-container, [class*="tile-container"]');
        if (tileContainer) {
          const tcAria = tileContainer.getAttribute('aria-label') || '';
          const tcTitle = tileContainer.getAttribute('title') || '';
          const tcText = (tileContainer as HTMLElement).innerText || '';
          cardText += ` ${tcAria} ${tcTitle} ${tcText}`;
          tileId = tileContainer.getAttribute('data-vg-tile-id') || tileContainer.getAttribute('data-tile-id') || '';
          boundSceneId = tileContainer.getAttribute('data-vg-scene-id') || '';
          boundSceneTag = tileContainer.getAttribute('data-vg-scene-tag') || '';
        }

        for (let lvl = 0; lvl < 8 && parent; lvl++) {
          if (
            parent.tagName === 'BODY' ||
            parent.tagName === 'MAIN' ||
            parent.classList?.contains('tile-row') ||
            parent.classList?.contains('virtual-scroll-container') ||
            parent.classList?.contains('virtual-item-container') ||
            parent.classList?.contains('cdk-virtual-scroll-viewport')
          ) {
            break;
          }

          if (!tileId) {
            tileId = parent.getAttribute('data-vg-tile-id') || parent.getAttribute('data-tile-id') || '';
          }
          if (!boundSceneId) {
            boundSceneId = parent.getAttribute('data-vg-scene-id') || '';
          }
          if (!boundSceneTag) {
            boundSceneTag = parent.getAttribute('data-vg-scene-tag') || '';
          }

          const pText = parent.innerText || '';
          const pAria = parent.getAttribute('aria-label') || '';
          const pTitle = parent.getAttribute('title') || '';
          const pDataPrompt = parent.getAttribute('data-prompt') || '';
          const pDataRef = parent.getAttribute('data-ref') || '';
          cardText += ` ${pText} ${pAria} ${pTitle} ${pDataPrompt} ${pDataRef}`;

          if (!createdTime) {
            try {
              const rKey = Object.keys(parent).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
              if (rKey) {
                const fiber = (parent as any)[rKey];
                const p = fiber?.memoizedProps;
                if (p?.tile?.createdTime && typeof p.tile.createdTime === 'string') {
                  createdTime = p.tile.createdTime;
                } else if (p?.children?.props?.tile?.createdTime && typeof p.children.props.tile.createdTime === 'string') {
                  createdTime = p.children.props.tile.createdTime;
                }
                const tileObj = p?.tile || p?.children?.props?.tile;
                if (tileObj?.prompt && typeof tileObj.prompt === 'string') {
                  cardText += ' ' + tileObj.prompt;
                }
                if (tileObj?.title && typeof tileObj.title === 'string') {
                  cardText += ' ' + tileObj.title;
                }
                if (!tileId && tileObj?.id) {
                  tileId = tileObj.id;
                }
              }
            } catch {}
          }

          const cardImgs = Array.from(parent.querySelectorAll('img')) as HTMLImageElement[];
          for (const ci of cardImgs) {
            const s = ci.src || ci.getAttribute('data-src') || '';
            if (s && s.length > 5 && !siblingUrls.includes(s)) {
              siblingUrls.push(s);
            }
          }

          const isBoundary = parent.tagName === 'FLOW-GRID-TILE-CONTAINER' || parent.hasAttribute('data-tile-id');
          parent = parent.parentElement;
          if (isBoundary) break;
        }

        const rect = img.getBoundingClientRect();

        // Fallback to in-memory ledger if React virtualization stripped DOM attributes
        const win = window as any;
        if ((!boundSceneId || !boundSceneTag) && win.__CINEFLOW_LEDGER__) {
          if (tileId && win.__CINEFLOW_LEDGER__.has(tileId)) {
            const entry = win.__CINEFLOW_LEDGER__.get(tileId);
            if (!boundSceneId) boundSceneId = entry.sceneId;
            if (!boundSceneTag) boundSceneTag = entry.sceneTag;
          }
        }

        return {
          tileId,
          boundSceneId,
          boundSceneTag,
          src: img.src || img.getAttribute('data-src') || '',
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          cardText: cardText.toLowerCase(),
          createdTime,
          coordX: rect.x,
          coordY: rect.y,
          siblingUrls
        };
      });
    }, consumedList).catch(() => []);

    if (!candidates || candidates.length === 0) {
      return [];
    }

    interface ImageCandidatePair {
      card: InFlightCard;
      cand: any;
      score: number;
      tier: 'DOM_STAMP' | 'TILE_ID' | 'TAG_EXACT' | 'TIMECODE' | 'SEMANTIC' | 'FALLBACK';
    }

    const candidatePairs: ImageCandidatePair[] = [];

    for (const card of inFlightCards) {
      const initialSet = new Set(card.initialUrls || []);
      const sceneTc = extractNormalizedTimecode(card.job.prompt || card.job.sceneId || '');

      for (const cand of candidates) {
        if (!cand.src || cand.src.length < 5) continue;
        if (this.consumedUrls.has(cand.src)) continue;

        // Hard exclusion: Never allow matching candidates stamped for a DIFFERENT scene
        if (cand.boundSceneId && cand.boundSceneId !== card.job.sceneId) continue;
        if (cand.boundSceneTag && card.sceneTag && cand.boundSceneTag !== card.sceneTag) continue;
        if (cand.tileId && card.tileId && cand.tileId !== card.tileId) continue;

        // Foreign [REF:...] tag check: If candidate text explicitly contains a REF or SCN tag of another scene
        const candText = (cand.cardText || '').toLowerCase();
        const foreignRefMatch = candText.match(/ref:(?:p\d+_)?scn_([a-z0-9_]+)/i);
        if (foreignRefMatch && !card.sceneTag.toLowerCase().includes(foreignRefMatch[1].toLowerCase())) {
          continue;
        }

        // A newly submitted or regenerated job MUST NEVER match media that already existed on canvas before submission!
        if (initialSet.has(cand.src)) {
          continue;
        }

        let score = 0;
        let tier: ImageCandidatePair['tier'] = 'SEMANTIC';

        // Tier 0: Direct Match by stamped boundSceneId (100% Deterministic DOM Binding)
        if (cand.boundSceneId && cand.boundSceneId === card.job.sceneId) {
          score = 20000;
          tier = 'DOM_STAMP';
        }
        // Tier 1: Match by explicit tileId if captured
        else if (card.tileId && cand.tileId && cand.tileId === card.tileId) {
          score = 10000;
          tier = 'TILE_ID';
        }
        // Tier 2: Match by cardText semantic / sceneTag score
        else {
          const rawScore = scoreCandidateCard(cand.cardText, card.sceneTag, card.job.prompt, sceneTc);
          if (rawScore >= 100) {
            score = rawScore;
            tier = rawScore >= 1000 ? 'TAG_EXACT' : rawScore >= 600 ? 'TIMECODE' : 'SEMANTIC';
          } else {
            // Tier 3: Strict Fallback (Solo mode ONLY or safety timeout after >= 40s)
            const canUseTier3 = (this.maxConcurrentPerBrowser === 1 || inFlightCards.length === 1);
            const elapsed = Date.now() - card.submittedAt;
            const requiredElapsed = canUseTier3 ? 10000 : 40000;
            if (elapsed >= requiredElapsed && (canUseTier3 || rawScore >= 40)) {
              score = 10 + rawScore;
              tier = 'FALLBACK';
            }
          }
        }

        if (score > 0) {
          candidatePairs.push({ card, cand, score, tier });
        }
      }
    }

    if (candidatePairs.length === 0) return [];

    // Global Bipartite Confidence Sort: Highest score pair wins first
    // Guarantees exact DOM stamps (20000) and Tag matches (1000+) are locked in
    // before any lower-confidence or fallback match can touch the candidate pool
    candidatePairs.sort((a, b) => b.score - a.score);

    const matchedSceneIds = new Set<string>();
    const matchedCandidateUrls = new Set<string>();

    for (const pair of candidatePairs) {
      if (matchedSceneIds.has(pair.card.job.sceneId)) continue;
      if (matchedCandidateUrls.has(pair.cand.src)) continue;

      matchedSceneIds.add(pair.card.job.sceneId);
      matchedCandidateUrls.add(pair.cand.src);

      try {
        const harvestResult: any = await page.evaluate(async (srcToFetch: string) => {
          try {
            const res = await fetch(srcToFetch);
            const blob = await res.blob();
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const dataUrl = reader.result as string;
                resolve({
                  status: 'ready',
                  base64: dataUrl.replace(/^data:image\/\w+;base64,/, ''),
                  src: srcToFetch
                });
              };
              reader.onerror = () => resolve({ status: 'needs_canvas_shot', src: srcToFetch });
              reader.readAsDataURL(blob);
            });
          } catch {
            return { status: 'needs_canvas_shot', src: srcToFetch };
          }
        }, pair.cand.src);

        if (harvestResult?.status === 'ready' && harvestResult.base64) {
          const buf = Buffer.from(harvestResult.base64, 'base64');
          if (buf.length < 500) {
            console.warn(`[FlowAutomator] Refusing image for scene ${pair.card.job.sceneId}: payload too small (${buf.length} bytes).`);
            continue;
          }
          const contentHash = crypto.createHash('sha256').update(buf).digest('hex');
          if (this.harvestedContentHashes.has(contentHash)) {
            console.warn(`[FlowAutomator] Duplicate image content detected (SHA-256: ${contentHash.slice(0, 10)}...). Refusing duplicate assignment for scene ${pair.card.job.sceneId}.`);
            continue;
          }
          this.harvestedContentHashes.add(contentHash);

          await fs.ensureDir(path.dirname(pair.card.job.outputPath));
          await fs.writeFile(pair.card.job.outputPath, buf);
          console.log(`[FlowAutomator] ✓ MATCHED & SAVED scene ${pair.card.job.sceneId} [${pair.card.sceneTag}] (Tier: ${pair.tier}, Score: ${pair.score}) -> ${pair.card.job.outputPath}`);

          this.consumedUrls.add(pair.cand.src);
          if (pair.cand.siblingUrls && Array.isArray(pair.cand.siblingUrls)) {
            for (const sUrl of pair.cand.siblingUrls) {
              this.consumedUrls.add(sUrl);
            }
          }

          await this.recordHarvestAudit({
            projectId: pair.card.job.projectId,
            sceneId: pair.card.job.sceneId,
            sceneTag: pair.card.sceneTag,
            tileId: pair.cand.tileId,
            sha256: contentHash,
            matchTier: pair.tier,
            matchScore: pair.score,
            diskPath: pair.card.job.outputPath,
            mediaType: 'image',
          });

          this.onJobProgress?.(pair.card.job.sceneId, 'ready', pair.card.job.outputPath, undefined, 'image', pair.card.job.projectId);
          harvestedSceneIds.push(pair.card.job.sceneId);
        } else if (harvestResult?.status === 'needs_canvas_shot' && harvestResult.src) {
          const imgHandle = await page.evaluateHandle((srcToMatch: string) => {
            const imgs = Array.from(document.querySelectorAll('img'));
            return imgs.find((i) => i.src === srcToMatch || i.getAttribute('data-src') === srcToMatch) || null;
          }, harvestResult.src);

          const el = imgHandle.asElement();
          if (el) {
            await fs.ensureDir(path.dirname(pair.card.job.outputPath));
            await el.screenshot({ path: pair.card.job.outputPath, type: 'png' });
            const stat = await fs.stat(pair.card.job.outputPath).catch(() => null);
            if (!stat || stat.size < 500) {
              await fs.remove(pair.card.job.outputPath).catch(() => {});
              continue;
            }
            const shotBuf = await fs.readFile(pair.card.job.outputPath).catch(() => null);
            let shotHash: string | undefined = undefined;
            if (shotBuf) {
              shotHash = crypto.createHash('sha256').update(shotBuf).digest('hex');
              if (this.harvestedContentHashes.has(shotHash)) {
                console.warn(`[FlowAutomator] Duplicate screenshot image detected (SHA-256: ${shotHash.slice(0, 10)}...). Refusing duplicate.`);
                await fs.remove(pair.card.job.outputPath).catch(() => {});
                continue;
              }
              this.harvestedContentHashes.add(shotHash);
            }

            console.log(`[FlowAutomator] ✓ CAPTURED snapshot for scene ${pair.card.job.sceneId} [${pair.card.sceneTag}] (Tier: ${pair.tier}, Score: ${pair.score}) -> ${pair.card.job.outputPath}`);
            this.consumedUrls.add(pair.cand.src);
            if (pair.cand.siblingUrls && Array.isArray(pair.cand.siblingUrls)) {
              for (const sUrl of pair.cand.siblingUrls) {
                this.consumedUrls.add(sUrl);
              }
            }

            await this.recordHarvestAudit({
              projectId: pair.card.job.projectId,
              sceneId: pair.card.job.sceneId,
              sceneTag: pair.card.sceneTag,
              tileId: pair.cand.tileId,
              sha256: shotHash,
              matchTier: pair.tier,
              matchScore: pair.score,
              diskPath: pair.card.job.outputPath,
              mediaType: 'image',
            });

            this.onJobProgress?.(pair.card.job.sceneId, 'ready', pair.card.job.outputPath, undefined, 'image', pair.card.job.projectId);
            harvestedSceneIds.push(pair.card.job.sceneId);
          }
        }
      } catch (err: any) {
        console.warn(`[FlowAutomator] Card harvest error for scene ${pair.card.job.sceneId}:`, err.message);
      }
    }

    return harvestedSceneIds;
  }

  /**
   * Injects prompt into Google Flow's Slate editor with safe human-like timing gaps:
   * - Deselects any active card nodes so prompt injection is never placed on an existing card
   * - 400ms focus gap
   * - Native CDP text input
   * - Strict prompt text content verification (prevents stale prompt submission)
   * - Semantic submit button detection (no fragile CSS hashes)
   * - Verification of input clearance
   */
  /**
   * Robustly locates the prompt submission button in Google Flow's current UI and dispatches
   * synthetic pointer/mouse events. Returns button coordinates and metadata.
   */
  private async triggerFlowSubmit(page: Page): Promise<{ success: boolean; x?: number; y?: number; label?: string; reason?: string }> {
    return await page.evaluate(() => {
      // 1. Locate the active prompt editor
      const allEditors = (Array.from(
        document.querySelectorAll('.ProseMirror, [data-slate-editor="true"], div[role="textbox"], [contenteditable="true"]')
      ) as HTMLElement[]).filter((el) => !el.closest('nav, aside, header'));

      const validEditors = allEditors.filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 40 && rect.height > 15;
      });

      const editor = validEditors.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      const editorRect = editor ? editor.getBoundingClientRect() : null;

      // Find the card or container wrapping the editor
      const container = editor
        ? (editor.closest('form, [class*="dialog"], [class*="modal"], [class*="card"], [class*="panel"], [class*="box"], [role="dialog"]') ||
           editor.parentElement?.parentElement?.parentElement?.parentElement ||
           document.body)
        : document.body;

      // 2. Gather candidate buttons (inside container first, then on entire page)
      const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], [tabindex="0"]')) as HTMLElement[];

      interface ScoredCandidate {
        element: HTMLElement;
        score: number;
        rect: DOMRect;
        label: string;
      }

      const scored: ScoredCandidate[] = [];

      for (const btn of allButtons) {
        if (btn.closest('nav, aside, header')) continue;

        // CRITICAL: NEVER consider buttons belonging to existing canvas tiles, cards, or nodes!
        // This prevents clicking 'retry refresh', 'undo', or 'more options' on failed/existing canvas cards.
        if (btn.closest('flow-grid-tile-container, flow-tile-container, flow-image-tile, flow-video-tile, flow-error-tile, [data-tile-id], .react-flow__node, [role="gridcell"]')) continue;

        const r = btn.getBoundingClientRect();
        // Visible and on screen
        if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
        const style = window.getComputedStyle(btn);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        const title = (btn.getAttribute('title') || '').toLowerCase();
        const innerText = (btn.innerText || '').trim().toLowerCase();
        const iconEl = btn.querySelector('i, span, svg, mat-icon');
        const iconText = (iconEl ? (iconEl.textContent || '') : '').trim().toLowerCase();
        const combined = `${aria} ${title} ${innerText} ${iconText}`;

        // STRICT EXCLUSIONS:
        // - Close / dismiss / cancel / clear / retry / refresh buttons
        if (/close|cancel|dismiss|clear|delete|remove|collapse|refresh|retry|undo|redo|favorite|more_vert|more options/i.test(combined)) continue;

        // - Media picker / style reference / add buttons ('+' button)
        if (btn.getAttribute('aria-haspopup') === 'dialog' || /add|ingredient|media|upload|attach|reference/i.test(combined)) continue;
        if (innerText === '+' || iconText === '+' || innerText === 'add' || iconText === 'add') continue;

        // - Agent mode button / chip
        if (/^(\+)?\s*agent$/i.test(innerText) || /agent mode/i.test(aria) || btn.classList.contains('agent-mode-chip')) continue;

        // - Model picker pill (e.g. 'Nano Banana 2', 'Imagen', 'Veo')
        if (/nano|banana|imagen|veo|aspect|ratio|x\d|16:9|9:16|1:1/i.test(combined)) continue;

        // - Credit banners ('Add AI credits')
        if (/credit|reset monthly|top up/i.test(combined)) continue;

        // - Position filter: If we have an editor, submit button MUST be below or vertically level with the editor
        if (editorRect && r.bottom < editorRect.top) continue;

        let score = 0;

        // Direct semantic submission label
        if (/generation|generate|submit|send|create|run|start/i.test(aria + ' ' + title)) {
          score += 1000;
        }

        // Arrow or send icon in text/icon
        if (/arrow_forward|send|forward|play_arrow/i.test(iconText + ' ' + innerText)) {
          score += 600;
        }

        // SVG presence
        const hasSvg = Boolean(btn.querySelector('svg'));
        if (hasSvg) {
          score += 250;
        }

        // Circular or compact action button (width and height roughly equal, 24-65px)
        if (r.width >= 24 && r.width <= 65 && r.height >= 24 && r.height <= 65) {
          score += 300;
        }

        // Inside the prompt container
        if (container.contains(btn)) {
          score += 350;
        }

        // Positioned below editor text (toolbar level)
        if (editorRect && r.top >= editorRect.bottom - 10) {
          score += 300;
        }

        // Right-aligned (submit buttons in Flow are always rightmost in toolbar)
        if (editorRect && r.right >= editorRect.left + editorRect.width * 0.4) {
          score += Math.round((r.right / window.innerWidth) * 400);
        }

        // Check if button or inner SVG has arrow classes or path
        const svgPaths = Array.from(btn.querySelectorAll('path')).map((p) => p.getAttribute('d') || '');
        if (svgPaths.some((d) => d.length > 10)) {
          score += 100;
        }

        scored.push({ element: btn, score, rect: r, label: combined });
      }

      if (scored.length === 0) {
        return { success: false, reason: 'No submit button candidates found' };
      }

      // Sort by score descending
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];

      const isDisabled =
        best.element.hasAttribute('disabled') ||
        best.element.getAttribute('aria-disabled') === 'true' ||
        best.element.classList.contains('disabled');

      if (isDisabled) {
        return {
          success: false,
          reason: 'Best candidate submit button is disabled',
          x: Math.round(best.rect.x + best.rect.width / 2),
          y: Math.round(best.rect.y + best.rect.height / 2),
          label: best.label,
        };
      }

      // Dispatch full sequence of synthetic pointer and mouse events
      const target = best.element;
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      target.focus();

      const opts = { bubbles: true, cancelable: true, view: window };
      target.dispatchEvent(new PointerEvent('pointerdown', opts));
      target.dispatchEvent(new MouseEvent('mousedown', opts));
      target.dispatchEvent(new PointerEvent('pointerup', opts));
      target.dispatchEvent(new MouseEvent('mouseup', opts));
      target.click();

      return {
        success: true,
        x: Math.round(best.rect.x + best.rect.width / 2),
        y: Math.round(best.rect.y + best.rect.height / 2),
        label: best.label,
      };
    }).catch((err) => ({ success: false, reason: err.message }));
  }

  /**
   * Injects prompt into Google Flow's Slate editor with safe human-like timing gaps:
   * - Deselects any active card nodes so prompt injection is never placed on an existing card
   * - 400ms focus gap
   * - Native CDP text input
   * - Strict prompt text content verification (prevents stale prompt submission)
   * - Semantic submit button detection (no fragile CSS hashes)
   * - Verification of input clearance
   */
  private async injectPromptAndSubmit(
    page: Page,
    promptText: string,
    mediaType?: 'image' | 'video' | 'animate',
    settings?: FlowGenerationSettings,
    isAgentMode: boolean = false
  ): Promise<boolean> {
    const cleanPrompt = isAgentMode ? promptText.trim() : promptText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

    // Check if page crashed with React "Application error" before starting
    const isCrashed = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      return text.includes('Application error') || text.includes('client-side exception');
    }).catch(() => false);

    if (isCrashed) {
      console.warn('[FlowAutomator] Google Flow tab is crashed with client exception. Reloading...');
      await page.reload({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 3000));
    }

    // 1. If currently inside a subpage like /tools or /edit/, exit back to the main project canvas
    if (page.url().includes('/project/') && page.url().includes('/tools')) {
      const cleanCanvasUrl = page.url().replace(/\/tools(?:\/.*)?$/, '');
      console.log(`[FlowAutomator] Page is on /tools. Navigating back to project canvas: ${cleanCanvasUrl}`);
      await page.goto(cleanCanvasUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (page.url().includes('/edit/')) {
      await page.evaluate(() => {
        const backBtn = Array.from(document.querySelectorAll('button')).find((b) =>
          (b.innerText || '').toLowerCase().includes('arrow_back') || (b.innerText || '').toLowerCase().includes('go back')
        );
        if (backBtn) backBtn.click();
      });
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Deselect any active cards on canvas and force-close open context menus/popovers
    try {
      await page.keyboard.press('Escape').catch(() => {});
      await new Promise((r) => setTimeout(r, 100));
      await page.keyboard.press('Escape').catch(() => {});
      // Ensure content container is explicitly visible and any actual overlay menus are dismissed
      await page.evaluate(() => {
        const contentEl = document.querySelector('.content-container') as HTMLElement | null;
        if (contentEl && contentEl.style.display === 'none') {
          contentEl.style.display = '';
        }
        const overlays = Array.from(document.querySelectorAll('.cdk-overlay-backdrop, .mat-mdc-menu-panel')) as HTMLElement[];
        for (const o of overlays) {
          o.remove();
        }
      }).catch(() => {});
    } catch {}
    await new Promise((r) => setTimeout(r, 150));

    // Ensure desired generation settings / mode ONLY if not in Agent mode (to prevent turning Agent mode off!)
    if (!isAgentMode) {
      if (settings) {
        await this.applyFlowSettings(page, settings);
        await new Promise((r) => setTimeout(r, 400));
      } else {
        if (mediaType === 'video') {
          await this.ensureMode(page, 'video');
        } else {
          await this.ensureMode(page, 'image');
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    // 2. Ensure editor is visible on the canvas
    try {
      await page.waitForSelector('.ProseMirror, [data-slate-editor="true"], div[role="textbox"][contenteditable="true"], [contenteditable="true"]', { timeout: 8000 });
    } catch {}

    // 3. Focus editor and clear previous placeholder / text
    const editorFound = await page.evaluate(() => {
      const allElements = (Array.from(
        document.querySelectorAll('.ProseMirror, [data-slate-editor="true"], div[role="textbox"], [contenteditable="true"]')
      ) as HTMLElement[]).filter((el) => !el.closest('nav, aside, header'));

      const validEditors = allElements.filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 40 && rect.height > 15;
      });

      const editor = validEditors.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      if (!editor) return false;

      editor.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return true;
    }).catch(() => false);

    if (!editorFound) {
      console.warn('[FlowAutomator] Prompt editor not found on canvas. Checking page URL...');
      if (page.url().includes('/tools')) {
        const cleanCanvasUrl = page.url().replace(/\/tools(?:\/.*)?$/, '');
        console.log(`[FlowAutomator] Page was on /tools. Restoring canvas: ${cleanCanvasUrl}`);
        await page.goto(cleanCanvasUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2500));
      }
      return false;
    }

    // Clear previous text thoroughly from ProseMirror editor
    await page.evaluate(() => {
      const allElements = (Array.from(
        document.querySelectorAll('.ProseMirror, [data-slate-editor="true"], div[role="textbox"], [contenteditable="true"]')
      ) as HTMLElement[]).filter((el) => !el.closest('nav, aside, header'));
      const editor = allElements.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      if (editor) {
        editor.focus();
        editor.innerText = '';
        const range = document.createRange();
        range.selectNodeContents(editor);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.execCommand('delete');
      }
    }).catch(() => {});
    // 4. Natural human-like prompt insertion:
    // (a) 1 second pause after focusing / clearing the editor
    console.log('[FlowAutomator] Pausing 1 second before pasting prompt...');
    await new Promise((r) => setTimeout(r, 1000));

    // (b) Paste prompt progressively over ~3 seconds
    console.log(`[FlowAutomator] Inserting prompt into editor over 3s (${cleanPrompt.length} chars)...`);
    const chunkCount = Math.min(20, Math.max(10, Math.ceil(cleanPrompt.length / 30)));
    const chunkSize = Math.ceil(cleanPrompt.length / chunkCount);
    const delayPerChunk = Math.round(3000 / chunkCount);

    let inserted = true;
    for (let i = 0; i < cleanPrompt.length; i += chunkSize) {
      const chunk = cleanPrompt.slice(i, i + chunkSize);
      const ok = await page.evaluate((c: string) => {
        const allElements = (Array.from(
          document.querySelectorAll('.ProseMirror, [data-slate-editor="true"], div[role="textbox"], [contenteditable="true"]')
        ) as HTMLElement[]).filter((el) => !el.closest('nav, aside, header'));
        const editor = allElements.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
        if (!editor) return false;
        editor.focus();
        return document.execCommand('insertText', false, c);
      }, chunk).catch(() => false);

      if (!ok) {
        inserted = false;
        break;
      }
      await new Promise((r) => setTimeout(r, delayPerChunk));
    }

    if (!inserted) {
      await page.keyboard.type(cleanPrompt, { delay: Math.max(2, Math.round(3000 / cleanPrompt.length)) }).catch(() => {});
    }

    // (c) 1 second pause after pasting the full prompt before submitting
    console.log('[FlowAutomator] Prompt fully entered. Pausing 1 second before submission...');
    await new Promise((r) => setTimeout(r, 1000));

    // 5. Target and click the submit button via multi-layered dispatch:
    // Layer 1: In-DOM synthetic events (pointerdown, mousedown, pointerup, click) on highest-scoring submit button
    // Layer 2: Native Puppeteer OS mouse click on button coordinates
    // Layer 3: Keyboard 'Enter' press into editor
    // Layer 4: Keyboard 'Ctrl+Enter' into editor
    let submitRes = await this.triggerFlowSubmit(page);
    console.log('[FlowAutomator] Submit trigger result:', JSON.stringify(submitRes));

    if (!submitRes.success && submitRes.reason?.includes('disabled')) {
      console.log('[FlowAutomator] Submit button temporarily disabled, waiting 500ms...');
      await new Promise((r) => setTimeout(r, 500));
      submitRes = await this.triggerFlowSubmit(page);
    }

    if (submitRes.x && submitRes.y && submitRes.x > 0 && submitRes.y > 0) {
      await page.mouse.move(submitRes.x, submitRes.y).catch(() => {});
      await new Promise((r) => setTimeout(r, 50));
      await page.mouse.click(submitRes.x, submitRes.y).catch(() => {});
    }

    // Keyboard submit fallback: Focus editor and send Enter & Ctrl+Enter
    await page.evaluate(() => {
      const ed = document.querySelector('.ProseMirror, [data-slate-editor="true"], div[role="textbox"], [contenteditable="true"]') as HTMLElement | null;
      ed?.focus();
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
    await page.keyboard.press('Enter').catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
    await page.keyboard.down('Control').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.keyboard.up('Control').catch(() => {});

    // 6. Verification loop: Confirm prompt was submitted and cleared from bottom editor
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((r) => setTimeout(r, 400));
      const status = await page.evaluate(() => {
        const allElements = (Array.from(
          document.querySelectorAll('.ProseMirror, [data-slate-editor="true"], div[role="textbox"], [contenteditable="true"]')
        ) as HTMLElement[]).filter((el) => !el.closest('nav, aside, header'));

        const editor = allElements.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
        if (!editor) return { cleared: true, textLen: 0 };

        const text = (editor.innerText || editor.textContent || '').trim();
        const isPlaceholder =
          text.includes('What do you want to create') ||
          text.includes('Describe') ||
          text.includes('Type a prompt') ||
          text.includes('Start typing') ||
          text === '' ||
          text === '\n';
        return {
          cleared: isPlaceholder,
          textLen: isPlaceholder ? 0 : text.length,
        };
      }).catch(() => ({ cleared: true, textLen: 0 }));

      if (status.cleared) {
        // Blur editor so no background keys or wake-up pointers ever type into the input
        await page.evaluate(() => {
          const editor = document.querySelector('.ProseMirror, [data-slate-editor="true"], div[role="textbox"], [contenteditable="true"]') as HTMLElement | null;
          if (editor) editor.blur();
          (document.activeElement as HTMLElement)?.blur?.();
        }).catch(() => {});
        console.log('[FlowAutomator] ✓ Prompt submitted and verified successfully!');
        await new Promise((r) => setTimeout(r, 400));
        return true;
      }

      // Retry submission on attempts 2, 5, 8 if still not cleared
      if (attempt === 2 || attempt === 5 || attempt === 8) {
        console.log(`[FlowAutomator] Re-triggering submission (check ${attempt + 1}/12)...`);
        const retryRes = await this.triggerFlowSubmit(page);
        if (retryRes.x && retryRes.y) {
          await page.mouse.click(retryRes.x, retryRes.y).catch(() => {});
        }
        await page.evaluate(() => {
          const ed = document.querySelector('.ProseMirror, [data-slate-editor="true"], div[role="textbox"], [contenteditable="true"]') as HTMLElement | null;
          ed?.focus();
        }).catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        await page.keyboard.down('Control').catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        await page.keyboard.up('Control').catch(() => {});
      }
    }

    // If editor has not cleared after 12 checks, consider submission unconfirmed
    console.warn('[FlowAutomator] ⚠️ Prompt editor still contains text after submission attempts.');
    return false;
  }
}
