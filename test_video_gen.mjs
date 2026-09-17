/**
 * Live Image-to-Video Generation Test
 * Tests the full pipeline: upload image → queue prompt → poll → download video
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TUNNEL_URL = fs.readFileSync(
  path.join(__dirname, 'projects_data', 'current_tunnel.txt'), 'utf8'
).trim();

const IMAGE_PATH = path.join(
  __dirname,
  'projects_data', 'projects', 'default_project', 'images',
  'scene-1787301306534-1.png'
);

const OUTPUT_DIR = path.join(__dirname, 'projects_data', 'videos');
const CLIENT_ID = `test_${Math.random().toString(36).substring(2, 8)}`;

function log(emoji, msg) {
  console.log(`${emoji} [${new Date().toLocaleTimeString()}] ${msg}`);
}

// ── Step 1: Test connection ───────────────────────────────────
async function testConnection() {
  log('🔌', `Connecting to: ${TUNNEL_URL}`);
  const res = await fetch(`${TUNNEL_URL}/system_stats`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const stats = await res.json();
  const gpu = stats?.devices?.[0] || {};
  const vramFreeGB = gpu.vram_free ? (gpu.vram_free / (1024**3)).toFixed(1) : '?';
  const vramTotalGB = gpu.vram_total ? (gpu.vram_total / (1024**3)).toFixed(1) : '?';
  log('✅', `GPU: ${gpu.name} | VRAM: ${vramFreeGB}GB free / ${vramTotalGB}GB`);
  return stats;
}

// ── Step 2: Upload image ──────────────────────────────────────
async function uploadImage() {
  log('📤', `Uploading image: ${path.basename(IMAGE_PATH)} (${(fs.statSync(IMAGE_PATH).size / 1024).toFixed(0)}KB)`);
  const fileBuffer = await fs.readFile(IMAGE_PATH);
  const fileName = `test_${Date.now()}.png`;
  const boundary = `----Boundary${Math.random().toString(36).substring(2)}`;
  const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`);
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([header, fileBuffer, footer]);

  const res = await fetch(`${TUNNEL_URL}/upload/image`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: payload,
  });
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
  const json = await res.json();
  log('✅', `Image uploaded as: ${json.name}`);
  return json.name;
}

// ── Step 3: Inspect available models ─────────────────────────
async function inspectModels() {
  log('🔍', 'Inspecting available models on ComfyUI...');
  const clipRes = await fetch(`${TUNNEL_URL}/object_info/CLIPLoader`);
  const clipInfo = await clipRes.json();
  const clips = clipInfo?.CLIPLoader?.input?.required?.clip_name?.[0] || [];
  const clip = clips.find(c => c.toLowerCase().includes('t5')) || clips[0] || 'clip/t5xxl_fp8_e4m3fn.safetensors';

  const vaeRes = await fetch(`${TUNNEL_URL}/object_info/VAELoader`);
  const vaeInfo = await vaeRes.json();
  const vaes = vaeInfo?.VAELoader?.input?.required?.vae_name?.[0] || [];
  const hasWanVae = vaes.some(v => v.toLowerCase().includes('wan'));

  log('📦', `CLIP model: ${clip}`);
  log('📦', `Wan VAE available: ${hasWanVae ? 'YES → using Wan 2.1' : 'NO → using LTX-Video'}`);
  return { clip, engine: hasWanVae ? 'wan2.1' : 'ltx-video' };
}

// ── Step 4: Build LTX-Video workflow ─────────────────────────
function buildLTXWorkflow(uploadedImageName, clipName) {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const motionIntensity = 6;
  const strength = Math.max(0.40, Math.min(0.85, 0.88 - motionIntensity * 0.05));
  log('⚙️', `Workflow: LTX-Video | strength=${strength.toFixed(2)} | seed=${seed}`);
  return {
    "1": { inputs: { image: uploadedImageName, upload: "image" }, class_type: "LoadImage" },
    "2": { inputs: { ckpt_name: "ltx-video-2b-v0.9.1.safetensors" }, class_type: "CheckpointLoaderSimple" },
    "3": { inputs: { clip_name: clipName, type: "ltxv" }, class_type: "CLIPLoader" },
    "4": { inputs: { text: "cinematic motion, atmospheric, dramatic lighting, subtle camera movement", clip: ["3", 0] }, class_type: "CLIPTextEncode" },
    "5": { inputs: { text: "static, frozen, blurry, distorted, watermark, low quality", clip: ["3", 0] }, class_type: "CLIPTextEncode" },
    "6": { inputs: { positive: ["4", 0], negative: ["5", 0], vae: ["2", 2], image: ["1", 0], width: 768, height: 512, length: 49, batch_size: 1, strength }, class_type: "LTXVImgToVideo" },
    "7": { inputs: { seed, steps: 20, cfg: 3.5, sampler_name: "euler", scheduler: "normal", denoise: 1.0, model: ["2", 0], positive: ["6", 0], negative: ["6", 1], latent_image: ["6", 2] }, class_type: "KSampler" },
    "8": { inputs: { samples: ["7", 0], vae: ["2", 2] }, class_type: "VAEDecode" },
    "9": { inputs: { images: ["8", 0], frame_rate: 16, loop_count: 0, filename_prefix: "TestLTX", format: "video/h264-mp4", pingpong: false, save_output: true }, class_type: "VHS_VideoCombine" },
  };
}

// ── Step 5: Submit prompt ─────────────────────────────────────
async function submitPrompt(workflow) {
  log('🚀', 'Submitting generation job to ComfyUI...');
  const res = await fetch(`${TUNNEL_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: CLIENT_ID }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Prompt rejected HTTP ${res.status}: ${body}`);
  }
  const data = await res.json();
  log('✅', `Job queued! prompt_id: ${data.prompt_id}`);
  return data.prompt_id;
}

// ── Step 6: Poll for completion ───────────────────────────────
async function pollForCompletion(promptId) {
  log('⏳', 'Polling for completion (max 5 minutes)...');
  const startTime = Date.now();
  const MAX_MS = 5 * 60 * 1000;

  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Check history
    const histRes = await fetch(`${TUNNEL_URL}/history/${promptId}`);
    if (histRes.ok) {
      const hist = await histRes.json();
      const job = hist[promptId];
      if (job) {
        if (job.status?.status_str === 'error') {
          const errEntry = (job.status.messages || []).find(m => m[0] === 'execution_error');
          throw new Error(`ComfyUI Error: ${errEntry?.[1]?.exception_message || 'Unknown'}`);
        }
        if (job.outputs) {
          for (const nodeId of Object.keys(job.outputs)) {
            const videos = job.outputs[nodeId].videos || job.outputs[nodeId].gifs || [];
            if (videos.length > 0) {
              log('🎬', `Generation complete! File: ${videos[0].filename} | Time: ${elapsed}s`);
              return videos[0].filename;
            }
          }
        }
      }
    }

    // Check queue status
    const queueRes = await fetch(`${TUNNEL_URL}/queue`);
    if (queueRes.ok) {
      const qData = await queueRes.json();
      const running = (qData.queue_running || []).some(item => item[1] === promptId);
      const pending = (qData.queue_pending || []).some(item => item[1] === promptId);
      const status = running ? '🔴 RENDERING' : pending ? '🟡 QUEUED' : '⚪ WAITING';
      log(running ? '🎨' : '⏳', `${status} | ${elapsed}s elapsed`);
    }

    if (Date.now() - startTime > MAX_MS) {
      throw new Error('Generation timed out after 5 minutes');
    }
  }
  throw new Error('Max poll iterations reached');
}

// ── Step 7: Download video ────────────────────────────────────
async function downloadVideo(filename) {
  log('💾', `Downloading: ${filename}`);
  await fs.ensureDir(OUTPUT_DIR);
  const url = `${TUNNEL_URL}/view?filename=${encodeURIComponent(filename)}&type=output`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const outputPath = path.join(OUTPUT_DIR, `generated_test_${Date.now()}.mp4`);
  await fs.writeFile(outputPath, buffer);
  const sizeMB = (buffer.length / (1024*1024)).toFixed(2);
  log('✅', `Downloaded! ${sizeMB}MB → ${outputPath}`);
  return outputPath;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('\n════════════════════════════════════════════');
  console.log('  🎬 Image-to-Video Live Generation Test');
  console.log('════════════════════════════════════════════\n');

  try {
    await testConnection();
    const uploadedName = await uploadImage();
    const { clip, engine } = await inspectModels();
    const workflow = buildLTXWorkflow(uploadedName, clip);
    const promptId = await submitPrompt(workflow);
    const videoFilename = await pollForCompletion(promptId);
    const localPath = await downloadVideo(videoFilename);

    console.log('\n════════════════════════════════════════════');
    console.log('  ✅ SUCCESS! Video generated successfully!');
    console.log(`  📁 Saved to: ${localPath}`);
    console.log('════════════════════════════════════════════\n');
  } catch (err) {
    console.error('\n════════════════════════════════════════════');
    console.error(`  ❌ FAILED: ${err.message}`);
    console.error('════════════════════════════════════════════\n');
    process.exit(1);
  }
}

main();
