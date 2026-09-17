import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import WebSocket from 'ws';
import { KokoroTTS } from 'kokoro-js';

const PREVIEW_DIR = path.resolve('projects_data/voice_previews');
fs.mkdirSync(PREVIEW_DIR, { recursive: true });

const VOICE_SAMPLE_PROMPTS = {
  'kokoro-blend-heart-bella':
    'Crafted for elegance, distinction, and clarity. Bringing your story to life with natural human warmth and seamless cadence.',
  'kokoro-blend-adam-michael':
    'The truth is often buried beneath decades of mystery, waiting for the patient observer to uncover the forgotten details.',
  'kokoro-blend-george-emma':
    'From the majestic halls of ancient kings to the vast frontiers of discovery, courage shaped the course of our modern world.',
  'kokoro-blend-sky-sarah':
    'Welcome back to the studio! Today, we are breaking down the breakthrough that is changing video creation forever.',
  'kokoro-blend-adam-fenrir':
    'Deep in the forgotten ruins of the northern realm, an ancient prophecy began to stir beneath the frozen ground.',

  'kokoro-af-heart':
    'The morning sun drifted softly behind the emerald hills, casting golden shadows across the quiet meadow.',
  'kokoro-am-adam':
    'In the silence of the deep forest, every whisper of the wind tells a story of survival and endurance.',
  'kokoro-af-bella':
    'She opened the dusty leather journal, and suddenly every forgotten memory came rushing back into vivid focus.',
  'kokoro-am-michael':
    'Designed with precision, engineered for distinction. Discover the next generation of seamless creative technology.',
  'kokoro-bf-emma':
    'Across the British countryside, ancient stone monuments stand as silent sentinels of a long-forgotten age.',
  'kokoro-bm-george':
    'History remembers those who dared to challenge the impossible when all hope seemed lost in the shadows.',

  'chattts-spark':
    'Wait, are you serious? I did not see that coming at all! Let us give it another shot together.',

  'indic-bn-tariq':
    '১৮৫৩ সালে নিউ ইয়র্কের ক্রিস্টাল প্যালেস এক্সপোজিশনে এলিশা ওটিস উন্মোচন করেছিলেন এক যুগান্তকারী আবিষ্কার।',
  'indic-bn-ananya':
    'গল্পের শুরুটা হয়েছিল অনেক বছর আগে, এক নিঃশব্দ সন্ধ্যার মায়াবী আলোয় যখন দূর আকাশে প্রথম তারা ফুটে ওঠে।',
  'indic-bn-subir':
    'আজকের প্রধান সংবাদ: বিশ্ব অর্থনীতি ও কৃত্রিম বুদ্ধিমত্তার মেলবন্ধনে কর্মক্ষেত্রে আসছে এক বিরাট পরিবর্তন।',
  'indic-bn-moushumi':
    'হ্যালো বন্ধুরা! আজকের পর্বে আমরা আলোচনা করব কীভাবে সৃজনশীলতা ও ছোট ছোট অভ্যাস আমাদের জীবন বদলে দিতে পারে।',
  'edge-bn-pradeep':
    'ইতিহাসের পাতায় এমন কিছু রোমাঞ্চকর ঘটনা লুকিয়ে আছে যা মানব সভ্যতার গতিপথ চিরতরে পরিবর্তন করে দিয়েছিল।',
  'edge-bn-nabanita':
    'শান্ত নদীর তীরে বসে সূর্যাস্তের মনোরম রক্তিম আভা দেখতে কার না ভালো লাগে? প্রকৃতি যেন এক অপরূপ সৌন্দর্যের আঁধার।',
  'edge-bn-bashkar':
    'বিজ্ঞান ও প্রযুক্তির অভূতপূর্ব অগ্রগতি সমগ্র মানবজাতিকে এক অজানা নতুন দিগন্তের সন্ধান দিয়েছে।',
  'google-bn-bashkar':
    'অজানাকে জানার এক অদম্য কৌতূহল মানুষকে যুগে যুগে এগিয়ে নিয়ে গেছে মহাকাশের দূর সীমানায়।',
  'google-bn-shikha':
    'সাহিত্যের প্রতিটি পাতায় জীবনের গভীর অনুভূতিগুলো এক মধুর সুরের মতো মিশে থাকে।',

  'indic-hi-aarav':
    'यह कहानी है उस अनकहे सफर की, जिसने इतिहास के पन्नों को हमेशा के लिए एक नई दिशा दी।',
  'indic-hi-diya':
    'रात की खामोशी में जब ठंडी हवा चली, तो बरसों पुरानी भूली-बिसरी यादें फिर से ताजा हो गईं।',
  'indic-ta-kavitha':
    'வரலாற்றின் பக்கங்களில் மறைந்துள்ள உண்மைகளை வெளிக்கொணர்வது ஒரு அற்புதமான கண்டுபிடிப்பு பயணம்.',
  'indic-te-suresh':
    'చరిత్ర పుటల్లో దాగి ఉన్న నిజాలను వెలికితీయడం ఎంతో సాహసోపేతమైన మరియు ఆసక్తికరమైన ప్రయాణం.',
  'indic-mr-rohit':
    'इतिहासाच्या पानात दडलेल्या प्रेरणादायी गोष्टी आजच्या पिढीला नवीन विचार करण्याची ऊर्जा देतात.',
  'edge-hi-madhur':
    'सपनों को हकीकत में बदलने के लिए अटूट विश्वास और निरंतर मेहनत ही सबसे बड़ी शक्ति होती है।',
  'google-hi-madhur':
    'सिनेमा और कहानियों की दुनिया हमें जिंदगी के नए रंगों और अहसासों से रूबरू कराती है।',
  'google-hi-swara':
    'पहाड़ों से बहती नदियां और ठंडी हवाएं प्रकृति के उस खूबसूरत संगीत की तरह हैं जो मन को छू जाता है।',

  'edge-en-christopher':
    'Beneath the surface of ancient civilizations lies an untold story of courage, sacrifice, and final triumph.',
  'edge-en-guy':
    'Hey creators! Welcome back to the channel. Today we are breaking down five game-changing video production secrets.',
  'edge-en-jenny':
    'Every great scientific breakthrough begins with a single curious question and the courage to pursue the answer.',
  'edge-en-aria':
    'The warning sirens echoed through the darkened corridor as the final emergency sequence was initiated.',
  'edge-en-ryan':
    'In the storied archives of British exploration, few expeditions captured the world’s imagination quite like this.',

  'pNInz6obpgDQGcFmaJgB':
    'The deeper we venture into the uncharted abyss, the more we realize how little we truly understand about the universe.',
  'JBFqnCBsd6RMkjVDRZzb':
    'In the grand tapestry of human civilization, historical triumphs are born from the quietest moments of determination.',
  'FGY2WhTYpPnrIDTdsKH5':
    'In a world fractured by eternal silence, one lone wanderer steps into the shadows to rewrite destiny itself.',
  '21m00Tcm4TlvDq8ikWAM':
    'There was an ethereal magic in the way the twilight illuminated the silent pine trees along the forgotten path.',
  'nPczCjzI2devNBz1zQrb':
    'Behind every technological revolution is a relentless visionary who refused to believe that the future was impossible.',

  'onyx':
    'Architectural brilliance is not defined by sheer scale, but by the timeless elegance and purpose of every single line.',
  'echo':
    'Let us explore how modern documentary filmmakers turn ordinary historical records into breathtaking visual odysseys.',
  'nova':
    'Ready to elevate your content workflow? Let us dive right into the techniques that top creators use every single day.',
  'shimmer':
    'Welcome to this immersive audio journey exploring the fundamental rhythms of storytelling and creative design.',

  'google-gemini-charon':
    'Beyond the observable boundaries of our galaxy, ancient cosmic structures continue to challenge our understanding of time.',
  'google-gemini-fenrir':
    'Across the scorched battlefield, the ancient guardians gathered under the stormy sky for one final epic stand.',
  'google-gemini-aoede':
    'In the quiet sanctuary of the mountain grove, ancient melodies echo softly through the morning mist.',
  'google-gemini-puck':
    'What is going on everyone! Today we are pushing the absolute frontiers of AI video and voice automation.',
  'google-gemini-kore':
    'Welcome to this masterclass where we examine the essential acoustic principles behind pristine studio voiceovers.',

  'chatter-en-alexander':
    'From the shadows of the forgotten realm, a warrior will rise to claim the throne and unite the fractured kingdom.',
  'chatter-en-seraphina':
    'The twilight cast a silver glow across the quiet lake, whispering tales of ancient magic to those who listened.',
  'chatter-en-oliver':
    'Throughout the centuries of English maritime exploration, few captains dared to navigate these treacherous waters.',
  'chatter-en-clara':
    'Hey everyone! Hit that subscribe bell because today we are testing something completely unbelievable!',
  'chatter-es-mateo':
    'Bajo el cielo estrellado de los Andes, una antigua leyenda comienza a despertar entre el viento helado.',
  'chatter-fr-celeste':
    'Dans les ruelles pavées de Paris, chaque parfum et chaque note de musique racontent une histoire d’amour intemporelle.',
  'chatter-ja-kenji':
    '静寂に包まれた夜の街で、未来を切り拓く新たな物語の歯车が静かに動き始めた。',
  'chatter-de-maximilian':
    'Präzision, Ingenieurskunst und höchste Perfektion bilden das unerschütterliche Fundament deutscher Innovation.',
  'chatter-ar-tariq':
    'في أعماق الصحراء الشاسعة، تهمس الرمال بحكايات مجد وحضارات خالدة لا يطويها النسيان.',
  'google-es-camila':
    'A través de senderos inexplorados, la determinación humana siempre encuentra el camino hacia nuevos horizontes.',
};

