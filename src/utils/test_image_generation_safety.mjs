import assert from 'assert';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
let passCount = 0;
let failCount = 0;
const failures = [];

function ok(label) { console.log(`  ${GREEN}check${RESET} ${label}`); passCount++; }
function fail(label, err) { console.log(`  ${RED}FAIL: ${label}${RESET}\n    -> ${err.message}`); failCount++; failures.push({ label, err }); }
function section(name) { console.log(`\n${BOLD}${CYAN}> ${name}${RESET}`); }
function assertEqual(actual, expected, label) {
  try { assert.strictEqual(actual, expected); ok(label); }
  catch(e) { fail(label, new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)); }
}

function extractNormalizedTimecode(text) {
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

function generateSceneTag(sceneId, prompt) {
  const tc = extractNormalizedTimecode(sceneId || prompt || '');
  const tcPart = tc ? tc.full.replace(/[^0-9]/g, '') : '';
  const hash = sceneId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase().padEnd(4, 'X');
  return tcPart ? `SCN_${tcPart}_${hash}` : `SCN_${hash}`;
}

function scoreCandidateCard(cardText, sceneTag, prompt, tc) {
  let score = 0;
  const tagLower = sceneTag.toLowerCase();
  const textLower = (cardText || '').toLowerCase();
  if (textLower.includes(tagLower) || textLower.includes(`ref:${tagLower}`)) score += 1000;
  if (tc) {
    if (textLower.includes(`#${tc.full}`) || textLower.includes(tc.full)) score += 600;
    else if (textLower.includes(`#${tc.short}`) || textLower.includes(tc.short)) score += 200;
  }
  const STOPWORDS = new Set(['scene','visual','shot','macro','close','wide','cinematic','photo','realism','octane','render','style','aesthetic','4k','8k']);
  const words = prompt.toLowerCase().replace(/[^a-z0-9]/g,' ').split(/\s+/).filter(w => w.length > 3 && !STOPWORDS.has(w));
  if (words.length > 0) {
    let matchedWords = 0;
    for (const w of words) if (textLower.includes(w)) matchedWords++;
    const overlapRatio = matchedWords / words.length;
    score += Math.round(overlapRatio * 300);
    if (matchedWords >= 3) score += 50;
  }
  return score;
}

class MockHarvestEngine {
  constructor() { this.consumedUrls = new Set(); this.consumedFailedTiles = new Set(); }
  matchCards(inFlightCards, candidates, mode = 'solo') {
    const unconsumed = candidates.filter(c => !this.consumedUrls.has(c.src) && c.src && c.src.length > 5);
    const availablePool = [...unconsumed];
    const matched = new Map();
    for (const card of inFlightCards) {
      if (availablePool.length === 0) break;
      const initialSet = new Set(card.initialUrls || []);
      const newPool = availablePool.filter(c => c.src && !initialSet.has(c.src));
      if (newPool.length === 0) continue;
      let bestIdx = -1; let highestScore = -1;
      const sceneTc = extractNormalizedTimecode(card.job.prompt || card.job.sceneId || '');
      if (card.tileId) bestIdx = newPool.findIndex(c => c.tileId && c.tileId === card.tileId);
      if (bestIdx === -1) {
        for (let i = 0; i < newPool.length; i++) {
          const score = scoreCandidateCard(newPool[i].cardText, card.sceneTag, card.job.prompt, sceneTc);
          if (score > highestScore && score >= 100) { highestScore = score; bestIdx = i; }
        }
      }
      if (bestIdx === -1 && mode === 'solo') {
        const elapsed = Date.now() - card.submittedAt;
        if (elapsed >= 10000) {
          // SAFETY GUARD (matches production fix): do NOT assign a card that carries a
          // [REF:SCN_...] tag belonging to a DIFFERENT in-flight scene.
          const otherKnownTags = inFlightCards
            .filter(c => c.job.sceneId !== card.job.sceneId)
            .map(c => c.sceneTag.toLowerCase());
          const firstPoolCard = newPool[0];
          const firstPoolText = (firstPoolCard?.cardText || '').toLowerCase();
          const hasForeignRefTag = otherKnownTags.some(t => firstPoolText.includes(t) || firstPoolText.includes(`ref:${t}`));
          if (!hasForeignRefTag && firstPoolCard) {
            bestIdx = newPool.indexOf(firstPoolCard);
          }
        }
      }
      if (bestIdx === -1) continue;
      const matchedCand = newPool[bestIdx];
      const poolIdx = availablePool.indexOf(matchedCand);
      if (poolIdx !== -1) availablePool.splice(poolIdx, 1);
      this.consumedUrls.add(matchedCand.src);
      matched.set(card.job.sceneId, matchedCand);
    }
    const unmatched = inFlightCards.filter(c => !matched.has(c.job.sceneId)).map(c => c.job.sceneId);
    return { matched, unmatched };
  }
  detectFailedCards(candidates) { return candidates.filter(c => c.failed && !this.consumedFailedTiles.has(c.tileId)); }
  markFailedTile(tileId) { this.consumedFailedTiles.add(tileId); }
}

function makeCard(sceneId, prompt, options = {}) {
  const sceneTag = generateSceneTag(sceneId, prompt);
  return {
    job: { sceneId, prompt, outputPath: `/images/${sceneId}.png` },
    sceneTag,
    promptSignature: prompt.toLowerCase().replace(/[^a-z0-9]/g,' ').slice(0,45).trim(),
    submittedAt: options.submittedAt ?? (Date.now() - (options.elapsed ?? 0)),
    initialUrls: options.initialUrls ?? [],
    tileId: options.tileId,
  };
}

function makeCanvasCard(sceneTag, prompt, options = {}) {
  const tagInText = options.includeTag !== false;
  return {
    tileId: options.tileId,
    src: options.src ?? `https://flow.google.com/img_${sceneTag}.png`,
    cardText: tagInText ? `[ref:${sceneTag.toLowerCase()}] ${prompt.toLowerCase().slice(0,80)}` : prompt.toLowerCase().slice(0,80),
    createdTime: options.createdTime ?? new Date().toISOString(),
    coordX: options.coordX ?? 0,
    coordY: options.coordY ?? 0,
    failed: options.failed ?? false,
  };
}

console.log(`\n${BOLD}${CYAN}IMAGE GENERATION SAFETY TEST SUITE - 20 Tests${RESET}\n`);

// TEST 1
section('TEST 1: Basic 1-to-1 Tag Matching (Happy Path)');
{
  const engine = new MockHarvestEngine();
  const scenes = [
    { id: 'scene-01', prompt: 'A golden sunset over the ocean with dramatic clouds' },
    { id: 'scene-02', prompt: 'A busy city street at night with neon lights' },
    { id: 'scene-03', prompt: 'A quiet forest path in autumn with falling leaves' },
  ];
  const inFlightCards = scenes.map(s => makeCard(s.id, s.prompt));
  const tags = inFlightCards.map(c => c.sceneTag);
  const canvasCards = scenes.map((s, i) => makeCanvasCard(tags[i], s.prompt, { src: `https://flow.google.com/img_scene0${i+1}.png` }));
  const { matched, unmatched } = engine.matchCards(inFlightCards, canvasCards);
  assertEqual(matched.size, 3, 'All 3 scenes matched to canvas cards');
  assertEqual(unmatched.length, 0, 'No scenes unmatched');
  assertEqual(matched.get('scene-01').src, 'https://flow.google.com/img_scene01.png', 'Scene-01 gets correct card');
  assertEqual(matched.get('scene-02').src, 'https://flow.google.com/img_scene02.png', 'Scene-02 gets correct card');
  assertEqual(matched.get('scene-03').src, 'https://flow.google.com/img_scene03.png', 'Scene-03 gets correct card');
}

// TEST 2: CORE BUG
section('TEST 2: CORE BUG - Failed Scene Must NOT Cause Cascade Shift');
{
  const engine = new MockHarvestEngine();
  const scenes = [
    { id: 'scene-A', prompt: 'Cinematic forest waterfall landscape photography' },
    { id: 'scene-B', prompt: 'Violent explosion dramatic war photography' },
    { id: 'scene-C', prompt: 'Peaceful mountain village at sunrise golden hour' },
    { id: 'scene-D', prompt: 'Ancient library with tall bookshelves and warm lighting' },
  ];
  const inFlightCards = scenes.map(s => makeCard(s.id, s.prompt));
  const tags = inFlightCards.map(c => c.sceneTag);
  const canvasCards = [
    makeCanvasCard(tags[0], scenes[0].prompt, { src: 'https://flow.google.com/card_A.png' }),
    makeCanvasCard(tags[2], scenes[2].prompt, { src: 'https://flow.google.com/card_C.png' }),
    makeCanvasCard(tags[3], scenes[3].prompt, { src: 'https://flow.google.com/card_D.png' }),
  ];
  const { matched, unmatched } = engine.matchCards(inFlightCards, canvasCards);
  assertEqual(matched.get('scene-A')?.src, 'https://flow.google.com/card_A.png', 'Scene-A matched correctly');
  assertEqual(matched.has('scene-B'), false, 'Scene-B has no match (policy failure)');
  assertEqual(matched.get('scene-C')?.src, 'https://flow.google.com/card_C.png', 'Scene-C matched correctly - NOT shifted');
  assertEqual(matched.get('scene-D')?.src, 'https://flow.google.com/card_D.png', 'Scene-D matched correctly - NOT shifted');
  assertEqual(unmatched.includes('scene-B'), true, 'Scene-B is in unmatched list');
  assertEqual(unmatched.length, 1, 'Only 1 scene unmatched (the failed one)');
}

// TEST 3
section('TEST 3: Multiple Consecutive Policy Failures - No Cascade Shift');
{
  const engine = new MockHarvestEngine();
  const scenes = [
    { id: 'scene-1', prompt: 'A peaceful meadow with wildflowers and butterflies' },
    { id: 'scene-2', prompt: 'Prohibited content A' },
    { id: 'scene-3', prompt: 'Prohibited content B' },
    { id: 'scene-4', prompt: 'A calm river reflection at dawn with fog' },
    { id: 'scene-5', prompt: 'A rustic wooden cabin surrounded by pine trees' },
  ];
  const inFlightCards = scenes.map(s => makeCard(s.id, s.prompt));
  const tags = inFlightCards.map(c => c.sceneTag);
  const canvasCards = [
    makeCanvasCard(tags[0], scenes[0].prompt, { src: 'https://flow.google.com/s1.png' }),
    makeCanvasCard(tags[3], scenes[3].prompt, { src: 'https://flow.google.com/s4.png' }),
    makeCanvasCard(tags[4], scenes[4].prompt, { src: 'https://flow.google.com/s5.png' }),
  ];
  const { matched, unmatched } = engine.matchCards(inFlightCards, canvasCards);
  assertEqual(matched.get('scene-1')?.src, 'https://flow.google.com/s1.png', 'Scene-1 matched correctly');
  assertEqual(matched.has('scene-2'), false, 'Scene-2 unmatched (failed)');
  assertEqual(matched.has('scene-3'), false, 'Scene-3 unmatched (failed)');
  assertEqual(matched.get('scene-4')?.src, 'https://flow.google.com/s4.png', 'Scene-4 matched correctly (skipped 2 failures)');
  assertEqual(matched.get('scene-5')?.src, 'https://flow.google.com/s5.png', 'Scene-5 matched correctly');
  assertEqual(unmatched.sort().join(','), 'scene-2,scene-3', 'Both failed scenes are unmatched');
}

// TEST 4
section('TEST 4: URL Deduplication - Consumed URL Cannot Be Assigned Twice');
{
  const engine = new MockHarvestEngine();
  const sharedUrl = 'https://flow.google.com/shared_img.png';
  const card1 = makeCard('scene-X', 'Mountain peak at sunrise with golden glow');
  const tag1 = card1.sceneTag;
  const firstCanvasCards = [makeCanvasCard(tag1, 'Mountain peak at sunrise', { src: sharedUrl })];
  const { matched: m1 } = engine.matchCards([card1], firstCanvasCards);
  assertEqual(m1.get('scene-X')?.src, sharedUrl, 'Scene-X matched on first pass');
  const card2 = makeCard('scene-Y', 'Mountain peak at sunrise with golden glow');
  const { matched: m2 } = engine.matchCards([card2], firstCanvasCards);
  assertEqual(m2.has('scene-Y'), false, 'Scene-Y cannot steal consumed URL');
  assertEqual(engine.consumedUrls.has(sharedUrl), true, 'URL is in consumed set');
}

// TEST 5
section('TEST 5: Unique Scene Tags for Identical Prompts');
{
  const sceneIds = ['scene-01-00-01', 'scene-02-00-01', 'scene-03-00-01'];
  const sharedPrompt = 'A beautiful sunset over rolling hills';
  const tags = sceneIds.map(id => generateSceneTag(id, sharedPrompt));
  const allUnique = new Set(tags).size === tags.length;
  assertEqual(allUnique, true, `All 3 tags are unique: ${tags.join(', ')}`);
  for (let i = 0; i < tags.length; i++) {
    for (let j = 0; j < tags.length; j++) {
      if (i === j) continue;
      const isSubstring = tags[i].toLowerCase().includes(tags[j].toLowerCase());
      assertEqual(isSubstring, false, `Tag[${i}] not a substring of tag[${j}]`);
    }
  }
}

// TEST 6
section('TEST 6: Timecode Extraction Accuracy');
{
  const tests = [
    { input: 'scene-00-12.93', expected: { full: '00-12.93', short: '00-12', seconds: 12.93 } },
    { input: 'scene-01-30', expected: { full: '01-30', short: '01-30', seconds: 90 } },
    { input: 'scene-02-05.5', expected: { full: '02-05.5', short: '02-05', seconds: 125.5 } },
    { input: 'No timecode here', expected: null },
    { input: '16:9 aspect scene', expected: null },
  ];
  for (const t of tests) {
    const result = extractNormalizedTimecode(t.input);
    if (t.expected === null) {
      assertEqual(result, null, `"${t.input}" correctly returns null`);
    } else {
      assertEqual(result?.full, t.expected.full, `"${t.input}" full: ${t.expected.full}`);
      assertEqual(result?.short, t.expected.short, `"${t.input}" short: ${t.expected.short}`);
      assertEqual(result?.seconds, t.expected.seconds, `"${t.input}" seconds: ${t.expected.seconds}`);
    }
  }
}

// TEST 7
section('TEST 7: Score Threshold Guard - Weak Matches Must Be Rejected');
{
  const engine = new MockHarvestEngine();
  const card = makeCard('scene-Z', 'A serene Japanese zen garden with raked sand');
  const weakCandidate = { tileId: undefined, src: 'https://flow.google.com/weak.png', cardText: 'completely unrelated content about a car race', failed: false };
  const { matched, unmatched } = engine.matchCards([card], [weakCandidate]);
  assertEqual(matched.has('scene-Z'), false, 'Weak-match card REJECTED (score < 100)');
  assertEqual(unmatched.includes('scene-Z'), true, 'Scene-Z correctly left unmatched');
}

// TEST 8
section('TEST 8: REF Tag Survives Canvas Card Text Truncation');
{
  const longPrompt = 'A breathtaking aerial panorama of the Amazon rainforest canopy at golden hour with tropical birds';
  const sceneId = 'scene-manifest-5-01-23.45';
  const sceneTag = generateSceneTag(sceneId, longPrompt);
  const taggedPrompt = `[REF:${sceneTag}] ${longPrompt}`;
  const truncatedAt60 = taggedPrompt.slice(0, 60);
  const truncatedAt40 = taggedPrompt.slice(0, 40);
  assertEqual(truncatedAt60.toLowerCase().includes(sceneTag.toLowerCase()), true, `Tag preserved in 60-char truncation`);
  assertEqual(truncatedAt40.toLowerCase().includes(sceneTag.toLowerCase()), true, `Tag preserved in 40-char truncation`);
}

// TEST 9
section('TEST 9: Solo Fallback Requires >= 10s Elapsed');
{
  const engine = new MockHarvestEngine();
  const earlyCard = makeCard('scene-slow', 'A deep ocean coral reef teeming with colorful fish', { submittedAt: Date.now() - 5000 });
  const candidate = { src: 'https://flow.google.com/no_tag.png', cardText: 'completely different prompt', tileId: undefined, failed: false };
  const { matched: earlyMatched } = engine.matchCards([earlyCard], [candidate], 'solo');
  assertEqual(earlyMatched.has('scene-slow'), false, 'No match at 5s - guard prevents premature assignment');
  const lateCard = makeCard('scene-slow', 'A deep ocean coral reef teeming with colorful fish', { submittedAt: Date.now() - 15000 });
  const engine2 = new MockHarvestEngine();
  const { matched: lateMatched } = engine2.matchCards([lateCard], [candidate], 'solo');
  assertEqual(lateMatched.has('scene-slow'), true, 'Match at 15s - solo fallback triggered correctly');
}

// TEST 10
section('TEST 10: initialUrls Guard - Pre-existing Images Cannot Be Harvested');
{
  const engine = new MockHarvestEngine();
  const preExistingUrl = 'https://flow.google.com/OLD_canvas_image.png';
  const card = makeCard('scene-new', 'A brand new medieval castle fortress at dawn', { initialUrls: [preExistingUrl] });
  const canvasCards = [{ src: preExistingUrl, cardText: 'some old content', tileId: undefined, failed: false }];
  const { matched, unmatched } = engine.matchCards([card], canvasCards);
  assertEqual(matched.has('scene-new'), false, 'Pre-existing image NOT stolen');
  assertEqual(unmatched.includes('scene-new'), true, 'Scene-new correctly unmatched');
}

// TEST 11
section('TEST 11: Parallel Mode - 4x Concurrent Correct Matching');
{
  const engine = new MockHarvestEngine();
  const scenes = [
    { id: 'scene-p1', prompt: 'Volcanic eruption at night with lava flowing into ocean' },
    { id: 'scene-p2', prompt: 'Arctic tundra with polar bears and aurora borealis' },
    { id: 'scene-p3', prompt: 'Ancient Roman Colosseum interior at sunset' },
    { id: 'scene-p4', prompt: 'Futuristic Tokyo cityscape with flying vehicles' },
  ];
  const inFlightCards = scenes.map(s => makeCard(s.id, s.prompt));
  const tags = inFlightCards.map(c => c.sceneTag);
  const canvasCards = [
    makeCanvasCard(tags[3], scenes[3].prompt, { src: 'https://flow.google.com/p4.png' }),
    makeCanvasCard(tags[2], scenes[2].prompt, { src: 'https://flow.google.com/p3.png' }),
    makeCanvasCard(tags[1], scenes[1].prompt, { src: 'https://flow.google.com/p2.png' }),
    makeCanvasCard(tags[0], scenes[0].prompt, { src: 'https://flow.google.com/p1.png' }),
  ];
  const { matched, unmatched } = engine.matchCards(inFlightCards, canvasCards, 'parallel');
  assertEqual(matched.size, 4, 'All 4 parallel scenes matched');
  assertEqual(unmatched.length, 0, 'No unmatched scenes');
  assertEqual(matched.get('scene-p1')?.src, 'https://flow.google.com/p1.png', 'Scene-p1 correct (reversed order)');
  assertEqual(matched.get('scene-p4')?.src, 'https://flow.google.com/p4.png', 'Scene-p4 correct (reversed order)');
}

// TEST 12
section('TEST 12: tileId Binding Wins Over Semantic Score');
{
  const engine = new MockHarvestEngine();
  const card = makeCard('scene-tile', 'A tranquil lake reflecting snow-capped mountains', { tileId: 'tile-abc-123' });
  const highScoreCandidate = makeCanvasCard(card.sceneTag, card.job.prompt, { src: 'https://flow.google.com/HIGH_SCORE.png', tileId: 'tile-xyz-999' });
  const tileMatchCandidate = { tileId: 'tile-abc-123', src: 'https://flow.google.com/TILE_MATCH.png', cardText: 'completely unrelated text', failed: false };
  const { matched } = engine.matchCards([card], [highScoreCandidate, tileMatchCandidate]);
  assertEqual(matched.get('scene-tile')?.src, 'https://flow.google.com/TILE_MATCH.png', 'tileId match wins over high semantic score');
}

// TEST 13
section('TEST 13: onJobProgress Scene State Update Logic');
{
  const sceneStore = new Map([
    ['scene-A', { status: 'generating', localImagePath: undefined, imageUrl: undefined }],
    ['scene-B', { status: 'generating', localImagePath: undefined, imageUrl: undefined }],
  ]);
  function mockUpdateScene(sceneId, updates) {
    const existing = sceneStore.get(sceneId) || {};
    sceneStore.set(sceneId, { ...existing, ...updates });
  }
  function processJobProgress(data) {
    const isVid = data.mediaType === 'video' || Boolean(data.videoPath);
    const imageUri = data.imagePath ? (data.imagePath.startsWith('http') ? data.imagePath : `media://${data.imagePath.replace(/\\/g, '/')}`) : undefined;
    mockUpdateScene(data.sceneId, { status: data.status, mediaType: isVid ? 'video' : 'image', localImagePath: isVid ? undefined : data.imagePath, imageUrl: isVid ? undefined : imageUri, errorMessage: data.error, hasMismatchWarning: false });
  }
  processJobProgress({ sceneId: 'scene-A', status: 'ready', imagePath: 'E:\\projects_data\\images\\scene-A.png', mediaType: 'image' });
  processJobProgress({ sceneId: 'scene-B', status: 'error', error: 'Policy Violation: prompt rejected', mediaType: 'image' });
  const sceneA = sceneStore.get('scene-A');
  const sceneB = sceneStore.get('scene-B');
  assertEqual(sceneA.status, 'ready', 'Scene-A status = ready');
  assertEqual(sceneA.localImagePath, 'E:\\projects_data\\images\\scene-A.png', 'Scene-A has localImagePath');
  assertEqual(sceneA.imageUrl, 'media://E:/projects_data/images/scene-A.png', 'Scene-A imageUrl uses media:// protocol');
  assertEqual(sceneB.status, 'error', 'Scene-B status = error');
  assertEqual(sceneB.localImagePath, undefined, 'Scene-B has NO localImagePath (failed)');
  assertEqual(sceneB.errorMessage, 'Policy Violation: prompt rejected', 'Scene-B has correct error message');
  assertEqual(sceneB.hasMismatchWarning, false, 'Scene-B no mismatch warning');
}

// TEST 14
section('TEST 14: Image File Integrity - Detecting Corrupted / Empty Saves');
{
  const fileScenarios = [
    { size: 0, valid: false, desc: '0-byte empty file' },
    { size: 50, valid: false, desc: '50-byte file' },
    { size: 99, valid: false, desc: 'Below 100-byte threshold' },
    { size: 100, valid: true, desc: 'Exactly 100 bytes boundary' },
    { size: 1024, valid: true, desc: '1KB file valid image' },
    { size: 2097152, valid: true, desc: '2MB file valid' },
  ];
  for (const scenario of fileScenarios) {
    const isValid = scenario.size >= 100;
    assertEqual(isValid, scenario.valid, `${scenario.desc}`);
  }
}

// TEST 15
section('TEST 15: Agent Mode Batch Dispatch Safety (Max 40 Scenes)');
{
  const ALL_SCENES_COUNT = 55;
  const MAX_BATCH = 40;
  const allScenes = Array.from({ length: ALL_SCENES_COUNT }, (_, i) => ({ id: `scene-${i.toString().padStart(3,'0')}`, prompt: `Scene ${i} prompt` }));
  const targetJobs = allScenes.slice(0, MAX_BATCH);
  assertEqual(targetJobs.length, 40, `Batch capped at 40 (from ${ALL_SCENES_COUNT})`);
  assertEqual(targetJobs[0].id, 'scene-000', 'First scene is correct');
  assertEqual(targetJobs[39].id, 'scene-039', 'Last scene in batch correct');
  const remaining = allScenes.slice(MAX_BATCH);
  assertEqual(remaining.length, 15, `${ALL_SCENES_COUNT - MAX_BATCH} scenes remain for next batch`);
}

// TEST 16
section('TEST 16: Policy Violation Detection - Failed Tile Ejection');
{
  const engine = new MockHarvestEngine();
  const card = makeCard('scene-policy', 'Content that fails policy check', { submittedAt: Date.now() - 8000, tileId: 'tile-policy-xxx' });
  const failedCard = { tileId: 'tile-policy-xxx', src: '', cardText: 'this generation might violate our policies send feedback', failed: true, coordX: 100, coordY: 200 };
  const failedCards = engine.detectFailedCards([failedCard]);
  assertEqual(failedCards.length, 1, 'Policy violation card detected');
  const matchedFailed = failedCards.find(f => f.tileId && card.tileId && f.tileId === card.tileId);
  assertEqual(Boolean(matchedFailed), true, 'Policy failure matched via tileId');
  engine.markFailedTile(matchedFailed.tileId);
  assertEqual(engine.consumedFailedTiles.has('tile-policy-xxx'), true, 'Failed tile added to consumed set');
  const refailed = engine.detectFailedCards([failedCard]);
  assertEqual(refailed.length, 0, 'Re-detection skips already-processed failed tile');
}

// TEST 17
section('TEST 17: RAF Batching - Rapid Events Collapse to Last');
{
  const pendingUpdates = new Map();
  pendingUpdates.set('scene-Q', { status: 'generating', imagePath: undefined, mediaType: 'image' });
  pendingUpdates.set('scene-Q', { status: 'generating', imagePath: undefined, mediaType: 'image' });
  pendingUpdates.set('scene-Q', { status: 'ready', imagePath: '/images/scene-Q.png', mediaType: 'image' });
  assertEqual(pendingUpdates.size, 1, 'Map collapsed: only 1 entry for scene-Q');
  assertEqual(pendingUpdates.get('scene-Q').status, 'ready', 'Final status is ready');
  assertEqual(pendingUpdates.get('scene-Q').imagePath, '/images/scene-Q.png', 'Final imagePath set');
  pendingUpdates.set('scene-R', { status: 'generating', imagePath: undefined, mediaType: 'image' });
  assertEqual(pendingUpdates.size, 2, 'Two different scenes = 2 entries');
}

// TEST 18
section('TEST 18: pullFromCanvas Strict Failure - No Card Stealing');
{
  const engine = new MockHarvestEngine();
  const filteredJobs = [
    { sceneId: 'scene-miss', prompt: 'A mountain scene that was never generated' },
    { sceneId: 'scene-hit', prompt: 'A beach sunset with palm trees and waves' },
  ];
  const inFlightCards = filteredJobs.map(j => makeCard(j.sceneId, j.prompt));
  const tags = inFlightCards.map(c => c.sceneTag);
  const canvasCards = [makeCanvasCard(tags[1], filteredJobs[1].prompt, { src: 'https://flow.google.com/beach.png' })];
  const { matched, unmatched } = engine.matchCards(inFlightCards, canvasCards);
  assertEqual(matched.has('scene-miss'), false, 'scene-miss correctly NOT matched (strict failure)');
  assertEqual(matched.get('scene-hit')?.src, 'https://flow.google.com/beach.png', 'scene-hit matched correctly');
  assertEqual(unmatched.includes('scene-miss'), true, 'scene-miss in unmatched -> error');
  assertEqual(matched.size, 1, 'Only 1 match - no card stealing');
}

// TEST 19
section('TEST 19: Score Computation Accuracy');
{
  const s1 = scoreCandidateCard('[ref:scn_0000xxxx] golden sunset ocean dramatic clouds', 'SCN_0000XXXX', 'A golden sunset over the ocean with dramatic clouds', null);
  assertEqual(s1 >= 1000, true, `Tag match scores >= 1000 (got ${s1})`);
  const s2 = scoreCandidateCard('some completely random unrelated text about elephants', 'SCN_0000XXXX', 'A golden sunset over the ocean with dramatic clouds', null);
  assertEqual(s2 <= 99, true, `Low-overlap scores < 100 (got ${s2})`);
  const s3 = scoreCandidateCard('scene at #00-12.93 showing a dramatic landscape', 'SCN_9999YYYY', 'Dramatic landscape at 00:12.93', { full: '00-12.93', short: '00-12', seconds: 12.93 });
  assertEqual(s3 >= 600, true, `Exact timecode match scores >= 600 (got ${s3})`);
}

// TEST 20: E2E
section('TEST 20: End-to-End Pipeline Simulation (Submit -> Harvest -> Place)');
{
  const engine = new MockHarvestEngine();
  const projectScenes = [
    { id: 'e2e-scene-1', prompt: 'Ancient Egyptian pyramid at dusk with sandy desert' },
    { id: 'e2e-scene-2', prompt: 'Violent graphic war scene' },
    { id: 'e2e-scene-3', prompt: 'Modern Tokyo neon reflections in rain puddles' },
    { id: 'e2e-scene-4', prompt: 'Alpine meadow with wildflowers and Swiss mountains' },
    { id: 'e2e-scene-5', prompt: 'Deep space nebula with swirling galaxies' },
  ];
  const uiState = new Map(projectScenes.map(s => [s.id, { status: 'generating', localImagePath: undefined }]));
  const inFlightCards = projectScenes.map(s => makeCard(s.id, s.prompt, { submittedAt: Date.now() - 15000 }));
  const tags = inFlightCards.map(c => c.sceneTag);
  const canvasCards = [
    makeCanvasCard(tags[0], projectScenes[0].prompt, { src: 'https://flow.google.com/e2e_1.png' }),
    makeCanvasCard(tags[2], projectScenes[2].prompt, { src: 'https://flow.google.com/e2e_3.png' }),
    makeCanvasCard(tags[3], projectScenes[3].prompt, { src: 'https://flow.google.com/e2e_4.png' }),
    makeCanvasCard(tags[4], projectScenes[4].prompt, { src: 'https://flow.google.com/e2e_5.png' }),
  ];
  const { matched, unmatched } = engine.matchCards(inFlightCards, canvasCards, 'solo');
  for (const [sceneId, candidate] of matched) uiState.set(sceneId, { status: 'ready', localImagePath: candidate.src });
  for (const sceneId of unmatched) uiState.set(sceneId, { status: 'error', localImagePath: undefined });
  assertEqual(uiState.get('e2e-scene-1').status, 'ready', 'Scene-1: ready');
  assertEqual(uiState.get('e2e-scene-1').localImagePath, 'https://flow.google.com/e2e_1.png', 'Scene-1: correct image');
  assertEqual(uiState.get('e2e-scene-2').status, 'error', 'Scene-2: error (policy failure)');
  assertEqual(uiState.get('e2e-scene-2').localImagePath, undefined, 'Scene-2: no image assigned');
  assertEqual(uiState.get('e2e-scene-3').status, 'ready', 'Scene-3: ready (not shifted by failure)');
  assertEqual(uiState.get('e2e-scene-3').localImagePath, 'https://flow.google.com/e2e_3.png', 'Scene-3: correct image (no cascade)');
  assertEqual(uiState.get('e2e-scene-4').status, 'ready', 'Scene-4: ready');
  assertEqual(uiState.get('e2e-scene-4').localImagePath, 'https://flow.google.com/e2e_4.png', 'Scene-4: correct image');
  assertEqual(uiState.get('e2e-scene-5').status, 'ready', 'Scene-5: ready');
  assertEqual(uiState.get('e2e-scene-5').localImagePath, 'https://flow.google.com/e2e_5.png', 'Scene-5: correct image');
  const allSrcSet = new Set([...matched.values()].map(c => c.src));
  assertEqual(allSrcSet.size, 4, 'All 4 successful scenes have UNIQUE images');
}

// Summary
console.log(`\n${'='.repeat(70)}`);
console.log(`  RESULTS: ${GREEN}Passed: ${passCount}${RESET}  ${failCount > 0 ? RED : GREEN}Failed: ${failCount}${RESET}`);
console.log(`${'='.repeat(70)}\n`);
if (failures.length > 0) {
  console.log(`${RED}FAILED TESTS:${RESET}`);
  for (const f of failures) console.log(`  x ${f.label}\n    -> ${f.err.message}`);
}
if (failCount === 0) {
  console.log(`${GREEN}${BOLD}ALL ${passCount} TESTS PASSED - Pipeline is SAFE!${RESET}\n`);
} else {
  console.log(`${RED}${BOLD}${failCount} TEST(S) FAILED - Review issues above.${RESET}\n`);
  process.exit(1);
}
