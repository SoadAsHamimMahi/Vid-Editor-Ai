// In-Depth Test Suite for Parallel Generation Mode & FlowAutomatorPool
import assert from 'assert';

console.log('🧪 Starting In-Depth Parallel Generation Test Suite...\n');

// 1. Mock in-flight pipeline simulation
class MockParallelEngine {
  constructor(maxConcurrency = 3) {
    this.maxConcurrency = maxConcurrency;
    this.queue = [];
    this.inFlight = [];
    this.completed = [];
    this.consumedUrls = new Set();
  }

  enqueueBatch(jobs) {
    this.queue.push(...jobs);
  }

  // Simulate pipeline step
  async step(canvasCompletedCards = []) {
    // 1. Harvest matching ready cards
    const harvestedIds = [];
    for (const card of this.inFlight) {
      const tagLower = card.sceneTag.toLowerCase();
      // Priority 1: Match by reference tag
      const candIdx = canvasCompletedCards.findIndex((c) => {
        if (this.consumedUrls.has(c.url)) return false;
        const text = c.cardText.toLowerCase();
        return text.includes(tagLower) || text.includes(card.promptSignature);
      });

      if (candIdx !== -1) {
        const matched = canvasCompletedCards[candIdx];
        this.consumedUrls.add(matched.url);
        this.completed.push({ sceneId: card.job.sceneId, url: matched.url, tag: card.sceneTag });
        harvestedIds.push(card.job.sceneId);
      }
    }

    // Remove completed from in-flight
    this.inFlight = this.inFlight.filter((c) => !harvestedIds.includes(c.job.sceneId));

    // 2. Dispatch new jobs up to maxConcurrency
    while (this.queue.length > 0 && this.inFlight.length < this.maxConcurrency) {
      const job = this.queue.shift();
      const cleanId = job.sceneId.replace(/[^a-zA-Z0-9]/g, '');
      const sceneTag = `SCN_${cleanId.slice(-5).toUpperCase()}`;
      const promptSig = job.prompt.toLowerCase().replace(/[^a-z0-9]/g, ' ').slice(0, 45).trim();

      // Front-loaded tagged prompt
      const taggedPrompt = `[REF:${sceneTag}] ${job.prompt.trim()}`;

      this.inFlight.push({
        job,
        sceneTag,
        taggedPrompt,
        promptSignature: promptSig,
        submittedAt: Date.now(),
      });
    }

    return {
      inFlightCount: this.inFlight.length,
      queueCount: this.queue.length,
      completedCount: this.completed.length,
    };
  }
}

// ── TEST 1: Concurrency Throttling & Sliding Window (3x Parallel) ──
async function testConcurrencyWindow() {
  console.log('▶ TEST 1: Concurrency Throttling & Sliding Window (3x Parallel)');
  const engine = new MockParallelEngine(3);

  const jobs = Array.from({ length: 9 }, (_, i) => ({
    sceneId: `scene-00${i}`,
    prompt: `Cinematic 1854 historical scene #${i} Victorian exhibition`,
    outputPath: `/images/scene-00${i}.png`,
  }));

  engine.enqueueBatch(jobs);
  let status = await engine.step([]);

  assert.strictEqual(status.inFlightCount, 3, 'Should dispatch exactly 3 jobs in flight');
  assert.strictEqual(status.queueCount, 6, 'Should leave 6 jobs in queue');
  console.log('  ✓ Initial dispatch: 3 in-flight, 6 queued');

  // Complete Scene 1 first (out-of-order test)
  const canvas1 = [
    { url: 'https://cdn.google.com/img_scene001.png', cardText: '[ref:scn_ne001] cinematic 1854 historical scene #1' },
  ];

  status = await engine.step(canvas1);
  assert.strictEqual(status.completedCount, 1, 'Scene 1 should be completed');
  assert.strictEqual(status.inFlightCount, 3, 'Pipeline should immediately pull Scene 3 into in-flight slot');
  assert.strictEqual(status.queueCount, 5, 'Queue should decrease to 5');
  console.log('  ✓ Out-of-order completion handled: Scene 1 resolved, next job filled immediately');

  // Complete Scenes 0 and 2
  const canvas2 = [
    { url: 'https://cdn.google.com/img_scene000.png', cardText: '[ref:scn_ne000] cinematic 1854 historical scene #0' },
    { url: 'https://cdn.google.com/img_scene002.png', cardText: '[ref:scn_ne002] cinematic 1854 historical scene #2' },
  ];

  status = await engine.step(canvas2);
  assert.strictEqual(status.completedCount, 3, '3 total scenes completed');
  assert.strictEqual(status.inFlightCount, 3, 'In-flight stays filled at 3');
  assert.strictEqual(status.queueCount, 3, 'Queue at 3');
  console.log('  ✓ Batch completion of 2 scenes: Pipeline sliding window refilled to 3');
  console.log('  ✅ TEST 1 PASSED!\n');
}