// Edge Voice Mapping for non-Kokoro / free local generation
const EDGE_VOICE_MAP = {
  'edge-bn-pradeep': 'bn-BD-PradeepNeural',
  'edge-bn-nabanita': 'bn-BD-NabanitaNeural',
  'edge-bn-bashkar': 'bn-IN-BashkarNeural',
  'indic-bn-tariq': 'bn-BD-PradeepNeural',
  'indic-bn-ananya': 'bn-BD-NabanitaNeural',
  'indic-bn-subir': 'bn-IN-BashkarNeural',
  'indic-bn-moushumi': 'bn-BD-NabanitaNeural',
  'google-bn-bashkar': 'bn-IN-BashkarNeural',
  'google-bn-shikha': 'bn-BD-NabanitaNeural',

  'edge-hi-madhur': 'hi-IN-MadhurNeural',
  'indic-hi-aarav': 'hi-IN-MadhurNeural',
  'indic-hi-diya': 'hi-IN-SwaraNeural',
  'google-hi-madhur': 'hi-IN-MadhurNeural',
  'google-hi-swara': 'hi-IN-SwaraNeural',

  'indic-ta-kavitha': 'ta-IN-PallaviNeural',
  'indic-te-suresh': 'te-IN-MohanNeural',
  'indic-mr-rohit': 'mr-IN-ManoharNeural',

  'edge-en-christopher': 'en-US-ChristopherNeural',
  'edge-en-guy': 'en-US-GuyNeural',
  'edge-en-jenny': 'en-US-JennyNeural',
  'edge-en-aria': 'en-US-AriaNeural',
  'edge-en-ryan': 'en-GB-RyanNeural',

  'chattts-spark': 'en-US-GuyNeural',
  'onyx': 'en-US-ChristopherNeural',
  'echo': 'en-US-GuyNeural',
  'nova': 'en-US-JennyNeural',
  'shimmer': 'en-US-AriaNeural',

  'google-gemini-charon': 'en-US-ChristopherNeural',
  'google-gemini-fenrir': 'en-US-ChristopherNeural',
  'google-gemini-aoede': 'en-US-JennyNeural',
  'google-gemini-puck': 'en-US-GuyNeural',
  'google-gemini-kore': 'en-US-AriaNeural',

  'chatter-en-alexander': 'en-US-ChristopherNeural',
  'chatter-en-seraphina': 'en-US-JennyNeural',
  'chatter-en-oliver': 'en-GB-RyanNeural',
  'chatter-en-clara': 'en-US-JennyNeural',
  'chatter-es-mateo': 'es-ES-AlvaroNeural',
  'chatter-fr-celeste': 'fr-FR-DeniseNeural',
  'chatter-ja-kenji': 'ja-JP-KeitaNeural',
  'chatter-de-maximilian': 'de-DE-KillianNeural',
  'chatter-ar-tariq': 'ar-SA-HamedNeural',
  'google-es-camila': 'es-ES-ElviraNeural',
};

