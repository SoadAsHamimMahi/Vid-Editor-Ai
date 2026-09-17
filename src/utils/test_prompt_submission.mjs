import fs from 'fs';

async function test() {
  const url = 'https://senior-interviews-prep-gel.trycloudflare.com';
  
  // 1. Upload sample image
  const imgBuf = fs.readFileSync('E:\\Youtube\\History of toilet\\Image Videos\\scene-manifest-00-00.03-4970.png');
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="image"; filename="scene_test.png"\r\n` +
    `Content-Type: image/png\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([header, imgBuf, footer]);

  console.log('Uploading image...');
  const upRes = await fetch(`${url}/upload/image`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: payload
  });
  const upJson = await upRes.json();
  console.log('UPLOADED RESULT:', upJson);

  // 2. Submit prompt with pingpong: false
  const workflow = {
    '1': { inputs: { image: upJson.name, upload: 'image' }, class_type: 'LoadImage' },
    '2': { inputs: { text: 'cinematic historical street, subtle dawn mist', clip: ['3', 1] }, class_type: 'CLIPTextEncode' },
    '3': { inputs: { ckpt_name: 'wan2.1_i2v_1.3B_fp8.safetensors' }, class_type: 'CheckpointLoaderSimple' },
    '4': { inputs: { seed: 1234, steps: 10, cfg: 6.0, sampler_name: 'euler', scheduler: 'normal', denoise: 0.5, model: ['3', 0], positive: ['2', 0], negative: ['5', 0], latent_image: ['6', 0] }, class_type: 'KSampler' },
    '5': { inputs: { text: 'distorted, blurry, low quality', clip: ['3', 1] }, class_type: 'CLIPTextEncode' },
    '6': { inputs: { pixels: ['1', 0], vae: ['3', 2] }, class_type: 'VAEEncode' },
    '7': { inputs: { samples: ['4', 0], vae: ['3', 2] }, class_type: 'VAEDecode' },
    '8': { inputs: { images: ['7', 0], frame_rate: 24, loop_count: 0, filename_prefix: 'ColabVideo', format: 'video/h264-mp4', pingpong: false, save_output: true }, class_type: 'VHS_VideoCombine' }
  };

  console.log('Submitting prompt...');
  const pRes = await fetch(`${url}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: 'test_client' })
  });

  console.log('PROMPT STATUS:', pRes.status);
  const pText = await pRes.text();
  console.log('PROMPT RESPONSE:', pText);
}

test().catch(console.error);