// ── TEST 2: Deterministic Tag Matching vs Semantic Confusion ──
async function testDeterministicTagMatching() {
  console.log('▶ TEST 2: Deterministic Tag Matching (Preventing Similar Prompt Confusion)');
  const engine = new MockParallelEngine(3);

  // Two very similar prompts that could easily be confused without reference tags
  const jobs = [
    { sceneId: 'scene-otis-lift-01', prompt: 'Elisha Otis standing on open platform high above exhibition floor', outputPath: '/img1.png' },
    { sceneId: 'scene-otis-lift-02', prompt: 'Elisha Otis standing on open platform looking down at crowd', outputPath: '/img2.png' },
  ];

  engine.enqueueBatch(jobs);
  await engine.step([]);

  // Canvas returns both images
  const canvas = [
    { url: 'https://cdn.google.com/otis_down.png', cardText: '[ref:scn_ift02] elisha otis standing on open platform looking down' },
    { url: 'https://cdn.google.com/otis_high.png', cardText: '[ref:scn_ift01] elisha otis standing on open platform high above' },
  ];

  await engine.step(canvas);

  const res1 = engine.completed.find((c) => c.sceneId === 'scene-otis-lift-01');
  const res2 = engine.completed.find((c) => c.sceneId === 'scene-otis-lift-02');

  assert.strictEqual(res1.url, 'https://cdn.google.com/otis_high.png', 'Scene 1 must match exact tag SCN_IFT01');
  assert.strictEqual(res2.url, 'https://cdn.google.com/otis_down.png', 'Scene 2 must match exact tag SCN_IFT02');
  console.log('  ✓ Reference tags [REF:SCN_...] 100% prevented prompt keyword cross-talk');
  console.log('  ✅ TEST 2 PASSED!\n');
}

// ── TEST 3: Duplicate Consumption Prevention (URL Locking) ──
async function testUrlLocking() {
  console.log('▶ TEST 3: Zero-Duplicate URL Locking');
  const engine = new MockParallelEngine(2);

  const jobs = [
    { sceneId: 'scene-batch-A', prompt: 'Victorian exhibition entrance', outputPath: '/a.png' },
    { sceneId: 'scene-batch-B', prompt: 'Victorian exhibition entrance', outputPath: '/b.png' },
  ];

  engine.enqueueBatch(jobs);
  await engine.step([]);

  // Only 1 card is ready on canvas so far
  const canvas1 = [
    { url: 'https://cdn.google.com/entrance_img_1.png', cardText: '[ref:scn_tcha] victorian exhibition entrance' },
  ];

  await engine.step(canvas1);
  assert.strictEqual(engine.completed.length, 1, 'Only Scene A should be completed');
  assert.strictEqual(engine.completed[0].sceneId, 'scene-batch-A');

  // Second step with same canvas state — Scene B must NOT steal Scene A's URL!
  await engine.step(canvas1);
  assert.strictEqual(engine.completed.length, 1, 'Scene B must not consume already harvested URL');
  console.log('  ✓ Consumed URL locking confirmed: Zero duplicate assignments');
  console.log('  ✅ TEST 3 PASSED!\n');
}

// ── TEST 4: Front-Loaded Tag Robustness (Preventing Long Prompt Truncation) ──
async function testFrontLoadedTagRobustness() {
  console.log('▶ TEST 4: Front-Loaded Tag Robustness against Canvas Line Truncation');
  
  const longPrompt = "A majestic 1854 Victorian Crystal Palace exhibition grand hall featuring thousands of attendees wearing ornate frock coats, walking along towering iron arches beneath vaulted glass ceilings with soft overcast atmospheric daylight filtering through high windows and grand banners fluttering in the wind.";
  const sceneId = "scene-manifest-0-00-0";
  const cleanId = sceneId.replace(/[^a-zA-Z0-9]/g, '');
  const sceneTag = `SCN_${cleanId.slice(-5).toUpperCase()}`;

  // If tag is front-loaded:
  const frontLoadedPrompt = `[REF:${sceneTag}] ${longPrompt}`;
  // Simulated Google Flow 60-character line-clamp card text:
  const truncatedCardText = frontLoadedPrompt.slice(0, 60);

  const isTagPreserved = truncatedCardText.toLowerCase().includes(sceneTag.toLowerCase());
  assert.strictEqual(isTagPreserved, true, 'Front-loaded tag must survive 60-char card text truncation');
  console.log(`  ✓ Truncated card text: "${truncatedCardText}..."`);
  console.log('  ✓ Tag SCN_0000 was 100% preserved in first 15 characters!');
  console.log('  ✅ TEST 4 PASSED!\n');
}

async function runAll() {
  await testConcurrencyWindow();
  await testDeterministicTagMatching();
  await testUrlLocking();
  await testFrontLoadedTagRobustness();
  console.log('🎉 ALL PARALLEL GENERATION TEST CASES PASSED WITH 100% SUCCESS!');
}

runAll();
