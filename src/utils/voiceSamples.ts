import { VoiceProfile } from '../types';

/**
 * Curated showcase audition scripts tailored to the acoustic strengths,
 * tonal sweet spots, and cadences of each voice.
 * Users can audition these immediately without spending credits or guessing prompts.
 */
export const VOICE_SAMPLE_PROMPTS: Record<string, string> = {
  // 💎 Kokoro Style Blends
  'kokoro-blend-heart-bella':
    'Crafted for elegance, distinction, and clarity. Bringing your story to life with natural human warmth and seamless cadence.',
  'kokoro-blend-adam-michael':
    'The truth is often buried beneath decades of mystery, waiting for the patient observer to uncover the forgotten details.',
  'kokoro-blend-george-emma':
    'From the majestic halls of ancient kings to the vast frontiers of discovery, courage shaped the course of our modern world.',
  'kokoro-blend-emma-isabella':
    'In the tender quiet of the evening, words spoken softly carry the weight of an unforgettable lifetime.',
  'kokoro-blend-sky-sarah':
    'Welcome back to the studio! Today, we are breaking down the breakthrough that is changing video creation forever.',
  'kokoro-blend-adam-fenrir':
    'Deep in the forgotten ruins of the northern realm, an ancient prophecy began to stir beneath the frozen ground.',
  'kokoro-blend-fenrir-onyx':
    'In a world where shadows rule the silence, only one survivor holds the key to the ultimate reckoning.',
  'kokoro-blend-onyx-adam':
    'The crime scene remained untouched for twenty years, until a single overlooked clue reopened the entire mystery.',
  'kokoro-blend-michael-alloy':
    'By redesigning computing from the silicon up, we have unlocked performance that was previously considered mathematically impossible.',
  'kokoro-blend-river-heart':
    'Close your eyes, take a slow, deep breath, and allow your mind to drift into complete stillness and peace.',
  'kokoro-blend-puck-eric':
    'You are NOT going to believe what happened next! Hit that follow button right now, because this changes everything!',
  'kokoro-blend-bella-aoede':
    'Sometimes, letting go is the hardest part of loving someone, but it is also where the true healing begins.',
  'kokoro-blend-lewis-george':
    'When we look up at the night sky, we are not merely gazing into darkness; we are peering directly into our own origins.',
  'kokoro-blend-sarah-kore':
    'Global markets reacted swiftly this morning as central banks signaled an unprecedented shift in monetary policy.',
  'kokoro-blend-echo-liam':
    'To understand why this movie became a cult classic, we first have to examine the disaster that occurred behind the scenes.',
  'kokoro-blend-fable-adam':
    'Before the dawn of empires, when dragons still soared across the horizon, legends were carved into stone.',
  'kokoro-blend-nova-jessica':
    'Pack your bags, because today we are exploring one of the most breathtaking hidden gems on the planet!',
  'kokoro-blend-lily-heart':
    'Once upon a time, nestled deep inside the enchanted forest, lived a little rabbit who had a secret wish.',

  // 🌟 Kokoro Solo Voices
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
  'kokoro-am-fenrir':
    'Darkness does not destroy the light; it simply defines where the courage to fight begins.',
  'kokoro-am-onyx':
    'Every investigative trail leaves forensic traces. The question is never if they exist, but who is skilled enough to find them.',
  'kokoro-am-echo':
    'The fascinating thing about narrative pacing is how silence can communicate more emotional tension than words.',
  'kokoro-am-eric':
    'Push past your limits, stay focused on the objective, and never let temporary setbacks define your ultimate victory.',
  'kokoro-am-liam':
    'Just when the protagonist thought the mission was complete, an unexpected twist turned the entire plot upside down.',
  'kokoro-am-puck':
    'Wait, you thought that was cool? Just wait until you see the secret combo unlock in the final level!',
  'kokoro-af-river':
    'Feel the gentle rhythm of the ocean waves, washing away tension and bringing tranquility to your spirit.',
  'kokoro-af-nova':
    'Upgrade your workflow with instantaneous rendering, smart timeline cuts, and flawless broadcast quality.',
  'kokoro-af-sarah':
    'Delivering reliable insight, accurate market forecasts, and in-depth analysis from financial capitals around the globe.',
  'kokoro-af-sky':
    'What is up, everyone! We are live from the studio with an exclusive look at the newest trends taking the world by storm.',
  'kokoro-af-nicole':
    'Understanding the fundamental principles of physics allows us to appreciate the elegant mechanics of everyday life.',
  'kokoro-af-alloy':
    'By leveraging decentralized neural architectures, processing efficiency increases by an order of magnitude.',
  'kokoro-af-jessica':
    'Creating a cozy, organized home is all about finding harmony between simplicity and the things you truly love.',
  'kokoro-af-kore':
    'Strategic leadership requires decisive action in the face of uncertainty and unwavering dedication to excellence.',
  'kokoro-af-aoede':
    'The poetry of the old poets still resonates across centuries, reminding us of passions that never fade.',
  'kokoro-bm-fable':
    'Beyond the misty mountains, where ancient heroes forged their destinies, an epic quest awaits the bold.',
  'kokoro-bm-lewis':
    'Through systematic scientific observation, we unlock the extraordinary laws that govern our cosmos.',
  'kokoro-bm-daniel':
    'Good evening. In tonight’s special investigative report, we uncover the hidden history of the digital era.',
  'kokoro-bf-isabella':
    'There is a quiet majesty in the English landscape that speaks directly to the contemplative soul.',
  'kokoro-bf-alice':
    'Beneath the grand chandelier, the guests gathered to hear the tale of a forgotten romance.',
  'kokoro-bf-lily':
    'The little golden star twinkled high in the night sky, watching over all the sleeping creatures below.',

  // 🎙️ ChatTTS (Conversational)
  'chattts-spark':
    'Wait, are you serious? [laugh] I did not see that coming at all! [sigh] Let us give it another shot together.',

  // 🇧🇩 Bengali / বাংলা (IndicF5 & Edge Neural)
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
  'edge-bn-tanishaa':
    'গোধূলির মৃদু আলোয় শান্ত নদীর বুকে ভেসে যাওয়া ছোট নৌকাটি এক অদ্ভুত মায়াবী অনুভূতির জন্ম দিয়েছিল। সাহিত্যের প্রতিটি গল্প আমাদের নতুন করে ভাবতে শেখায়।',
  'google-bn-bashkar':
    'অজানাকে জানার এক অদম্য কৌতূহল মানুষকে যুগে যুগে এগিয়ে নিয়ে গেছে মহাকাশের দূর সীমানায়।',
  'google-bn-shikha':
    'সাহিত্যের প্রতিটি পাতায় জীবনের গভীর অনুভূতিগুলো এক মধুর সুরের মতো মিশে থাকে।',
  'google-gemini-bn-charon':
    'ইতিহাসের সবচেয়ে রহস্যময় অধ্যায়গুলো লুকিয়ে থাকে শতাব্দীর নীরবতার নিচে। গভীর অনুসন্ধানই পারে সত্যকে সামনে আনতে।',
  'google-gemini-bn-shikha':
    'জীবনের প্রতিটি ছোট্ট অনুভূতি এক মধুর সুরের মতো আমাদের হৃদয়ে প্রতিধ্বনিত হয়। চলুন শুরু করা যাক এক নতুন রোমাঞ্চকর যাত্রা।',

  // 🇮🇳 Hindi & Regional Indic
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
  'edge-hi-swara':
    'सपनों को सच करने के लिए किसी बड़े मौके का इंतजार मत कीजिए, बल्कि हर छोटे कदम को अपनी मंजिल की शुरुआत बनाइए। हर कहानी में एक नई उम्मीद होती है।',
  'edge-hi-multilingual-andrew':
    'नमस्ते दोस्तों! आज के इस एपिसोड में हम देखने वाले हैं वो पांच AI टूल्स जो आपके वीडियो क्रिएशन और एडिटिंग को पूरी तरह बदल देंगे।',
  'edge-hi-multilingual-ava':
    'हेलो एवरीवन! आज के इस स्पेशल वीडियो में हम बात करेंगे कि कैसे आप बिना किसी झंझट के अपने प्रोजेक्ट्स को सुपरफास्ट और प्रोफेशनल बना सकते हैं।',
  'edge-hi-multilingual-brian':
    'ब्रह्मांड के इस असीम विस्तार में अनगिनत ऐसे रहस्य छिपे हैं, जिन्हें समझने की जिज्ञासा ही मानव इतिहास का सबसे रोमांचक सफर है।',
  'google-hi-madhur':
    'सिनेमा और कहानियों की दुनिया हमें जिंदगी के नए रंगों और अहसासों से रूबरू कराती है।',
  'google-hi-swara':
    'पहाड़ों से बहती नदियां और ठंडी हवाएं प्रकृति के उस खूबसूरत संगीत की तरह हैं जो मन को छू जाता है।',
  'google-gemini-hi-charon':
    'इतिहास के पन्नों में दर्ज वो गाथाएं, जिन्होंने समय की धारा को मोड़कर एक नए युग की शुरुआत की थी।',
  'google-gemini-hi-swara':
    'दिल से निकली हुई बात हमेशा दिल तक पहुँचती है। आइए सुनते हैं एक ऐसी कहानी जो आपकी सोच बदल देगी।',

  // 🇺🇸 / 🇬🇧 Edge Neural English
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

  // 🏆 ElevenLabs Master Presets
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

  // 🧠 OpenAI HD Voices
  'onyx':
    'Architectural brilliance is not defined by sheer scale, but by the timeless elegance and purpose of every single line.',
  'echo':
    'Let us explore how modern documentary filmmakers turn ordinary historical records into breathtaking visual odysseys.',
  'nova':
    'Ready to elevate your content workflow? Let us dive right into the techniques that top creators use every single day.',
  'shimmer':
    'Welcome to this immersive audio journey exploring the fundamental rhythms of storytelling and creative design.',

  // 🌐 Google AI Studio / Gemini Audio
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

  // 🌍 Global / Chatterbox Languages
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
    '静寂に包まれた夜の街で、未来を切り拓く新たな物語の歯車が静かに動き始めた。',
  'chatter-de-maximilian':
    'Präzision, Ingenieurskunst und höchste Perfektion bilden das unerschütterliche Fundament deutscher Innovation.',
  'chatter-ar-tariq':
    'في أعماق الصحراء الشاسعة، تهمس الرمال بحكايات مجد وحضارات خالدة لا يطويها النسيان.',
  'google-es-camila':
    'A través de senderos inexplorados, la determinación humana siempre encuentra el camino hacia nuevos horizontes.',
};

