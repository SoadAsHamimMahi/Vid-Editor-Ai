import { VideoEditorMcpServer } from '../electron/services/mcpServer';
import { ProjectStorage } from '../electron/services/projectStorage';
import { TTSService } from '../electron/services/ttsService';
import { FFmpegService } from '../electron/services/ffmpegService';
import { WhisperService } from '../electron/services/whisperService';

const projectStorage = new ProjectStorage();
const ttsService = new TTSService();
const ffmpegService = new FFmpegService();
const whisperService = new WhisperService();

const server = new VideoEditorMcpServer({
  projectStorage,
  ttsService,
  ffmpegService,
  whisperService,
  getMainWindow: () => null,
});

server.connectStdio().catch((err) => {
  console.error('[MCP Stdio] Fatal server error:', err);
  process.exit(1);
});
