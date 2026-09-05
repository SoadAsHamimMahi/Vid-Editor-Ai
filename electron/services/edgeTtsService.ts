import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

export interface EdgeTTSOptions {
  voice?: string;
  lang?: string;
  gender?: 'male' | 'female' | 'neutral';
  rate?: number; // 0.5 to 2.0 (1.0 = normal)
  pitch?: number; // -50 to +50 (0 = normal)
  volume?: number; // 0 to 100
}

export class EdgeTtsService {
  private static readonly TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  private static readonly WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readahead/edge/v1?TrustedClientToken=${EdgeTtsService.TRUSTED_CLIENT_TOKEN}`;

  // Common voice aliases mapping friendly IDs to exact Microsoft Azure Speech names
  private static readonly VOICE_MAP: Record<string, string> = {
    // Bengali (Bangladesh & India)
    'bn-BD-PradeepNeural': 'bn-BD-PradeepNeural',
    'bn-BD-NabanitaNeural': 'bn-BD-NabanitaNeural',
    'bn-IN-BashkarNeural': 'bn-IN-BashkarNeural',
    'bn-IN-TanishaaNeural': 'bn-IN-TanishaaNeural',
    'edge-bn-pradeep': 'bn-BD-PradeepNeural',
    'edge-bn-nabanita': 'bn-BD-NabanitaNeural',
    'edge-bn-bashkar': 'bn-IN-BashkarNeural',
    'indic-bn-tariq': 'bn-BD-PradeepNeural',
    'indic-bn-ananya': 'bn-BD-NabanitaNeural',
    'indic-bn-subir': 'bn-IN-BashkarNeural',
    'indic-bn-moushumi': 'bn-BD-NabanitaNeural',
    'neural-bn-pradeep': 'bn-BD-PradeepNeural',
    'neural-bn-nabanita': 'bn-BD-NabanitaNeural',

    // English (US, UK, etc.)
    'en-US-ChristopherNeural': 'en-US-ChristopherNeural',
    'en-US-GuyNeural': 'en-US-GuyNeural',
    'en-US-JennyNeural': 'en-US-JennyNeural',
    'en-US-AriaNeural': 'en-US-AriaNeural',
    'en-US-AndrewNeural': 'en-US-AndrewNeural',
    'en-US-BrianNeural': 'en-US-BrianNeural',
    'en-US-EmmaNeural': 'en-US-EmmaNeural',
    'en-GB-RyanNeural': 'en-GB-RyanNeural',
    'en-GB-SoniaNeural': 'en-GB-SoniaNeural',
    'edge-en-christopher': 'en-US-ChristopherNeural',
    'edge-en-guy': 'en-US-GuyNeural',
    'edge-en-jenny': 'en-US-JennyNeural',
    'edge-en-aria': 'en-US-AriaNeural',
    'edge-en-ryan': 'en-GB-RyanNeural',
    'neural-en-christopher': 'en-US-ChristopherNeural',
    'chatter-en-alexander': 'en-US-ChristopherNeural',
    'chatter-en-seraphina': 'en-US-AriaNeural',
    'chatter-en-oliver': 'en-GB-RyanNeural',
    'chatter-en-clara': 'en-US-JennyNeural',

    // Hindi
    'hi-IN-MadhurNeural': 'hi-IN-MadhurNeural',
    'hi-IN-SwaraNeural': 'hi-IN-SwaraNeural',
    'edge-hi-madhur': 'hi-IN-MadhurNeural',
    'indic-hi-aarav': 'hi-IN-MadhurNeural',
    'indic-hi-diya': 'hi-IN-SwaraNeural',

    // Tamil & Telugu & Marathi
    'indic-ta-kavitha': 'ta-IN-PallaviNeural',
    'indic-te-suresh': 'te-IN-MohanNeural',
    'indic-mr-rohit': 'mr-IN-ManoharNeural',

    // Other Global Languages
    'chatter-es-mateo': 'es-ES-AlvaroNeural',
    'chatter-fr-celeste': 'fr-FR-DeniseNeural',
    'chatter-ja-kenji': 'ja-JP-KeitaNeural',
    'chatter-de-maximilian': 'de-DE-KillianNeural',
    'chatter-ar-tariq': 'ar-SA-HamedNeural',
  };

  /**
   * Resolves canonical voice name based on language, gender, or provided ID.
   */
  public resolveVoice(voiceId?: string, lang?: string, gender?: 'male' | 'female' | 'neutral'): string {
    if (voiceId && EdgeTtsService.VOICE_MAP[voiceId]) {
      return EdgeTtsService.VOICE_MAP[voiceId];
    }
    if (voiceId && voiceId.includes('Neural')) {
      return voiceId;
    }

    const l = (lang || 'en').toLowerCase();
    const isFemale = (gender === 'female');

    if (l === 'bn') return isFemale ? 'bn-BD-NabanitaNeural' : 'bn-BD-PradeepNeural';
    if (l === 'hi') return isFemale ? 'hi-IN-SwaraNeural' : 'hi-IN-MadhurNeural';
    if (l === 'ta') return isFemale ? 'ta-IN-PallaviNeural' : 'ta-IN-ValluvarNeural';
    if (l === 'te') return isFemale ? 'te-IN-ShrutiNeural' : 'te-IN-MohanNeural';
    if (l === 'es') return isFemale ? 'es-ES-ElviraNeural' : 'es-ES-AlvaroNeural';
    if (l === 'fr') return isFemale ? 'fr-FR-DeniseNeural' : 'fr-FR-HenriNeural';
    if (l === 'de') return isFemale ? 'de-DE-KatjaNeural' : 'de-DE-KillianNeural';
    if (l === 'ja') return isFemale ? 'ja-JP-NanamiNeural' : 'ja-JP-KeitaNeural';
    if (l === 'ar') return isFemale ? 'ar-SA-ZariyahNeural' : 'ar-SA-HamedNeural';
    return isFemale ? 'en-US-JennyNeural' : 'en-US-ChristopherNeural';
  }

  /**
   * Converts bracket tags like [pause: 0.8s], [whisper], [angry], [cheerful] into valid SSML tags.
   */
  public convertTagsToSsml(text: string): string {
    let escaped = this.escapeXml(text);

    // [pause: 0.8s], [pause: 800ms], [pause]
    escaped = escaped.replace(/\[pause(?::\s*([\d.]+)\s*(s|ms)?)?\]/gi, (_m, val, unit) => {
      if (!val) return `<break time='750ms'/>`;
      const num = parseFloat(val);
      if (isNaN(num)) return `<break time='750ms'/>`;
      const ms = unit === 'ms' ? Math.round(num) : Math.round(num * 1000);
      const clampedMs = Math.max(100, Math.min(5000, ms));
      return `<break time='${clampedMs}ms'/>`;
    });

    // Paralinguistic & Emotion Cues
    escaped = escaped.replace(/\[whisper\](.*?)\[\/whisper\]/gi, `<mstts:express-as style='whispering'><prosody pitch='-4Hz' rate='-10%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[whisper\]/gi, `<mstts:express-as style='whispering'>`);
    escaped = escaped.replace(/\[\/whisper\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[angry\](.*?)\[\/angry\]/gi, `<mstts:express-as style='angry'><prosody pitch='+4Hz' rate='+12%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[angry\]/gi, `<mstts:express-as style='angry'>`);
    escaped = escaped.replace(/\[\/angry\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[(?:cheerful|happy)\](.*?)\[\/(?:cheerful|happy)\]/gi, `<mstts:express-as style='cheerful'><prosody pitch='+5Hz' rate='+8%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[(?:cheerful|happy)\]/gi, `<mstts:express-as style='cheerful'>`);
    escaped = escaped.replace(/\[\/(?:cheerful|happy)\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[sad\](.*?)\[\/sad\]/gi, `<mstts:express-as style='sad'><prosody pitch='-4Hz' rate='-12%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[sad\]/gi, `<mstts:express-as style='sad'>`);
    escaped = escaped.replace(/\[\/sad\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[(?:terrified|fear)\](.*?)\[\/(?:terrified|fear)\]/gi, `<mstts:express-as style='terrified'><prosody pitch='+7Hz' rate='+18%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[(?:terrified|fear)\]/gi, `<mstts:express-as style='terrified'>`);
    escaped = escaped.replace(/\[\/(?:terrified|fear)\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[excited\](.*?)\[\/excited\]/gi, `<mstts:express-as style='cheerful'><prosody pitch='+6Hz' rate='+15%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[excited\]/gi, `<mstts:express-as style='cheerful'>`);
    escaped = escaped.replace(/\[\/excited\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[dramatic\](.*?)\[\/dramatic\]/gi, `<mstts:express-as style='narrative-serious'><prosody pitch='-3Hz' rate='-10%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[dramatic\]/gi, `<mstts:express-as style='narrative-serious'>`);
    escaped = escaped.replace(/\[\/dramatic\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[calm\](.*?)\[\/calm\]/gi, `<mstts:express-as style='calm'><prosody pitch='-2Hz' rate='-6%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[calm\]/gi, `<mstts:express-as style='calm'>`);
    escaped = escaped.replace(/\[\/calm\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[curious\]/gi, `<mstts:express-as style='curious'>`);
    escaped = escaped.replace(/\[sarcastic\]/gi, `<mstts:express-as style='disgruntled'>`);

    // Clean remaining simple emotion tags
    escaped = escaped.replace(/\[(?:laugh|sigh|cough|chuckle|gasp)\]/gi, '');

    return escaped.replace(/\s+/g, ' ').trim();
  }

  /**
   * Synthesizes text directly to an MP3 file with full voice, emotion, and gender fidelity.
   */
  public async synthesizeToFile(
    text: string,
    outputPath: string,
    options: EdgeTTSOptions & { emotion?: string } = {}
  ): Promise<boolean> {
    // 1. Detect emotion from tags or explicit option to modulate base pitch & rate
    const textLower = text.toLowerCase();
    const activeEmotion = options.emotion || (
      textLower.includes('[angry]') ? 'angry' :
      textLower.includes('[whisper]') ? 'whisper' :
      textLower.includes('[cheerful]') || textLower.includes('[happy]') ? 'cheerful' :
      textLower.includes('[sad]') ? 'sad' :
      textLower.includes('[terrified]') || textLower.includes('[fear]') ? 'terrified' :
      textLower.includes('[dramatic]') ? 'dramatic' :
      textLower.includes('[excited]') ? 'excited' :
      textLower.includes('[calm]') ? 'calm' : 'neutral'
    );

    // Sanitize text for standard speech while keeping pauses
    const rawStr = text || '';
    const cleanPlainText = (typeof (rawStr as any).toWellFormed === 'function' ? (rawStr as any).toWellFormed() : rawStr)
      .replace(/[\uD800-\uDFFF]/g, '')
      .replace(/\[pause(?::\s*[\d.]+\s*(?:s|ms)?)?\]/gi, '... ... ')
      .replace(/\[\/?(?:angry|whisper|cheerful|happy|sad|terrified|fear|dramatic|excited|calm|curious|sarcastic|laugh|sigh|cough|chuckle|gasp)\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanPlainText) {
      throw new Error('Script text is empty after cleaning.');
    }

    const voice = this.resolveVoice(options.voice, options.lang, options.gender);
    
    // Calculate emotion-adjusted rate & pitch
    let baseRate = options.rate ?? 1.0;
    let basePitch = options.pitch ?? 0;

    if (activeEmotion === 'angry') {
      baseRate *= 1.12;
      basePitch += 4;
    } else if (activeEmotion === 'whisper') {
      baseRate *= 0.90;
      basePitch -= 5;
    } else if (activeEmotion === 'cheerful' || activeEmotion === 'excited') {
      baseRate *= 1.10;
      basePitch += 5;
    } else if (activeEmotion === 'sad') {
      baseRate *= 0.88;
      basePitch -= 4;
    } else if (activeEmotion === 'terrified') {
      baseRate *= 1.18;
      basePitch += 7;
    } else if (activeEmotion === 'dramatic') {
      baseRate *= 0.90;
      basePitch -= 3;
    } else if (activeEmotion === 'calm') {
      baseRate *= 0.94;
      basePitch -= 2;
    }

    const ratePercent = Math.round((baseRate - 1.0) * 100);
    const rateStr = `${ratePercent >= 0 ? '+' : ''}${ratePercent}%`;
    const pitchStr = `${basePitch >= 0 ? '+' : ''}${Math.round(basePitch)}Hz`;

    // 2. Synthesize using Python edge_tts module via temporary file (bulletproof on Windows)
    const tempInputPath = path.join(os.tmpdir(), `edge_in_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
    await fs.writeFile(tempInputPath, cleanPlainText, 'utf-8');

    try {
      const pySuccess = await this.synthesizeWithPythonFile(tempInputPath, voice, rateStr, pitchStr, outputPath);
      if (pySuccess && fs.existsSync(outputPath)) {
        return true;
      }
    } catch (pyErr: any) {
      console.warn('[EdgeTtsService] Python edge-tts file worker warning, trying direct python script:', pyErr.message);
    } finally {
      await fs.unlink(tempInputPath).catch(() => {});
    }

    // 3. Fallback to Python inline Communicate execution
    try {
      const inlineSuccess = await this.synthesizeWithPythonInline(cleanPlainText, voice, rateStr, pitchStr, outputPath);
      if (inlineSuccess && fs.existsSync(outputPath)) {
        return true;
      }
    } catch (inlineErr: any) {
      console.warn('[EdgeTtsService] Python inline execution warning:', inlineErr.message);
    }

    // 4. Last resort fallback to WebSocket
    const ssmlContent = this.convertTagsToSsml(text);
    const lang = options.lang || (voice.startsWith('bn') ? 'bn-BD' : voice.startsWith('hi') ? 'hi-IN' : 'en-US');
    const fullSsml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'><prosody pitch='${pitchStr}' rate='${rateStr}' volume='+0%'>${ssmlContent}</prosody></voice></speak>`;
    const audioBuffer = await this.synthesizeWithCustomSsml(fullSsml, voice);
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Edge TTS returned zero audio bytes.');
    }
    await fs.writeFile(outputPath, audioBuffer);
    return fs.existsSync(outputPath);
  }

  private async synthesizeWithPythonFile(
    inputFilePath: string,
    voice: string,
    rateStr: string,
    pitchStr: string,
    outputPath: string
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const pythonExe = this.resolvePythonExe();
      const args = [
        '-m',
        'edge_tts',
        '--voice',
        voice,
        '--rate',
        rateStr,
        '--pitch',
        pitchStr,
        '--file',
        inputFilePath,
        '--write-media',
        outputPath,
      ];

      const proc = spawn(pythonExe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';

      proc.stderr.on('data', (d) => (stderr += d.toString()));

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(true);
        } else {
          reject(new Error(stderr || `edge-tts process exited with code ${code}`));
        }
      });

      proc.on('error', (err) => reject(err));
    });
  }

  private async synthesizeWithPythonInline(
    text: string,
    voice: string,
    rateStr: string,
    pitchStr: string,
    outputPath: string
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const pythonExe = this.resolvePythonExe();
      const tempScriptPath = path.join(os.tmpdir(), `edge_runner_${Date.now()}.py`);
      const tempPayloadPath = path.join(os.tmpdir(), `edge_payload_${Date.now()}.json`);

      const payload = { text, voice, rate: rateStr, pitch: pitchStr, output: outputPath };
      fs.writeJsonSync(tempPayloadPath, payload);

      const scriptContent = `
import json, asyncio, edge_tts, sys

with open(r"${tempPayloadPath.replace(/\\/g, '\\\\')}", "r", encoding="utf-8") as f:
    data = json.load(f)

async def main():
    c = edge_tts.Communicate(
        text=data["text"],
        voice=data["voice"],
        rate=data["rate"],
        pitch=data["pitch"]
    )
    await c.save(data["output"])

try:
    asyncio.run(main())
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
`.trim();

      fs.writeFileSync(tempScriptPath, scriptContent, 'utf-8');

      const proc = spawn(pythonExe, [tempScriptPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';

      proc.stderr.on('data', (d) => (stderr += d.toString()));

      proc.on('close', (code) => {
        try {
          fs.unlinkSync(tempScriptPath);
          fs.unlinkSync(tempPayloadPath);
        } catch {}

        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(true);
        } else {
          reject(new Error(stderr || `Python inline edge_tts exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        try {
          fs.unlinkSync(tempScriptPath);
          fs.unlinkSync(tempPayloadPath);
        } catch {}
        reject(err);
      });
    });
  }

  private resolvePythonExe(): string {
    if (process.platform === 'win32') {
      const localPython = path.join(
        process.env.LOCALAPPDATA || '',
        'Programs',
        'Python',
        'Python313',
        'python.exe'
      );
      if (fs.existsSync(localPython)) return localPython;
      return 'py';
    }
    return 'python3';
  }

  /**
   * Synthesizes text to a Buffer containing MP3 audio data.
   */
  /**
   * Synthesizes custom SSML string directly via WebSocket.
   */
  public async synthesizeWithCustomSsml(ssml: string, voiceName?: string): Promise<Buffer> {
    const connectionId = crypto.randomUUID().replace(/-/g, '');
    const requestId = crypto.randomUUID().replace(/-/g, '');
    const url = `${EdgeTtsService.WSS_URL}&ConnectionId=${connectionId}`;

    return new Promise<Buffer>((resolve, reject) => {
      const audioChunks: Buffer[] = [];
      let isCompleted = false;

      const ws = new WebSocket(url, {
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
          'Origin': 'chrome-extension://jdiccldimpdaibmpdkgiklldaknhhmbf',
        },
      });

      const timeout = setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true;
          try { ws.close(); } catch {}
          if (audioChunks.length > 0) {
            resolve(Buffer.concat(audioChunks));
          } else {
            reject(new Error('Edge TTS request timed out after 30s.'));
          }
        }
      }, 30000);

      ws.on('open', () => {
        // 1. Send speech.config
        const configMessage =
          `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: 'false',
                    wordBoundaryEnabled: 'true',
                  },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                },
              },
            },
          });
        ws.send(configMessage);

        // 2. Send SSML request
        const ssmlMessage =
          `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
          ssml;
        ws.send(ssmlMessage);
      });

      ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
        if (isBinary) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
          if (buf.length > 2) {
            const headerLength = buf.readUInt16BE(0);
            const headerStr = buf.subarray(2, 2 + headerLength).toString('utf-8');
            if (headerStr.includes('Path:audio')) {
              const audioPart = buf.subarray(2 + headerLength);
              if (audioPart.length > 0) {
                audioChunks.push(audioPart);
              }
            }
          }
        } else {
          const textMsg = data.toString();
          if (textMsg.includes('Path:turn.end')) {
            if (!isCompleted) {
              isCompleted = true;
              clearTimeout(timeout);
              try { ws.close(); } catch {}
              resolve(Buffer.concat(audioChunks));
            }
          }
        }
      });

      ws.on('error', (err) => {
        if (!isCompleted) {
          isCompleted = true;
          clearTimeout(timeout);
          if (audioChunks.length > 0) {
            resolve(Buffer.concat(audioChunks));
          } else {
            reject(err);
          }
        }
      });

      ws.on('close', () => {
        if (!isCompleted) {
          isCompleted = true;
          clearTimeout(timeout);
          if (audioChunks.length > 0) {
            resolve(Buffer.concat(audioChunks));
          } else {
            reject(new Error('Edge TTS connection closed before audio received.'));
          }
        }
      });
    });
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