/**
 * Returns the best curated audition prompt text for any voice profile.
 */
export function getVoiceSampleText(voice: VoiceProfile): string {
  // 1. Explicit voice sampleText if defined on profile
  if (voice.sampleText && voice.sampleText.trim()) {
    return voice.sampleText.trim();
  }

  // 2. Exact match in curated dictionary
  if (VOICE_SAMPLE_PROMPTS[voice.id]) {
    return VOICE_SAMPLE_PROMPTS[voice.id];
  }

  // 3. Custom Cloned voice reference text
  if (voice.referenceText && voice.referenceText.trim()) {
    return voice.referenceText.trim();
  }

  // 4. Smart fallback based on language, tags, and gender
  const lang = (voice.language || 'en').toLowerCase();
  const tags = (voice.tags || []).join(' ').toLowerCase();
  const name = voice.name.split('(')[0].trim();

  if (lang === 'bn') {
    if (tags.includes('story') || tags.includes('audiobook')) {
      return 'গল্পের শুরুটা হয়েছিল অনেক বছর আগে, এক নিঃশব্দ সন্ধ্যার মায়াবী আলোয়।';
    }
    return 'ইতিহাস ও বিজ্ঞানের পাতায় এমন কিছু ঘটনা লুকিয়ে আছে যা আমাদের বর্তমানকে আজও প্রভাবিত করে চলেছে।';
  }

  if (lang === 'hi') {
    return 'यह कहानी है उस अनकहे सफर की, जिसने इतिहास के पन्नों को हमेशा के लिए एक नई दिशा दी।';
  }

  if (lang === 'es') {
    return 'A través de senderos inexplorados, la determinación humana siempre encuentra el camino hacia nuevos horizontes.';
  }

  if (lang === 'fr') {
    return 'Dans les ruelles pavées de Paris, chaque parfum et chaque note de musique racontent une histoire intemporelle.';
  }

  if (lang === 'de') {
    return 'Präzision, Innovation und höchste Handwerkskunst definieren die Zukunft unserer modernen Technologie.';
  }

  if (lang === 'ja') {
    return '静寂に包まれた夜の街で、未来を切り拓く新たな物語の歯車が静かに動き始めた。';
  }

  if (lang === 'ar') {
    return 'في أعماق الصحراء الشاسعة، تهمس الرمال بحكايات مجد وحضارات خالدة لا يطويها النسيان.';
  }

  if (tags.includes('trailer') || tags.includes('intense') || tags.includes('cinematic')) {
    return 'In a world fractured by silence, one lone voice will rise to challenge destiny itself.';
  }

  if (tags.includes('documentary') || tags.includes('history') || tags.includes('baritone') || tags.includes('bbc')) {
    return 'The truth is often buried beneath decades of mystery, waiting for the patient observer to uncover.';
  }

  if (tags.includes('podcast') || tags.includes('conversational') || tags.includes('youtube')) {
    return 'Welcome back to the channel! Today we are breaking down the biggest breakthrough of the year.';
  }

  if (tags.includes('commercial') || tags.includes('warm') || tags.includes('elegance')) {
    return 'Crafted for elegance, distinction, and clarity. Bringing your story to life with natural warmth.';
  }

  return `Hello! I am ${name}, ready to deliver studio-quality narration for your video production.`;
}
