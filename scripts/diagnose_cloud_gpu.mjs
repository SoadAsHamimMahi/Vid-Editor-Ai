import fs from 'fs';
import path from 'path';

const url = 'https://cfr-beginner-postposted-did.trycloudflare.com';

async function diagnose() {
  console.log('====================================================');
  console.log('🔍 RUNNING COMPREHENSIVE CLOUD GPU DIAGNOSTIC SUITE');
  console.log('Target URL:', url);
  console.log('====================================================\n');

  // STEP 1: Ping /system_stats
  try {
    const statsRes = await fetch(`${url}/system_stats`, { signal: AbortSignal.timeout(6000) });
    if (!statsRes.ok) throw new Error(`HTTP ${statsRes.status}`);
    const stats = await statsRes.json();
    console.log('✅ STEP 1: GPU Connection OK');
    console.log('   Device:', stats.devices?.[0]?.name);
    console.log('   VRAM Total:', (stats.devices?.[0]?.vram_total / 1024**3).toFixed(1), 'GB');
    console.log('   VRAM Free:', (stats.devices?.[0]?.vram_free / 1024**3).toFixed(1), 'GB\n');
  } catch (err) {
    console.error('❌ STEP 1 FAILED: Cannot reach system_stats:', err.message);
    return;
  }

  // STEP 2: Check CheckpointLoaderSimple models
  try {
    const ckptInfo = await fetch(`${url}/object_info/CheckpointLoaderSimple`).then(r => r.json());
    const ckpts = ckptInfo.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
    console.log('✅ STEP 2: Checkpoints available:', ckpts);
  } catch (err) {
    console.error('❌ STEP 2 FAILED:', err.message);
  }

  // STEP 3: Check CLIPLoader
  try {
    const clipInfo = await fetch(`${url}/object_info/CLIPLoader`).then(r => r.json());
    const clips = clipInfo.CLIPLoader?.input?.required?.clip_name?.[0] || [];
    console.log('✅ STEP 3: CLIP / Text Encoders available:', clips);
  } catch (err) {
    console.error('❌ STEP 3 FAILED:', err.message);
  }

  // STEP 4: Check VAELoader
  try {
    const vaeInfo = await fetch(`${url}/object_info/VAELoader`).then(r => r.json());
    const vaes = vaeInfo.VAELoader?.input?.required?.vae_name?.[0] || [];
    console.log('✅ STEP 4: VAEs available:', vaes);
  } catch (err) {
    console.error('❌ STEP 4 FAILED:', err.message);
  }

  // STEP 5: Test Image Upload
  let uploadedName = '';
  try {
    const testImgPath = 'E:\\Youtube\\History of toilet\\Image Videos\\scene-manifest-00-00.03-4970.png';
    const imgBuf = fs.readFileSync(testImgPath);
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="diag_test.png"\r\n` +
      `Content-Type: image/png\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const payload = Buffer.concat([header, imgBuf, footer]);

    const upRes = await fetch(`${url}/upload/image`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: payload
    });
    if (!upRes.ok) throw new Error(`HTTP ${upRes.status}`);
    const upData = await upRes.json();
    uploadedName = upData.name;
    console.log('✅ STEP 5: Image upload succeeded ->', uploadedName, '\n');
  } catch (err) {
    console.error('❌ STEP 5 FAILED: Image upload failed:', err.message);
    return;
  }

  // STEP 6: Test Prompt Execution
  console.log('🧪 STEP 6: Testing Video Workflow Prompt Submission...');
  // Check what models are present
  const clipInfo = await fetch(`${url}/object_info/CLIPLoader`).then(r => r.json());
  const clips = clipInfo.CLIPLoader?.input?.required?.clip_name?.[0] || [];
  const vaeInfo = await fetch(`${url}/object_info/VAELoader`).then(r => r.json());
  const vaes = vaeInfo.VAELoader?.input?.required?.vae_name?.[0] || [];
  const ckptInfo = await fetch(`${url}/object_info/CheckpointLoaderSimple`).then(r => r.json());
  const ckpts = ckptInfo.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];

  console.log('Inventory summary:');
  console.log('- Checkpoints:', ckpts);
  console.log('- Text Encoders:', clips);
  console.log('- VAEs:', vaes);

  // Test LTX workflow if ltx is present
  if (ckpts.includes('ltx-video-2b-v0.9.1.safetensors')) {
    console.log('\n--- Testing LTX-Video prompt submission ---');
    const ltxClip = clips.find(c => c.toLowerCase().includes('t5')) || clips[0];
    console.log('Using clip:', ltxClip);
    
    const wf = {
      '1': { inputs: { image: uploadedName, upload: 'image' }, class_type: 'LoadImage' },
      '2': { inputs: { ckpt_name: 'ltx-video-2b-v0.9.1.safetensors' }, class_type: 'CheckpointLoaderSimple' },
    };

    if (ltxClip) {
      wf['3'] = { inputs: { clip_name: ltxClip, type: 'ltxv' }, class_type: 'CLIPLoader' };
      wf['4'] = { inputs: { text: 'cinematic historical street', clip: ['3', 0] }, class_type: 'CLIPTextEncode' };
      wf['5'] = { inputs: { text: 'blurry, low quality', clip: ['3', 0] }, class_type: 'CLIPTextEncode' };
      wf['6'] = {
        inputs: {
          positive: ['4', 0],
          negative: ['5', 0],
          vae: ['2', 2],
          image: ['1', 0],
          width: 768,
          height: 512,
          length: 9,
          batch_size: 1,
          strength: 1.0
        },
        class_type: 'LTXVImgToVideo'
      };
      wf['7'] = {
        inputs: {
          seed: 42,
          steps: 5,
          cfg: 3.0,
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: 1.0,
          model: ['2', 0],
          positive: ['6', 0],
          negative: ['6', 1],
          latent_image: ['6', 2]
        },
        class_type: 'KSampler'
      };
      wf['8'] = { inputs: { samples: ['7', 0], vae: ['2', 2] }, class_type: 'VAEDecode' };
      wf['9'] = {
        inputs: {
          images: ['8', 0],
          frame_rate: 8,
          loop_count: 0,
          filename_prefix: 'DiagLTX',
          format: 'video/h264-mp4',
          pingpong: false,
          save_output: true
        },
        class_type: 'VHS_VideoCombine'
      };
    }

    const pRes = await fetch(`${url}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: wf, client_id: 'diag_tester' })
    });
    console.log('LTX Prompt Submit Status:', pRes.status);
    const pData = await pRes.json();
    console.log('LTX Prompt Submit Response:', JSON.stringify(pData));

    if (pData.prompt_id) {
      console.log('Waiting for execution...');
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const h = await fetch(`${url}/history/${pData.prompt_id}`).then(r => r.json());
        const job = h[pData.prompt_id];
        if (job) {
          console.log('LTX Execution status:', JSON.stringify(job.status));
          console.log('LTX Outputs:', JSON.stringify(job.outputs));
          break;
        } else {
          const q = await fetch(`${url}/queue`).then(r => r.json());
          console.log(`Poll ${i+1}: queue_running =`, q.queue_running?.length, 'queue_pending =', q.queue_pending?.length);
        }
      }
    }
  }
}

diagnose().catch(console.error);