import { spawn } from 'child_process';

const PYTHON_EXE = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe');

async function synthesizeEdge(voiceName, text, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_EXE, [
      '-m', 'edge_tts',
      '--voice', voiceName,
      '--text', text,
      '--write-media', outputPath
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 100) {
        resolve(true);
      } else {
        reject(new Error(`edge-tts exited with code ${code}: ${stderr}`));
      }
    });
    proc.on('error', reject);
  });
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const arrayBuf = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(arrayBuf));
}

async function main() {
  console.log('🚀 Starting Zero-Credit Master Preview Pre-Generation...');

  // 1. Fetch ElevenLabs free CDN previews
  console.log('\n📥 1. Fetching ElevenLabs public CDN preview files...');
  try {
    const elRes = await fetch('https://api.elevenlabs.io/v1/voices');
    const elData = await elRes.json();
    const elMap = {
      'pNInz6obpgDQGcFmaJgB': 'Adam',
      'JBFqnCBsd6RMkjVDRZzb': 'George',
      'FGY2WhTYpPnrIDTdsKH5': 'Laura',
      'nPczCjzI2devNBz1zQrb': 'Brian',
    };
    for (const [id, searchName] of Object.entries(elMap)) {
      const dest = path.join(PREVIEW_DIR, `${id}.mp3`);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
        console.log(`  ✓ Already cached ElevenLabs voice: ${searchName} (${id})`);
        continue;
      }
      const voice = elData.voices?.find(v => v.voice_id === id || v.name.toLowerCase().includes(searchName.toLowerCase()));
      if (voice?.preview_url) {
        console.log(`  ⬇ Downloading ${searchName} preview: ${voice.preview_url.slice(0, 60)}...`);
        await downloadFile(voice.preview_url, dest);
        console.log(`  ✓ Saved ${searchName} preview!`);
      }
    }
    // For 21m00Tcm4TlvDq8ikWAM (Rachel), use Sarah or Alice if Rachel id not in list
    const rachelDest = path.join(PREVIEW_DIR, '21m00Tcm4TlvDq8ikWAM.mp3');
    if (!fs.existsSync(rachelDest) || fs.statSync(rachelDest).size < 1000) {
      const altFemale = elData.voices?.find(v => v.name.toLowerCase().includes('sarah') || v.name.toLowerCase().includes('alice'));
      if (altFemale?.preview_url) {
        console.log(`  ⬇ Downloading Rachel/Sarah preview...`);
        await downloadFile(altFemale.preview_url, rachelDest);
        console.log(`  ✓ Saved Rachel preview!`);
      }
    }
  } catch (err) {
    console.warn('  ⚠️ ElevenLabs CDN fetch notice:', err.message);
  }

  // 2. Synthesize Kokoro Solo and Blend Previews
  console.log('\n💎 2. Synthesizing Kokoro voices locally...');
  try {
    const kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-ONNX', { dtype: 'q8' });
    console.log('  ✓ Kokoro model ready');

    const kokoroSoloMap = {
      'kokoro-af-heart': { voice: 'af_heart', file: 'kokoro-af-heart.mp3' },
      'kokoro-am-adam': { voice: 'am_adam', file: 'kokoro-am-adam.mp3' },
      'kokoro-af-bella': { voice: 'af_bella', file: 'kokoro-af-bella.mp3' },
      'kokoro-am-michael': { voice: 'am_michael', file: 'kokoro-am-michael.mp3' },
      'kokoro-bf-emma': { voice: 'bf_emma', file: 'kokoro-bf-emma.mp3' },
      'kokoro-bm-george': { voice: 'bm_george', file: 'kokoro-bm-george.mp3' },
    };

    for (const [id, conf] of Object.entries(kokoroSoloMap)) {
      const dest = path.join(PREVIEW_DIR, conf.file);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
        console.log(`  ✓ Kokoro solo already cached: ${id}`);
        continue;
      }
      const text = VOICE_SAMPLE_PROMPTS[id];
      console.log(`  🎙️ Generating Kokoro solo: ${id}...`);
      const audio = await kokoro.generate(text, { voice: conf.voice, speed: 1.0 });
      const wavPath = dest.replace('.mp3', '.wav');
      await audio.save(wavPath);
      // Copy to .mp3 as well so both extensions resolve
      fs.copyFileSync(wavPath, dest);
      console.log(`  ✓ Saved ${conf.file}`);
    }

    // Kokoro Blends
    const { Tensor, RawAudio } = await import('@huggingface/transformers');
    const blendConfigs = [
      { id: 'kokoro-blend-heart-bella', vA: 'af_heart', vB: 'af_bella', rA: 0.65, rB: 0.35, dialect: 'a' },
      { id: 'kokoro-blend-adam-michael', vA: 'am_adam', vB: 'am_michael', rA: 0.65, rB: 0.35, dialect: 'a' },
      { id: 'kokoro-blend-george-emma', vA: 'bm_george', vB: 'bf_emma', rA: 0.60, rB: 0.40, dialect: 'b' },
      { id: 'kokoro-blend-sky-sarah', vA: 'af_sky', vB: 'af_sarah', rA: 0.55, rB: 0.45, dialect: 'a' },
      { id: 'kokoro-blend-adam-fenrir', vA: 'am_adam', vB: 'am_fenrir', rA: 0.60, rB: 0.40, dialect: 'a' },
    ];

    for (const b of blendConfigs) {
      const dest = path.join(PREVIEW_DIR, `${b.id}.mp3`);
      try {
        const pA = path.resolve(`node_modules/kokoro-js/voices/${b.vA}.bin`);
        const pB = path.resolve(`node_modules/kokoro-js/voices/${b.vB}.bin`);
        if (fs.existsSync(pA) && fs.existsSync(pB)) {
          const bufA = fs.readFileSync(pA);
          const bufB = fs.readFileSync(pB);
          const fA = new Float32Array(bufA.buffer, bufA.byteOffset, bufA.byteLength / 4);
          const fB = new Float32Array(bufB.buffer, bufB.byteOffset, bufB.byteLength / 4);
          const len = Math.min(fA.length, fB.length);
          const blended = new Float32Array(len);
          for (let i = 0; i < len; i++) {
            blended[i] = b.rA * fA[i] + b.rB * fB[i];
          }
          console.log(`  🎙️ Generating Kokoro blend: ${b.id}...`);
          kokoro._validate_voice = () => b.dialect;
          kokoro.generate_from_ids = async function(input_ids, { speed = 1 } = {}) {
            const l = 256 * Math.min(Math.max(input_ids.dims.at(-1) - 2, 0), 509);
            const s = blended.slice(l, l + 256);
            const { waveform } = await this.model({
              input_ids,
              style: new Tensor('float32', s, [1, 256]),
              speed: new Tensor('float32', [speed], [1]),
            });
            return new RawAudio(waveform.data, 24000);
          };

          const text = VOICE_SAMPLE_PROMPTS[b.id];
          const audio = await kokoro.generate(text);
          const wavPath = dest.replace('.mp3', '.wav');
          await audio.save(wavPath);
          fs.copyFileSync(wavPath, dest);
          console.log(`  ✓ Saved ${b.id}.mp3`);
        }
      } catch (blendErr) {
        console.warn(`  ⚠️ Error on blend ${b.id}:`, blendErr.message);
      }
    }
  } catch (kErr) {
    console.warn('  ⚠️ Kokoro synthesis notice:', kErr.message);
  }

  // 3. Synthesize Edge Neural & Regional voices
  console.log('\n🌐 3. Synthesizing Edge Neural, Indic & Regional Voices...');
  for (const [id, edgeVoice] of Object.entries(EDGE_VOICE_MAP)) {
    const dest = path.join(PREVIEW_DIR, `${id}.mp3`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`  ✓ Already cached: ${id}`);
      continue;
    }
    const text = VOICE_SAMPLE_PROMPTS[id] || 'Hello! Ready to deliver high quality narration for your video production.';
    console.log(`  ⚡ Generating ${id} with ${edgeVoice}...`);
    try {
      await synthesizeEdge(edgeVoice, text, dest);
      console.log(`  ✓ Saved ${id}.mp3`);
    } catch (err) {
      console.warn(`  ⚠️ Failed ${id}:`, err.message);
    }
  }

  const generatedFiles = fs.readdirSync(PREVIEW_DIR);
  console.log(`\n🎉 DONE! Total preview files ready in projects_data/voice_previews: ${generatedFiles.length}`);
}

main().catch(console.error);
