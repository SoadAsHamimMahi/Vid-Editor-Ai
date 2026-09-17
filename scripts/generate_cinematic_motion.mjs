import fs from 'fs';
import path from 'path';

const url = 'https://cfr-beginner-postposted-did.trycloudflare.com';

async function generateCinematic() {
  console.log('🚀 Generating Full-Motion Cinematic Video on Cloud GPU...');
  console.log('Target:', url);

  // 1. Upload image
  const imgPath = 'E:\\Youtube\\History of toilet\\Image Videos\\scene-manifest-00-00.03-4970.png';
  const imgBuf = fs.readFileSync(imgPath);
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="image"; filename="scene_1_highmotion.png"\r\n` +
    `Content-Type: image/png\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([header, imgBuf, footer]);

  const upRes = await fetch(`${url}/upload/image`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: payload
  });
  const upData = await upRes.json();
  console.log('✅ Image uploaded:', upData.name);

  // 2. Build High-Motion Workflow
  // length must be 8n + 1 (49 frames = ~2 seconds at 24fps, or 4 seconds at 12fps)
  // strength = 0.65 allows strong camera drift and character movements
  const promptText = 'Cinematic historical documentary tracking shot moving forward through 1500s London street, drifting river mist, tradesmen walking in silhouettes, atmospheric morning light, photorealistic live-action 35mm motion';
  const negText = 'static, still image, frozen, blurry, distorted, jitter, morphing artifacts, low quality';

  const workflow = {
    '1': { inputs: { image: upData.name, upload: 'image' }, class_type: 'LoadImage' },
    '2': { inputs: { ckpt_name: 'ltx-video-2b-v0.9.1.safetensors' }, class_type: 'CheckpointLoaderSimple' },
    '3': { inputs: { clip_name: 'clip/t5xxl_fp8_e4m3fn.safetensors', type: 'ltxv' }, class_type: 'CLIPLoader' },
    '4': { inputs: { text: promptText, clip: ['3', 0] }, class_type: 'CLIPTextEncode' },
    '5': { inputs: { text: negText, clip: ['3', 0] }, class_type: 'CLIPTextEncode' },
    '6': {
      inputs: {
        positive: ['4', 0],
        negative: ['5', 0],
        vae: ['2', 2],
        image: ['1', 0],
        width: 768,
        height: 512,
        length: 49,          // 49 frames of continuous motion!
        batch_size: 1,
        strength: 0.65       // 0.65 unlocks dynamic character and camera motion!
      },
      class_type: 'LTXVImgToVideo'
    },
    '7': {
      inputs: {
        seed: Math.floor(Math.random() * 1000000),
        steps: 20,           // 20 steps for crisp physical motion trajectories
        cfg: 3.5,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1.0,
        model: ['2', 0],
        positive: ['6', 0],
        negative: ['6', 1],
        latent_image: ['6', 2]
      },
      class_type: 'KSampler'
    },
    '8': { inputs: { samples: ['7', 0], vae: ['2', 2] }, class_type: 'VAEDecode' },
    '9': {
      inputs: {
        images: ['8', 0],
        frame_rate: 16,      // 16 fps for 3 seconds of smooth documentary playback
        loop_count: 0,
        filename_prefix: 'Cinematic_Motion_Scene1',
        format: 'video/h264-mp4',
        pingpong: false,
        save_output: true
      },
      class_type: 'VHS_VideoCombine'
    }
  };

  console.log('📡 Submitting Prompt to Tesla T4...');
  const pRes = await fetch(`${url}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: 'motion_generator' })
  });
  const pData = await pRes.json();
  console.log('Prompt response:', pData);

  const promptId = pData.prompt_id;
  if (!promptId) throw new Error('No prompt ID returned');

  console.log(`⏳ Rendering 49 frames on Tesla T4 GPU (Prompt ID: ${promptId})...`);
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const h = await fetch(`${url}/history/${promptId}`).then(r => r.json());
    const job = h[promptId];
    if (job) {
      if (job.status?.status_str === 'error') {
        console.error('Render Error:', JSON.stringify(job.status));
        return;
      }
      console.log('🎉 Generation Complete! Outputs:', JSON.stringify(job.outputs));
      const filename = job.outputs?.['9']?.gifs?.[0]?.filename;
      if (filename) {
        console.log('Downloading', filename, '...');
        const downloadRes = await fetch(`${url}/view?filename=${encodeURIComponent(filename)}&type=output`);
        const buf = Buffer.from(await downloadRes.arrayBuffer());
        const dest = path.resolve('projects_data/videos/scene_0_cinematic_motion.mp4');
        fs.writeFileSync(dest, buf);
        console.log('💾 Successfully saved to', dest, `(${buf.length} bytes)`);
        
        // Update project.json
        const projPath = path.resolve('projects_data/projects/proj-1788629886369/project.json');
        const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));
        proj.scenes[0].status = 'ready';
        delete proj.scenes[0].errorMessage;
        proj.scenes[0].mediaType = 'video';
        proj.scenes[0].localVideoPath = dest;
        proj.scenes[0].videoUrl = `media://${dest.replace(/\\/g, '/')}`;
        fs.writeFileSync(projPath, JSON.stringify(proj, null, 2), 'utf8');
        console.log('🎬 Timeline Scene #1 updated with cinematic motion video!');
      }
      break;
    } else {
      const q = await fetch(`${url}/queue`).then(r => r.json());
      console.log(`Poll ${i+1}: queue_running = ${q.queue_running?.length || 0}`);
    }
  }
}

generateCinematic().catch(console.error);
