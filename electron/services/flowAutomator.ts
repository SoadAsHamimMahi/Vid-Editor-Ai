import puppeteer, { Browser, Page } from 'puppeteer-core';
import http from 'http';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { FlowGenerationSettings } from '../../src/types';
import { projectStorage } from './projectStorage';

export interface AutomationJob {
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
export function generateSceneTag(sceneId: string, prompt?: string): string {
  const tc = extractNormalizedTimecode(sceneId || prompt || '');
  const tcPart = tc ? tc.full.replace(/[^0-9]/g, '') : '';
  const hash = crypto.createHash('md5').update(sceneId).digest('hex').slice(0, 4).toUpperCase();
  return tcPart ? `SCN_${tcPart}_${hash}` : `SCN_${hash}`;
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

  // 3. Significant Semantic Word Overlap
  const STOPWORDS = new Set(['scene', 'visual', 'shot', 'macro', 'close', 'wide', 'hardcover', 'resting', 'cinematic', 'photo', 'realism', 'octane', 'render', 'style', 'aesthetic', '4k', '8k']);
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  if (words.length > 0) {
    let matchedWords = 0;
    for (const w of words) {
      if (textLower.includes(w)) {
        matchedWords++;
      }
    }
    const overlapRatio = matchedWords / words.length;
    score += Math.round(overlapRatio * 300);
    if (matchedWords >= 3) score += 50;
  }

  return score;
}

export class FlowAutomatorPool {
  private ports: number[];
  private browsers: Map<number, Browser> = new Map();
  private isProcessing: boolean = false;
  private queue: AutomationJob[] = [];
  private inFlightMap: Map<number, InFlightCard[]> = new Map(); // port -> in flight cards
  private consumedUrls: Set<string> = new Set(); // Global set of harvested image/video URLs to prevent duplicate pulls
  private consumedFailedTiles: Set<string> = new Set(); // Track failed policy violation tiles to avoid duplicate alerts
  private maxConcurrentPerBrowser: number = 1; // Default to 1x Solo mode for 100% reliable 1-by-1 generation
  private onJobProgress?: (
    sceneId: string,
    status: 'generating' | 'ready' | 'error',
    mediaPath?: string,
    error?: string,
    mediaType?: 'image' | 'video'
  ) => void;

  constructor(ports: number[] = [9222, 9223]) {
    this.ports = ports;
  }

  public setProgressCallback(
    cb: (
      sceneId: string,
      status: 'generating' | 'ready' | 'error',
      mediaPath?: string,
      error?: string,
      mediaType?: 'image' | 'video'
    ) => void
  ) {
    this.onJobProgress = cb;
  }

  public setMaxConcurrency(concurrency: number) {
    this.maxConcurrentPerBrowser = Math.max(1, Math.min(4, concurrency));
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
    console.log('[FlowAutomator] ▶️ Generation RESUMED by user. Continuing queue dispatch.');
    return true;
  }

  public isGenerationPaused(): boolean {
    return this.isPaused;
  }

  public stopGeneration(): boolean {
    const dropped = this.queue.length;
    this.queue.length = 0;
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
      console.log(`[FlowAutomator] Reset all ${count} consumed URLs and failed tile trackers.`);
    }
  }

  public clearConsumedUrl(url: string): void {
    if (url) {
      this.consumedUrls.delete(url);
    }
  }

  /**
   * PASSIVE status check — does NOT create or destroy Puppeteer connections.
   * Called by the background poller every 12s. Safe to call at any time.
   */
  public async checkStatus(): Promise<{ port: number; connected: boolean; credits?: number | null; creditsText?: string | null; email?: string | null }[]> {
    const results: { port: number; connected: boolean; credits?: number | null; creditsText?: string | null; email?: string | null }[] = [];
    for (const port of this.ports) {
      try {
        const browser = this.browsers.get(port);
        if (!browser || !browser.isConnected()) {
          // No live connection — report disconnected without trying to reconnect
          results.push({ port, connected: false });
          continue;
        }

        // We have an active Puppeteer session — check if a Flow project canvas is open
        const pages = await browser.pages().catch(() => []);
        const flowProjectPage = pages.find((p) => p.url().includes('labs.google/fx/tools/flow/project/'));
        if (flowProjectPage && !flowProjectPage.isClosed()) {
          const creditInfo = await this.scrapeAccountCredits(flowProjectPage).catch(() => ({ credits: null, creditsText: null, email: null }));
          results.push({ port, connected: true, credits: creditInfo.credits, creditsText: creditInfo.creditsText, email: creditInfo.email });
        } else {
          results.push({ port, connected: false });
        }
      } catch {
        results.push({ port, connected: false });
      }
    }
    return results;
  }

