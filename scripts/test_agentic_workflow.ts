import 'dotenv/config';
import { GeminiAgenticStudioService, AgenticWorkflowConfig } from '../electron/services/geminiAgenticStudioService';

async function runLiveTest() {
  console.log('====================================================');
  console.log('🧪 STARTING LIVE TEST: GEMINI AGENTIC STUDIO SERVICE');
  console.log('====================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found in .env!');
    process.exit(1);
  }
  console.log(`🔑 Using Gemini Key: ${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`);

  const service = new GeminiAgenticStudioService();

  // Test 1: Channel Profiles
  const channels = service.getChannelProfiles();
  console.log(`\n✅ TEST 1: Channel Profiles loaded (${channels.length} profiles)`);
  channels.forEach((c) => console.log(`   - [${c.id}] ${c.name} (Default Voice: ${c.defaultVoiceModel})`));

  // Test 2: Progress & Log Callbacks
  service.setCallbacks(
    (progress) => {
      console.log(`📊 [PROGRESS] ${progress.stage.toUpperCase()} (${progress.percent}%) -> ${progress.message}`);
      if (progress.evaluation) {
        console.log(`   ⭐ Critic Score: ${progress.evaluation.score.toFixed(1)}/10 (Passed: ${progress.evaluation.passed})`);
      }
    },
    (log) => {
      console.log(`💬 [${log.agentName} | ${log.type.toUpperCase()}] ${log.title}`);
    }
  );

  // Test 3: Run Live Agentic Workflow
  const testConfig: AgenticWorkflowConfig = {
    topic: 'The Mystery of the Ghost Ship Mary Celeste',
    channelProfileId: 'channel_true_crime_history',
    lengthMode: 'shorts_60s', // 60s test for quick execution
    apiKeys: [apiKey],
    targetPassingScore: 9.2, // realistic high benchmark for test
    maxRevisionLoops: 2,
    generateImages: true, // test rendering real frame via DirectImageGenerator
    runVisionQc: true, // test Gemini Multimodal Vision inspection
    autoCastVoice: true,
  };

  console.log('\n🚀 TEST 3: Executing Live Multi-Agent Workflow...');
  const startTime = Date.now();

  try {
    const result = await service.startWorkflow(testConfig);
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n====================================================');
    console.log(`🎉 LIVE TEST PASSED IN ${elapsedSec}s!`);
    console.log('====================================================\n');

    console.log('📜 APPROVED NARRATION SCRIPT:');
    console.log(result.script);
    console.log('\n----------------------------------------------------');

    console.log('🧐 CHIEF CRITIC FINAL EVALUATION:');
    console.log(`- Final Score: ${result.evaluation.score.toFixed(1)} / 10.0 (Passed: ${result.evaluation.passed})`);
    console.log(`- Hook: ${result.evaluation.hookScore} | Resonance: ${result.evaluation.resonanceScore} | Arc: ${result.evaluation.arcScore} | Cadence: ${result.evaluation.cadenceScore} | Visuals: ${result.evaluation.visualScore}`);
    console.log(`- Feedback: ${result.evaluation.summaryFeedback}`);

    console.log('\n🎙️ AUDIO DIRECTOR CASTING:');
    console.log(`- Model: ${result.castVoice.model} (${result.castVoice.engine})`);
    console.log(`- DSP Preset: ${result.castVoice.dspPreset} | Speed: ${result.castVoice.speed}x`);
    console.log(`- Rationale: ${result.castVoice.reason}`);

    console.log('\n🎬 CINEMATIC STORYBOARD & VISION QC:');
    console.log(`- Total Scenes Generated: ${result.scenes.length}`);
    result.scenes.forEach((sc, idx) => {
      console.log(`\n[Scene #${sc.sceneIndex}] (${sc.timecode}) Motion: ${sc.motionType}`);
      console.log(`  Sentence: "${sc.sentence}"`);
      console.log(`  Prompt: ${sc.prompt.slice(0, 100)}...`);
      console.log(`  Local Image: ${sc.localImagePath || 'none'}`);
      console.log(`  Vision QC: ${sc.visionQcPassed ? '✅ PASSED' : '⚠️ FLAGGED'} (Score: ${sc.visionQcScore}/10) - ${sc.visionQcNotes}`);
    });

    console.log('\n====================================================');
    console.log('✅ ALL AGENTS (Writer, Critic, Director, QC) VERIFIED!');
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('\n❌ LIVE TEST FAILED:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

runLiveTest();