  /**
   * ACTIVE connect — creates a Puppeteer connection if not already connected.
   * Called only when the user explicitly clicks "Connect Flow" or "Reconnect".
   */
  public async connectAll(): Promise<{ port: number; connected: boolean; credits?: number | null; creditsText?: string | null; email?: string | null }[]> {
    const results: { port: number; connected: boolean; credits?: number | null; creditsText?: string | null; email?: string | null }[] = [];
    for (const port of this.ports) {
      try {
        const isAlive = await this.checkPortStatus(port);
        if (!isAlive) {
          this.browsers.delete(port);
          results.push({ port, connected: false });
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
            const flowProjectPage = pages.find((p) => p.url().includes('labs.google/fx/tools/flow/project/'));
            if (flowProjectPage && !flowProjectPage.isClosed()) {
              isFlowProjectReady = true;
              creditInfo = await this.scrapeAccountCredits(flowProjectPage).catch(() => ({ credits: null, creditsText: null, email: null }));
            }
          }
        }

        results.push({
          port,
          connected: isFlowProjectReady,
          credits: creditInfo.credits,
          creditsText: creditInfo.creditsText,
          email: creditInfo.email,
        });
      } catch {
        results.push({ port, connected: false });
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
    
    // Enforce maximum 40 prompts per batch for Flow Agent
    const targetJobs = jobs.slice(0, 40);
    console.log(`[FlowAutomator] Disagreeing up to 40 scenes (sending ${targetJobs.length} scenes) via Google Flow Agent...`);

    const pages = await this.getActiveFlowPages();
    if (pages.length === 0) {
      return { success: false, dispatched: 0, error: 'No active Google Flow browser tab connected. Please open Flow in Chrome first.' };
    }

    const { page, port } = pages[0];

    // Verify that the page is on a project canvas
    if (!page.url().includes('/project/')) {
      return {
        success: false,
        dispatched: 0,
        error: 'Please open or select a project in Google Flow first so the canvas is visible.',
      };
    }

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

    // 2. Ensure Agent mode button is active (check aria-pressed="true")
    try {
      const activatedAgent = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"], span')) as HTMLElement[];
        const agentBtn = buttons.find((b) => {
          const text = (b.innerText || '').trim();
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          return text === 'Agent' || text === '+ Agent' || aria === 'agent' || aria.includes('agent mode');
        });

        if (agentBtn) {
          const isPressed = agentBtn.getAttribute('aria-pressed') === 'true';
          if (!isPressed) {
            agentBtn.click();
            return true;
          }
        }
        return false;
      });

      if (activatedAgent) {
        console.log('[FlowAutomator] ✓ Activated Agent mode on Google Flow bottom toolbar.');
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch {}

    // 3. Format all scenes into a structured master instruction list for Flow Agent
    const isVideo = targetJobs[0]?.mediaType === 'video';
    const agentLines: string[] = [
      `Create the following ${targetJobs.length} ${isVideo ? 'video' : 'image'} cards on the canvas. Create each as a SEPARATE card:`
    ];

    targetJobs.forEach((job, idx) => {
      const sceneTag = generateSceneTag(job.sceneId, job.prompt);
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
      this.onJobProgress?.(job.sceneId, 'generating', undefined, undefined, job.mediaType === 'video' ? 'video' : 'image');
    });
    console.log(`[FlowAutomator] ✓ Sent ${targetJobs.length} prompts to Google Flow Agent! Harvesting ready cards...`);

    // 6. Background polling worker to harvest ready cards as Flow Agent completes them
    const inFlightCards: InFlightCard[] = targetJobs.map((job) => {
      const sceneTag = generateSceneTag(job.sceneId, job.prompt);
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
      const maxPollCycles = 180; // up to 7+ minutes
      const timeoutMs = isVideo ? 360000 : 240000;
      const startTime = Date.now();

      for (let cycle = 0; cycle < maxPollCycles && remaining.length > 0; cycle++) {
        await new Promise((r) => setTimeout(r, 2500));
        if (page.isClosed() || !page.browser() || !page.browser().isConnected()) break;

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
          console.warn(`[FlowAutomator Agent] Timeout reached for ${remaining.length} remaining scene(s).`);
          for (const dead of remaining) {
            this.onJobProgress?.(dead.job.sceneId, 'error', undefined, 'Google Flow Agent generation timed out.');
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

        // Step 1: High-confidence semantic / sceneTag match
        for (const job of filteredJobs) {
          if (details.some((d) => d.sceneId === job.sceneId && d.success)) continue;

          const sceneTag = generateSceneTag(job.sceneId, job.prompt);
          const sceneTc = extractNormalizedTimecode(job.prompt || job.sceneId || '');

          let bestIdx = -1;
          let highestScore = -1;

          for (let i = 0; i < availablePool.length; i++) {
            const cand = availablePool[i];
            const score = scoreCandidateCard(cand.cardText, sceneTag, job.prompt, sceneTc);
            if (score > highestScore && score >= 100) {
              highestScore = score;
              bestIdx = i;
            }
          }

          if (bestIdx !== -1) {
            const matchedCand = availablePool.splice(bestIdx, 1)[0];
            try {
              const saved = await this.saveCandidateToDisk(page, matchedCand.src, job.outputPath);
              if (saved) {
                matchedCount++;
                this.consumedUrls.add(matchedCand.src);
                this.onJobProgress?.(job.sceneId, 'ready', job.outputPath);
                details.push({ sceneId: job.sceneId, success: true, imagePath: job.outputPath });
                console.log(`[FlowAutomator] ✓ RECOVERED image from canvas for scene ${job.sceneId} [${sceneTag}] -> ${job.outputPath}`);
              }
            } catch (err: any) {
              console.warn(`[FlowAutomator] Error saving candidate for ${job.sceneId}:`, err.message);
            }
          }
        }

        // Step 2: Strict failure for unmatched scenes (PREVENTS CASCADING OFF-BY-ONE SHIFTS)
        // If a card was rejected by Google Flow safety filters or dropped, it must NEVER steal another scene's card!
        const remainingJobs = filteredJobs.filter((j) => !details.some((d) => d.sceneId === j.sceneId && d.success));
        for (const job of remainingJobs) {
          console.warn(`[FlowAutomator] Scene ${job.sceneId} has no verified matching card on canvas. Leaving empty/failed.`);
          this.onJobProgress?.(job.sceneId, 'error', undefined, 'Image not found on canvas or was blocked by Google Flow safety filters.');
          details.push({
            sceneId: job.sceneId,
            success: false,
            reason: 'No verified card matching scene tag, timecode, or prompt was found on canvas. Generation may have been blocked by content policy.',
          });
        }
      } catch (err: any) {
        console.error(`[FlowAutomator :${port}] Error during pullFromCanvas:`, err.message);
      }
    }

    // Fill in unassigned results
    for (const job of filteredJobs) {
      if (!details.some((d) => d.sceneId === job.sceneId)) {
        details.push({
          sceneId: job.sceneId,
          success: false,
          reason: 'No matching completed card found on Google Flow canvas.',
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

        // Step 1: High-confidence semantic / sceneTag match
        for (const job of filteredJobs) {
          if (details.some((d) => d.sceneId === job.sceneId && d.success)) continue;

          const sceneTag = generateSceneTag(job.sceneId, job.prompt);
          const sceneTc = extractNormalizedTimecode(job.prompt || job.sceneId || '');

          let bestIdx = -1;
          let highestScore = -1;

          for (let i = 0; i < availablePool.length; i++) {
            const cand = availablePool[i];
            const score = scoreCandidateCard(cand.cardText, sceneTag, job.prompt, sceneTc);
            if (score > highestScore && score >= 100) {
              highestScore = score;
              bestIdx = i;
            }
          }

          if (bestIdx !== -1) {
            const matchedCand = availablePool.splice(bestIdx, 1)[0];
            try {
              const saved = await this.saveVideoCandidateToDisk(page, matchedCand.src, job.outputPath);
              if (saved) {
                matchedCount++;
                this.consumedUrls.add(matchedCand.src);
                this.onJobProgress?.(job.sceneId, 'ready', job.outputPath, undefined, 'video');
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
          this.onJobProgress?.(job.sceneId, 'error', undefined, 'Video not found on canvas or was blocked by Google Flow safety filters.', 'video');
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
      const sceneTag = generateSceneTag(scene.id, scene.prompt);
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
      const sceneTag = generateSceneTag(scene.id, scene.prompt).toLowerCase();
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

      // Check B: Canvas cards match by Tag, Timecode or Keywords if not found on disk
      if (!matchedImagePath && allCanvasCards.length > 0 && activePage) {
        let bestCard: any = null;
        let highestScore = -1;

        for (const c of allCanvasCards) {
          const score = scoreCandidateCard(c.cardText, sceneTag, scene.prompt, sceneTc);
          if (score > highestScore && score >= 100) {
            highestScore = score;
            bestCard = c;
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
          src.includes('media.getMediaUrlRedirect') ||
          src.includes('googleusercontent') ||
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

      // Filter out generating cards
      const completedOnly = validMedia.filter((img) => {
        let parent = img.parentElement;
        for (let lvl = 0; lvl < 10 && parent; lvl++) {
          const text = parent.innerText || '';
          if (/\b\d{1,2}%\b/.test(text) || text.includes('Generating') || text.includes('Creating') || text.includes('Rendering')) {
            return false;
          }
          parent = parent.parentElement;
        }
        return true;
      });

      return completedOnly.map((img) => {
        let parent = img.parentElement;
        let cardText = '';
        let tileId = '';
        let createdTime: string | null = null;
        let posX: number | null = null;
        let posY: number | null = null;

        for (let lvl = 0; lvl < 14 && parent; lvl++) {
          if (!tileId) {
            tileId = parent.getAttribute('data-tile-id') || '';
          }
          cardText += ' ' + (
            parent.innerText ||
            parent.getAttribute('aria-label') ||
            parent.getAttribute('title') ||
            parent.getAttribute('data-prompt') ||
            parent.getAttribute('data-ref') ||
            ''
          );

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

          parent = parent.parentElement;
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

        return {
          tileId,
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
        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeFile(outputPath, Buffer.from(harvestResult.base64, 'base64'));
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
          src.includes('media.getMediaUrlRedirect') ||
          src.includes('googleusercontent') ||
          src.startsWith('blob:') ||
          src.includes('.mp4') ||
          src.includes('.webm') ||
          src.startsWith('data:video');
        const hasSize = (v.videoWidth > 150 || rect.width > 100) && (v.videoHeight > 100 || rect.height > 60);
        return (isMedia || src.length > 5) && (hasSize || v.readyState >= 1);
      });

      // Filter out generating cards
      const completedOnly = validMedia.filter((v) => {
        let parent = v.parentElement;
        for (let lvl = 0; lvl < 10 && parent; lvl++) {
          const text = parent.innerText || '';
          if (/\b\d{1,2}%\b/.test(text) || text.includes('Generating') || text.includes('Creating') || text.includes('Rendering') || text.includes('Processing')) {
            return false;
          }
          parent = parent.parentElement;
        }
        return true;
      });

      return completedOnly.map((v) => {
        let parent = v.parentElement;
        let cardText = '';
        let tileId = '';
        let createdTime: string | null = null;

        for (let lvl = 0; lvl < 12 && parent; lvl++) {
          if (!tileId) {
            tileId = parent.getAttribute('data-tile-id') || '';
          }
          cardText += ' ' + (
            parent.innerText ||
            parent.getAttribute('aria-label') ||
            parent.getAttribute('title') ||
            parent.getAttribute('data-prompt') ||
            parent.getAttribute('data-ref') ||
            ''
          );

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

          parent = parent.parentElement;
        }

        const rect = v.getBoundingClientRect();
        const effectiveSrc = v.src || v.currentSrc || (v.querySelector('source')?.src) || v.getAttribute('data-src') || '';
        return {
          tileId,
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
      const allElements = Array.from(document.querySelectorAll('button, div[role="tab"], div[role="button"], span')) as HTMLElement[];

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
  public async applyFlowSettings(page: Page, settings: FlowGenerationSettings): Promise<{ success: boolean; creditCost?: number; error?: string }> {
    try {
      console.log(`[FlowAutomator] Applying settings: mode=${settings.mode}, ratio=${settings.aspectRatio}, model=${settings.videoModel}, duration=${settings.videoDuration}, batch=${settings.batchCount}`);

      // 1. Ensure the bottom settings popover is open
      let isPopoverOpen = await page.evaluate(() => {
        const textElements = Array.from(document.querySelectorAll('div, button, span')) as HTMLElement[];
        return textElements.some((el) => {
          const text = el.innerText || '';
          return (
            (text.includes('Omni Flash') || text.includes('Veo 3.1') || text.includes('Veo 2')) &&
            (text.includes('4s') || text.includes('6s') || text.includes('8s') || text.includes('10s') || text.includes('Generating will use'))
          );
        });
      });

      if (!isPopoverOpen) {
        // Multi-strategy click for the bottom settings pill
        const clickedPill = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, div[role="button"], [role="tab"]')) as HTMLElement[];
          const bottomButtons = buttons.filter((b) => b.getBoundingClientRect().top > window.innerHeight * 0.35);
          
          const settingsPill = bottomButtons.find((b) => {
            const text = (b.innerText || '').trim();
            const aria = (b.getAttribute('aria-label') || b.getAttribute('title') || '').toLowerCase();
            return (
              text.includes('Video ·') ||
              text.includes('Image ·') ||
              text.includes('720p') ||
              text.includes('1080p') ||
              text.includes('Omni Flash') ||
              text.includes('Veo') ||
              text.includes('4s') ||
              text.includes('6s') ||
              text.includes('8s') ||
              text.includes('10s') ||
              text.includes('16:9') ||
              text.includes('9:16') ||
              aria.includes('setting') ||
              aria.includes('option') ||
              aria.includes('parameter') ||
              aria.includes('model') ||
              b.querySelector('svg, i')?.getAttribute('aria-label')?.includes('setting')
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
              return text.includes('Omni Flash') || text.includes('Veo 3.1') || text.includes('Generating will use');
            });
            if (isPopoverOpen) break;
          }
        }
      }

      // 2. Select Image vs Video mode
      await page.evaluate((targetMode: string) => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="tab"], div[role="button"]')) as HTMLElement[];
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
          const buttons = Array.from(document.querySelectorAll('button, div[role="button"], div[role="tab"]')) as HTMLElement[];
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
          const allElements = Array.from(document.querySelectorAll('button, div[role="button"], div[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"]')) as HTMLElement[];
          
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
            const menuItems = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], div[role="button"], button, span')) as HTMLElement[];
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
          const buttons = Array.from(document.querySelectorAll('button, div[role="button"], div[role="tab"]')) as HTMLElement[];
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
          const buttons = Array.from(document.querySelectorAll('button, div[role="button"], div[role="tab"]')) as HTMLElement[];
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

    // If port is already responding, check if we can simply bring the Flow tab to the front
    const isAlreadyAlive = await this.checkPortStatus(port);
    if (isAlreadyAlive) {
      try {
        const connected = await this.connectPort(port);
        if (connected) {
          const browser = this.browsers.get(port);
          if (browser) {
            const pages = await browser.pages().catch(() => []);
            let flowPage = pages.find((p) => p.url().includes('labs.google'));
            if (flowPage) {
              await flowPage.bringToFront().catch(() => {});
              return true;
            } else {
              flowPage = await browser.newPage().catch(() => null);
              if (flowPage) {
                await flowPage.goto('https://labs.google/fx/tools/flow').catch(() => {});
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
      'https://labs.google/fx/tools/flow',
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
      console.log(`[FlowAutomator] ✓ Connected successfully to Chrome on :${port}`);

      browser.on('disconnected', () => {
        console.warn(`[FlowAutomator] Chrome disconnected on port :${port}`);
        this.browsers.delete(port);
      });

      return true;
    } catch (err: any) {
      console.error(`[FlowAutomator] Failed to connect to port ${port}:`, err.message);
      this.browsers.delete(port);
      return false;
    }
  }

  /**
   * Helper to find or open the Google Flow tab in the browser.
   */
  private async acquirePage(browser: Browser, port: number): Promise<Page | null> {
    try {
      const pages = await browser.pages();
      let page = pages.find((p) => p.url().includes('labs.google'));

      if (!page) {
        if (pages.length > 0 && pages[0].url() === 'about:blank') {
          page = pages[0];
          await page.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded', timeout: 30000 });
        } else {
          page = await browser.newPage();
          await page.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded', timeout: 30000 });
        }
      }

      await page.bringToFront();

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
      if (curUrl === 'https://labs.google/fx/tools/flow' || curUrl === 'https://labs.google/fx/tools/flow/') {
        await page.evaluate(() => {
          const projLink = (document.querySelector('a[href*="/project/"]') ||
                           Array.from(document.querySelectorAll('button')).find((b) => (b.innerText || '').includes('New project'))) as HTMLElement;
          if (projLink) projLink.click();
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2000));
      }

      return page;
    } catch (err: any) {
      console.error(`[FlowAutomator :${port}] Error acquiring active page:`, err.message);
      return null;
    }
  }

  /**
   * Submits a list of generation jobs into the central queue and initiates workers.
   */
  public async submitJobs(jobs: AutomationJob[]): Promise<void> {
    const existingIds = new Set(this.queue.map((q) => q.sceneId));
    const newJobs = jobs.filter((j) => !existingIds.has(j.sceneId));
    if (newJobs.length === 0) {
      console.log(`[FlowAutomator] All ${jobs.length} requested jobs are already pending in queue. Skipping duplicate enqueue.`);
      return;
    }
    this.queue.push(...newJobs);
    console.log(`[FlowAutomator] Enqueued ${newJobs.length} new jobs (${jobs.length - newJobs.length} duplicates ignored). Total queue: ${this.queue.length}`);

    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const activePorts: number[] = [];
      for (const port of this.ports) {
        if (!this.browsers.has(port)) {
          const ok = await this.connectPort(port);
          if (ok) activePorts.push(port);
        } else {
          activePorts.push(port);
        }
      }

      if (activePorts.length === 0) {
        console.warn('[FlowAutomator] No active Chrome ports available. Attempting launch on 9222...');
        const launched = await this.launchChromeInstance(9222);
        if (launched) {
          const ok = await this.connectPort(9222);
          if (ok) activePorts.push(9222);
        }
      }

      if (activePorts.length === 0) {
        throw new Error('No Chrome browser instances could be connected.');
      }

      // Pre-populate consumedUrls with images already existing on the canvas before new batch starts
      for (const port of activePorts) {
        const browser = this.browsers.get(port);
        if (browser && browser.isConnected()) {
          const page = await this.acquirePage(browser, port);
          if (page && !page.isClosed()) {
            const currentCanvasImgs = await page.evaluate(() => {
              const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
              return imgs.map((i) => i.src);
            }).catch(() => []);
            for (const src of currentCanvasImgs) {
              this.consumedUrls.add(src);
            }
          }
        }
      }

      const workers = activePorts.map((port) => this.runBrowserWorker(port));
      await Promise.all(workers);
    } finally {
      this.isProcessing = false;
      console.log('[FlowAutomator] Automation processing cycle completed.');
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
        const timeoutLimit = inFlight.some((c) => c.job.mediaType === 'video') ? 240000 : 150000;
        const timedOut = inFlight.filter((c) => now - c.submittedAt > timeoutLimit);
        if (timedOut.length > 0) {
          for (const dead of timedOut) {
            console.warn(`[FlowAutomator :${port}] Generation timed out for scene ${dead.job.sceneId}`);
            this.onJobProgress?.(dead.job.sceneId, 'error', undefined, 'Google Flow generation timed out.');
          }
          const remaining = inFlight.filter((c) => now - c.submittedAt <= timeoutLimit);
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
        const job = this.queue.shift();
        if (job) {
          this.onJobProgress?.(job.sceneId, 'generating', undefined, undefined, job.mediaType === 'video' ? 'video' : 'image');

          // Check page liveness
          if (!page || page.isClosed() || !browser?.isConnected()) {
            page = browser ? await this.acquirePage(browser, port) : null;
          }
          if (!page || page.isClosed()) {
            console.warn(`[FlowAutomator :${port}] Page unavailable, re-queuing scene ${job.sceneId}`);
            this.queue.unshift(job);
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }

          // Generate unique non-colliding scene reference tag incorporating timecode + hash
          const sceneTag = generateSceneTag(job.sceneId, job.prompt);
          const taggedPrompt = job.prompt.includes('[REF:')
            ? job.prompt
            : `[REF:${sceneTag}] ${job.prompt.trim()}`;

          // Snapshot existing media URLs and canvas tile IDs before submission
          const initialUrls: string[] = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img, video')) as (HTMLImageElement | HTMLVideoElement)[];
            return imgs.map((i) => (i as HTMLImageElement).src || (i as HTMLVideoElement).currentSrc || '');
          }).catch(() => []);

          const initialTileIds: string[] = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('[data-tile-id]'))
              .map((t) => t.getAttribute('data-tile-id') || '')
              .filter(Boolean);
          }).catch(() => []);

          // If parallel items are in flight, shift canvas so the new card is created in clean open space (no card overlap!)
          if (inFlight.length > 0 && page && !page.isClosed()) {
            await page.evaluate(() => {
              const canvas = document.querySelector('canvas') || document.body;
              if (canvas) {
                canvas.dispatchEvent(new WheelEvent('wheel', { deltaX: 350, deltaY: 0, bubbles: true }));
              }
            }).catch(() => {});
            await new Promise((r) => setTimeout(r, 400));
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
              this.onJobProgress?.(job.sceneId, 'error', undefined, 'Failed to submit prompt to Google Flow after 2 attempts.');
            } else {
              (job as any).retryCount = retries + 1;
              console.warn(`[FlowAutomator :${port}] Prompt submit unconfirmed for ${job.sceneId} (attempt ${retries + 1}/2), re-queuing...`);
              this.queue.unshift(job);
              await new Promise((r) => setTimeout(r, 3000));
            }
            continue;
          }

          // Wait 4.5 seconds for Google Flow to initialize the card on canvas and complete spawn animation
          await new Promise((r) => setTimeout(r, 4500));

          // Detect newly spawned tile ID on canvas
          let tileId: string | undefined = undefined;
          try {
            tileId = await page.evaluate((knownIds: string[]) => {
              const knownSet = new Set(knownIds);
              const tiles = Array.from(document.querySelectorAll('[data-tile-id]'));
              for (const tile of tiles) {
                const id = tile.getAttribute('data-tile-id');
                if (id && !knownSet.has(id)) {
                  return id;
                }
              }
              return undefined;
            }, initialTileIds);
          } catch {}

          if (tileId) {
            console.log(`[FlowAutomator :${port}] ✓ Bound canvas tile ID ${tileId} to scene ${job.sceneId}`);
          }

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
          const completedScenes = await this.pollAndHarvestReadyCards(page, inFlight);
          if (completedScenes.length > 0) {
            const remaining = inFlight.filter((c) => !completedScenes.includes(c.job.sceneId));
            inFlight.length = 0;
            inFlight.push(...remaining);
            this.inFlightMap.set(port, inFlight);
          }
        } catch (pollErr: any) {
          console.warn(`[FlowAutomator :${port}] Poll harvest warning:`, pollErr.message);
        }
      }
    }
  }

  /**
   * Scans Google Flow canvas specifically for Failed / Policy Violation cards (which lack <img> tags).
   */
  private async detectFailedCanvasCards(page: Page): Promise<Array<{
    tileId?: string;
    cardText: string;
    reason: string;
    coordX?: number;
    coordY?: number;
    createdTime?: string | null;
  }>> {
    const consumedFailed = Array.from(this.consumedFailedTiles);
    return await page.evaluate((consumedFailedList: string[]) => {
      const consumedSet = new Set(consumedFailedList);
      const results: Array<{
        tileId?: string;
        cardText: string;
        reason: string;
        coordX?: number;
        coordY?: number;
        createdTime?: string | null;
      }> = [];

      // Find all elements that indicate a generation failure / policy block
      const allDivs = Array.from(document.querySelectorAll('div, section, article, [data-tile-id]')) as HTMLElement[];
      const errorElements = allDivs.filter((el) => {
        const text = (el.innerText || '').toLowerCase();
        const hasPolicyPhrase =
          text.includes('violate our policies') ||
          text.includes('violates our policies') ||
          (text.includes('failed') && (text.includes('policies') || text.includes('charged') || text.includes('send feedback'))) ||
          text.includes("can't generate image") ||
          text.includes('cannot generate image') ||
          text.includes('generation might violate');
        return hasPolicyPhrase && el.childElementCount < 25;
      });

      for (const el of errorElements) {
        let tileEl: HTMLElement | null = el;
        let tileId = '';
        let cardText = '';
        let createdTime: string | null = null;

        for (let lvl = 0; lvl < 12 && tileEl; lvl++) {
          if (!tileId && tileEl.getAttribute('data-tile-id')) {
            tileId = tileEl.getAttribute('data-tile-id') || '';
          }
          if (!createdTime) {
            try {
              const rKey = Object.keys(tileEl).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
              if (rKey) {
                const fiber = (tileEl as any)[rKey];
                const p = fiber?.memoizedProps;
                if (p?.tile?.createdTime) createdTime = p.tile.createdTime;
                else if (p?.children?.props?.tile?.createdTime) createdTime = p.children.props.tile.createdTime;
                if (!tileId && p?.tile?.id) tileId = p.tile.id;
              }
            } catch {}
          }
          cardText += ' ' + (
            tileEl.innerText ||
            tileEl.getAttribute('aria-label') ||
            tileEl.getAttribute('title') ||
            tileEl.getAttribute('data-prompt') ||
            tileEl.getAttribute('data-ref') ||
            ''
          );
          if (tileEl.getAttribute('data-tile-id')) break;
          tileEl = tileEl.parentElement;
        }

        if (tileId && consumedSet.has(tileId)) continue;

        const rect = el.getBoundingClientRect();
        results.push({
          tileId: tileId || undefined,
          cardText: cardText.toLowerCase(),
          reason: 'Google Flow content policy violation: This generation might violate our policies.',
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
        for (const card of inFlightCards) {
          const sceneTc = extractNormalizedTimecode(card.job.prompt || card.job.sceneId || '');
          const matchedFailed = failedCards.find((f) => {
            if (f.tileId && card.tileId && f.tileId === card.tileId) return true;
            const score = scoreCandidateCard(f.cardText, card.sceneTag, card.job.prompt, sceneTc);
            if (score >= 60) return true;
            // In 1x Solo mode, if there's only 1 in-flight card and at least 3 seconds elapsed since submission
            if (this.maxConcurrentPerBrowser === 1 && inFlightCards.length === 1 && (Date.now() - card.submittedAt) >= 3000) {
              return true;
            }
            return false;
          });

          if (matchedFailed) {
            console.warn(`[FlowAutomator] ❌ STRICT MATCH: Detected Google Flow Policy Violation for scene ${card.job.sceneId} [${card.sceneTag}]. Marking failed & ejecting from in-flight queue.`);
            this.onJobProgress?.(
              card.job.sceneId,
              'error',
              undefined,
              'Policy Violation: Google Flow rejected this prompt (violates safety policies). You have not been charged for this generation.',
              card.job.mediaType === 'video' ? 'video' : 'image'
            );
            if (matchedFailed.tileId) this.consumedFailedTiles.add(matchedFailed.tileId);
            harvestedSceneIds.push(card.job.sceneId);
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

    const availablePool = [...unconsumed];

    for (const card of inFlightCards) {
      if (availablePool.length === 0) break;

      // CRITICAL: A newly submitted job MUST NEVER match media that already existed before submission!
      const initialSet = new Set(card.initialUrls || []);
      const newPool = availablePool.filter((cand) => cand.src && cand.src.length > 5 && !initialSet.has(cand.src));
      if (newPool.length === 0) continue;

      let bestIdx = -1;
      let highestScore = -1;
      const sceneTc = extractNormalizedTimecode(card.job.prompt || card.job.sceneId || '');

      // Tier 1: Match by explicit tileId if captured
      if (card.tileId) {
        bestIdx = newPool.findIndex((cand) => cand.tileId && cand.tileId === card.tileId);
      }

      // Tier 2: Match by cardText semantic / sceneTag score if available
      if (bestIdx === -1) {
        for (let i = 0; i < newPool.length; i++) {
          const cand = newPool[i];
          const score = scoreCandidateCard(cand.cardText, card.sceneTag, card.job.prompt, sceneTc);
          if (score > highestScore && score >= 100) {
            highestScore = score;
            bestIdx = i;
          }
        }
      }

      // Tier 3: Strict Fallback (1x Solo mode ONLY: requires elapsed >= 30s. STRICTLY DISABLED in Parallel mode!)
      if (bestIdx === -1 && this.maxConcurrentPerBrowser === 1) {
        const elapsed = Date.now() - card.submittedAt;
        if (elapsed >= 30000) {
          const sortedNew = [...newPool].sort((a, b) => {
            if (a.createdTime && b.createdTime) {
              return new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime();
            }
            if (Math.abs((a.coordY || 0) - (b.coordY || 0)) > 20) {
              return (a.coordY || 0) - (b.coordY || 0);
            }
            return (a.coordX || 0) - (b.coordX || 0);
          });

          let semanticCandIdx = -1;
          for (let i = 0; i < sortedNew.length; i++) {
            const cand = sortedNew[i];
            const score = scoreCandidateCard(cand.cardText, card.sceneTag, card.job.prompt, sceneTc);
            if (score >= 40) {
              semanticCandIdx = newPool.indexOf(cand);
              break;
            }
          }

          if (semanticCandIdx !== -1) {
            bestIdx = semanticCandIdx;
          } else {
            // SAFETY GUARD: Before blindly assigning the oldest card, verify it does NOT
            // contain a [REF:SCN_...] tag belonging to a DIFFERENT known in-flight card.
            // Without this check, a failed scene (no card) would steal the NEXT scene's card,
            // causing a cascade off-by-one shift across all subsequent scenes.
            const otherKnownTags = inFlightCards
              .filter(c => c.job.sceneId !== card.job.sceneId)
              .map(c => c.sceneTag.toLowerCase());
            const candidateText = (sortedNew[0]?.cardText || '').toLowerCase();
            const hasForeignRefTag = otherKnownTags.some(t => candidateText.includes(t) || candidateText.includes(`ref:${t}`));
            if (!hasForeignRefTag) {
              bestIdx = newPool.indexOf(sortedNew[0]);
            } else {
              console.warn(`[FlowAutomator] Tier3 fallback BLOCKED: oldest card belongs to a different in-flight scene (cascade-shift prevention). Scene ${card.job.sceneId} will remain unmatched this poll cycle.`);
            }
          }
        }
      }

      if (bestIdx === -1) continue;

      const matchedCand = newPool[bestIdx];
      const poolIdx = availablePool.indexOf(matchedCand);
      if (poolIdx !== -1) availablePool.splice(poolIdx, 1);
      if (!matchedCand || !matchedCand.src || matchedCand.src.length < 5) continue;

      try {
        const saved = await this.saveVideoCandidateToDisk(page, matchedCand.src, card.job.outputPath);
        if (saved) {
          console.log(`[FlowAutomator] ✓ MATCHED & SAVED VIDEO for scene ${card.job.sceneId} [${card.sceneTag}] -> ${card.job.outputPath}`);
          this.consumedUrls.add(matchedCand.src);
          this.onJobProgress?.(card.job.sceneId, 'ready', card.job.outputPath, undefined, 'video');
          harvestedSceneIds.push(card.job.sceneId);
        }
      } catch (err: any) {
        console.warn(`[FlowAutomator] Video harvest error for scene ${card.job.sceneId}:`, err.message);
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
          src.includes('media.getMediaUrlRedirect') ||
          src.includes('googleusercontent') ||
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

      // Filter out images whose card is still generating (showing % like 83%, 99%)
      const completedOnly = validMedia.filter((img) => {
        if (consumedSet.has(img.src)) return false;
        let parent = img.parentElement;
        for (let lvl = 0; lvl < 10 && parent; lvl++) {
          const text = parent.innerText || '';
          if (/\b\d{1,2}%\b/.test(text) || text.includes('Generating') || text.includes('Creating') || text.includes('Rendering')) {
            return false;
          }
          parent = parent.parentElement;
        }
        return true;
      });

      return completedOnly.map((img) => {
        let parent = img.parentElement;
        let cardText = '';
        let tileId = '';
        let createdTime: string | null = null;
        const siblingUrls: string[] = [];

        for (let lvl = 0; lvl < 12 && parent; lvl++) {
          if (!tileId) {
            tileId = parent.getAttribute('data-tile-id') || '';
          }
          cardText += ' ' + (
            parent.innerText ||
            parent.getAttribute('aria-label') ||
            parent.getAttribute('title') ||
            parent.getAttribute('data-prompt') ||
            parent.getAttribute('data-ref') ||
            ''
          );

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
          parent = parent.parentElement;
        }

        const rect = img.getBoundingClientRect();
        return {
          tileId,
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

    // 2. Match each in-flight card 1-to-1 with the best candidate
    const availablePool = [...candidates];

    for (const card of inFlightCards) {
      if (availablePool.length === 0) break;

      // CRITICAL: A newly submitted job MUST NEVER match media that already existed before submission!
      const initialSet = new Set(card.initialUrls || []);
      const newPool = availablePool.filter((cand) => cand.src && cand.src.length > 5 && !initialSet.has(cand.src));
      if (newPool.length === 0) continue;

      let bestIdx = -1;
      let highestScore = -1;
      const sceneTc = extractNormalizedTimecode(card.job.prompt || card.job.sceneId || '');

      // Tier 1: Match by explicit tileId if captured
      if (card.tileId) {
        bestIdx = newPool.findIndex((cand) => cand.tileId && cand.tileId === card.tileId);
      }

      // Tier 2: Match by cardText semantic / sceneTag score if available
      if (bestIdx === -1) {
        for (let i = 0; i < newPool.length; i++) {
          const cand = newPool[i];
          const score = scoreCandidateCard(cand.cardText, card.sceneTag, card.job.prompt, sceneTc);
          if (score > highestScore && score >= 100) {
            highestScore = score;
            bestIdx = i;
          }
        }
      }

      // Tier 3: Strict Fallback (1x Solo mode ONLY: requires elapsed >= 10s. STRICTLY DISABLED in Parallel mode!)
      if (bestIdx === -1 && this.maxConcurrentPerBrowser === 1) {
        const elapsed = Date.now() - card.submittedAt;
        if (elapsed >= 10000) {
          const sortedNew = [...newPool].sort((a, b) => {
            if (a.createdTime && b.createdTime) {
              return new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime();
            }
            if (Math.abs((a.coordY || 0) - (b.coordY || 0)) > 20) {
              return (a.coordY || 0) - (b.coordY || 0);
            }
            return (a.coordX || 0) - (b.coordX || 0);
          });

          // Check if any candidate has semantic overlap
          let semanticCandIdx = -1;
          for (let i = 0; i < sortedNew.length; i++) {
            const cand = sortedNew[i];
            const score = scoreCandidateCard(cand.cardText, card.sceneTag, card.job.prompt, sceneTc);
            if (score >= 40) {
              semanticCandIdx = newPool.indexOf(cand);
              break;
            }
          }

          if (semanticCandIdx !== -1) {
            bestIdx = semanticCandIdx;
          } else {
            // SAFETY GUARD: Before blindly assigning the oldest card, verify it does NOT
            // contain a [REF:SCN_...] tag belonging to a DIFFERENT known in-flight card.
            // Without this check, a failed scene (no card) would steal the NEXT scene's card,
            // causing a cascade off-by-one shift across all subsequent scenes.
            const otherKnownTags = inFlightCards
              .filter(c => c.job.sceneId !== card.job.sceneId)
              .map(c => c.sceneTag.toLowerCase());
            const candidateText = (sortedNew[0]?.cardText || '').toLowerCase();
            const hasForeignRefTag = otherKnownTags.some(t => candidateText.includes(t) || candidateText.includes(`ref:${t}`));
            if (!hasForeignRefTag) {
              // Solo Mode 1-to-1 guarantee: With only 1 job in flight on this port,
              // any newly appeared unconsumed card (with no foreign tag) belongs to this job!
              bestIdx = newPool.indexOf(sortedNew[0]);
            } else {
              console.warn(`[FlowAutomator] Tier3 fallback BLOCKED: oldest card belongs to a different in-flight scene (cascade-shift prevention). Scene ${card.job.sceneId} will remain unmatched this poll cycle.`);
            }
          }
        }
      }

      if (bestIdx === -1) continue;

      const matchedCand = newPool[bestIdx];
      const poolIdx = availablePool.indexOf(matchedCand);
      if (poolIdx !== -1) availablePool.splice(poolIdx, 1);
      if (!matchedCand || !matchedCand.src || matchedCand.src.length < 5) continue;

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
        }, matchedCand.src);

        if (harvestResult?.status === 'ready' && harvestResult.base64) {
          await fs.ensureDir(path.dirname(card.job.outputPath));
          await fs.writeFile(card.job.outputPath, Buffer.from(harvestResult.base64, 'base64'));
          console.log(`[FlowAutomator] ✓ MATCHED & SAVED scene ${card.job.sceneId} [${card.sceneTag}] -> ${card.job.outputPath}`);
          
          this.consumedUrls.add(matchedCand.src);
          if (matchedCand.siblingUrls && Array.isArray(matchedCand.siblingUrls)) {
            for (const sUrl of matchedCand.siblingUrls) {
              this.consumedUrls.add(sUrl);
            }
          }
          this.onJobProgress?.(card.job.sceneId, 'ready', card.job.outputPath, undefined, 'image');
          harvestedSceneIds.push(card.job.sceneId);
        } else if (harvestResult?.status === 'needs_canvas_shot' && harvestResult.src) {
          const imgHandle = await page.evaluateHandle((srcToMatch: string) => {
            const imgs = Array.from(document.querySelectorAll('img'));
            return imgs.find((i) => i.src === srcToMatch || i.getAttribute('data-src') === srcToMatch) || null;
          }, harvestResult.src);

          const el = imgHandle.asElement();
          if (el) {
            await fs.ensureDir(path.dirname(card.job.outputPath));
            await el.screenshot({ path: card.job.outputPath, type: 'png' });
            console.log(`[FlowAutomator] ✓ CAPTURED snapshot for scene ${card.job.sceneId} [${card.sceneTag}] -> ${card.job.outputPath}`);
            this.consumedUrls.add(matchedCand.src);
            if (matchedCand.siblingUrls && Array.isArray(matchedCand.siblingUrls)) {
              for (const sUrl of matchedCand.siblingUrls) {
                this.consumedUrls.add(sUrl);
              }
            }
            this.onJobProgress?.(card.job.sceneId, 'ready', card.job.outputPath, undefined, 'image');
            harvestedSceneIds.push(card.job.sceneId);
          }
        }
      } catch (err: any) {
        console.warn(`[FlowAutomator] Card harvest error for scene ${card.job.sceneId}:`, err.message);
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

    // 1. If currently inside a card /edit/ view, exit back to the main project canvas
    if (page.url().includes('/edit/')) {
      await page.evaluate(() => {
        const backBtn = Array.from(document.querySelectorAll('button')).find((b) =>
          (b.innerText || '').toLowerCase().includes('arrow_back') || (b.innerText || '').toLowerCase().includes('go back')
        );
        if (backBtn) backBtn.click();
      });
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Deselect any active cards on canvas and close open menus/overlays
    try {
      // Click neutral empty canvas space to unselect any previously generated card
      await page.mouse.click(80, 300).catch(() => {});
      await new Promise((r) => setTimeout(r, 150));
      await page.keyboard.press('Escape');
      await new Promise((r) => setTimeout(r, 100));
      await page.keyboard.press('Escape');
    } catch {}
    await new Promise((r) => setTimeout(r, 200));

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
      await page.waitForSelector('[data-slate-editor="true"], div[role="textbox"][contenteditable="true"], [contenteditable="true"]', { timeout: 8000 });
    } catch {}

    // 3. Focus Slate prompt editor using native mouse click
    const slatePos = await page.evaluate(() => {
      const allElements = Array.from(
        document.querySelectorAll('[data-slate-editor="true"], div[role="textbox"], [contenteditable="true"]')
      ) as HTMLElement[];

      const validEditors = allElements.filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 40 && rect.height > 15 && !el.closest('header');
      });

      const editor = validEditors.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      if (!editor) return null;

      editor.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      editor.focus();
      const r = editor.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }).catch(() => null);

    if (slatePos) {
      await page.mouse.click(slatePos.x, slatePos.y).catch(() => {});
      await new Promise((r) => setTimeout(r, 200));
    }

    // Clear previous placeholder / text using native keyboard
    await page.keyboard.down('Control').catch(() => {});
    await page.keyboard.press('KeyA').catch(() => {});
    await page.keyboard.up('Control').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await new Promise((r) => setTimeout(r, 200));

    // Type prompt directly into Slate
    console.log(`[FlowAutomator] Typing prompt into Slate editor (${cleanPrompt.length} chars)...`);
    await page.keyboard.type(cleanPrompt, { delay: 1 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));

    // 4. Target and click the submit button via semantic selectors and Ctrl+Enter
    let submitted = false;

    // Send native Ctrl+Enter keyboard submission first
    await page.keyboard.down('Control').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.keyboard.up('Control').catch(() => {});
    await new Promise((r) => setTimeout(r, 300));

    for (let btnCheck = 0; btnCheck < 10; btnCheck++) {
      const submitBtn = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]')) as HTMLElement[];
        const bottomButtons = buttons.filter((b) => b.getBoundingClientRect().top > window.innerHeight * 0.35);

        const arrowBtn = bottomButtons.find((b) => {
          const text = (b.innerText || '').trim();
          const aria = (b.getAttribute('aria-label') || b.getAttribute('title') || '').toLowerCase();
          const iconEl = b.querySelector('i, span, svg');
          const iconText = iconEl ? (iconEl.textContent || '').trim() : '';
          const hasSvg = Boolean(b.querySelector('svg'));

          // Explicitly exclude "Add media to prompt" dialog button (e.g. "add_2 Create")
          const isMediaPicker = b.getAttribute('aria-haspopup') === 'dialog' || iconText === 'add_2' || text.startsWith('add_2');
          if (isMediaPicker) return false;

          const hasArrowIcon = iconText.includes('arrow_forward') || iconText.includes('send') || text.includes('arrow_forward') || text.includes('Create') || text.includes('send');
          const isSubmitRole = aria.includes('generate') || aria.includes('submit') || aria.includes('send') || aria.includes('create') || aria.includes('run');
          
          // Check for circular action button on bottom right of the prompt box
          const rect = b.getBoundingClientRect();
          const isCircularRightBtn = hasSvg && rect.width < 55 && rect.height < 55;

          return hasArrowIcon || isSubmitRole || isCircularRightBtn;
        });

        if (!arrowBtn) return null;
        const r = arrowBtn.getBoundingClientRect();
        const isDisabled = arrowBtn.hasAttribute('disabled') || arrowBtn.getAttribute('aria-disabled') === 'true';
        return {
          x: Math.round(r.x + r.width / 2),
          y: Math.round(r.y + r.height / 2),
          disabled: isDisabled,
        };
      }).catch(() => null);

      if (submitBtn && !submitBtn.disabled) {
        await page.mouse.click(submitBtn.x, submitBtn.y).catch(() => {});
        submitted = true;
        console.log('[FlowAutomator] ✓ Clicked Create / Submit button successfully!');
        break;
      }

      await new Promise((r) => setTimeout(r, 250));
    }

    // 7. Verification loop: Confirm that prompt was submitted and cleared from bottom editor
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, 700));
      const status = await page.evaluate(() => {
        const allElements = Array.from(
          document.querySelectorAll('[data-slate-editor="true"], div[role="textbox"], [contenteditable="true"], textarea')
        ) as HTMLElement[];

        const validEditors = allElements.filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 40 && rect.height > 15 && !el.closest('header');
        });

        const editor = validEditors.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
        if (!editor) return { cleared: true, textLen: 0 };

        const text = (editor.innerText || '').trim();
        const isPlaceholder = text.includes('What do you want to create') || text === '';
        return {
          cleared: isPlaceholder,
          textLen: text.length,
        };
      }).catch(() => ({ cleared: true, textLen: 0 }));

      if (status.cleared) {
        console.log('[FlowAutomator] ✓ Prompt submitted and verified successfully!');
        await new Promise((r) => setTimeout(r, 500));
        return true;
      }

      // Retry Ctrl+Enter midway if still not cleared
      if (attempt === 3) {
        await page.keyboard.down('Control').catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        await page.keyboard.up('Control').catch(() => {});
      }
    }

    // If editor has not cleared after 8 checks, consider submission unconfirmed
    console.warn('[FlowAutomator] ⚠️ Prompt editor still contains text after submission attempts.');
    return false;
  }
}
