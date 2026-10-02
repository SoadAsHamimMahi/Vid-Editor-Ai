/**
 * Instant Streaming Audio Player (ElevenLabs Grade)
 * 
 * Provides ultra-low latency, gapless streaming audio playback for AI Text-to-Speech.
 * As soon as the first sentence/clause chunk is synthesized by the backend,
 * this player decodes and begins playing the voice immediately (~350ms time-to-first-audio)
 * while subsequent speech chunks generate in the background and queue with microsecond sample precision.
 */

import { TTSAudioChunk } from '../types';

export interface StreamingPlayerState {
  isStreaming: boolean;
  isPlaying: boolean;
  activeChunkIndex: number;
  totalChunks: number;
  currentPlaybackTime: number;
  bufferedDuration: number;
  sessionId: string | null;
  finalAudioPath: string | null;
}

type StateListener = (state: StreamingPlayerState) => void;

class StreamingAudioPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  private activeSessionId: string | null = null;
  private isStreaming = false;
  private isPlaying = false;
  private activeChunkIndex = 0;
  private totalChunks = 0;
  private finalAudioPath: string | null = null;
  private isStreamFinished = false;

  private nextPlayTime = 0;
  private streamStartTime = 0;
  private nextExpectedChunk = 0;
  private receivedChunks = new Map<number, { buffer: AudioBuffer; text: string; isLast: boolean }>();
  private scheduledSources: AudioBufferSourceNode[] = [];
  private chunkSchedules: { chunkIndex: number; startTime: number; endTime: number; text: string }[] = [];

  private listeners = new Set<StateListener>();
  private animationFrameId: number | null = null;
  private completionTimeoutId: any = null;

  private initAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.gainNode = this.audioContext.createGain();
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 64;
      this.analyserNode.smoothingTimeConstant = 0.8;

      this.gainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.warn('[StreamingAudioPlayer] Listener error:', err);
      }
    }
  }

  public getState(): StreamingPlayerState {
    let currentPlaybackTime = 0;
    if (this.audioContext && this.streamStartTime > 0 && this.isPlaying) {
      currentPlaybackTime = Math.max(0, this.audioContext.currentTime - this.streamStartTime);
    }

    return {
      isStreaming: this.isStreaming,
      isPlaying: this.isPlaying,
      activeChunkIndex: this.activeChunkIndex,
      totalChunks: this.totalChunks,
      currentPlaybackTime,
      bufferedDuration: Math.max(0, this.nextPlayTime - (this.audioContext?.currentTime || 0)),
      sessionId: this.activeSessionId,
      finalAudioPath: this.finalAudioPath,
    };
  }

  /**
   * Starts a new instant streaming session for TTS synthesis.
   */
  public startSession(sessionId: string) {
    this.stop();
    this.initAudioContext();

    this.activeSessionId = sessionId;
    this.isStreaming = true;
    this.isPlaying = false;
    this.activeChunkIndex = 0;
    this.totalChunks = 0;
    this.nextExpectedChunk = 0;
    this.nextPlayTime = 0;
    this.streamStartTime = 0;
    this.finalAudioPath = null;
    this.isStreamFinished = false;
    this.receivedChunks.clear();
    this.scheduledSources = [];
    this.chunkSchedules = [];

    this.startTrackingLoop();
    this.notify();
    console.log(`[StreamingAudioPlayer] ⚡ Session started: ${sessionId}`);
  }

  /**
   * Ingests a synthesized audio chunk from the main process.
   */
  public async handleChunk(chunk: TTSAudioChunk) {
    if (!chunk || !chunk.audioData) return;
    if (this.activeSessionId && chunk.sessionId && chunk.sessionId !== this.activeSessionId) {
      // Chunk belongs to an older or different session
      return;
    }

    if (!this.activeSessionId && chunk.sessionId) {
      this.startSession(chunk.sessionId);
    }

    const ctx = this.initAudioContext();
    if (chunk.totalChunks > 0) {
      this.totalChunks = chunk.totalChunks;
    }
    if (chunk.finalAudioPath) {
      this.finalAudioPath = chunk.finalAudioPath;
    }
    if (chunk.isLast) {
      this.isStreamFinished = true;
    }

    try {
      // Convert base64 to binary ArrayBuffer
      const binaryString = atob(chunk.audioData);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode audio buffer (WAV or MP3)
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));

      this.receivedChunks.set(chunk.chunkIndex, {
        buffer: audioBuffer,
        text: chunk.text,
        isLast: chunk.isLast,
      });

      this.drainChunkQueue();
    } catch (err: any) {
      console.warn(`[StreamingAudioPlayer] Failed decoding chunk ${chunk.chunkIndex}:`, err.message);
      // Skip defective chunk so stream doesn't hang
      if (this.nextExpectedChunk === chunk.chunkIndex) {
        this.nextExpectedChunk++;
        this.drainChunkQueue();
      }
    }
  }

  /**
   * Schedules contiguous decoded chunks into the Web Audio API timeline.
   */
  private drainChunkQueue() {
    if (!this.audioContext || !this.isStreaming) return;

    while (this.receivedChunks.has(this.nextExpectedChunk)) {
      const chunkData = this.receivedChunks.get(this.nextExpectedChunk)!;
      const { buffer, text, isLast } = chunkData;
      const chunkIdx = this.nextExpectedChunk;

      // Calculate sample-accurate scheduling time
      const currentTime = this.audioContext.currentTime;
      let startTime = this.nextPlayTime;

      // If opening chunk (0) or stream underrun, start immediately with 40ms pre-roll
      if (startTime <= currentTime + 0.01) {
        startTime = currentTime + 0.04;
        if (chunkIdx === 0) {
          this.streamStartTime = startTime;
        }
      }

      const endTime = startTime + buffer.duration;
      this.nextPlayTime = endTime;

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode!);
      source.start(startTime);

      this.scheduledSources.push(source);
      this.chunkSchedules.push({
        chunkIndex: chunkIdx,
        startTime,
        endTime,
        text,
      });

      this.isPlaying = true;
      this.nextExpectedChunk++;

      console.log(
        `[StreamingAudioPlayer] ⚡ Queued chunk ${chunkIdx} (dur: ${buffer.duration.toFixed(2)}s, starts at ${startTime.toFixed(2)}s)`
      );

      if (isLast) {
        this.scheduleCompletion(endTime);
      }
    }

    this.notify();
  }

  /**
   * Tracks current chunk and playback progression via requestAnimationFrame.
   */
  private startTrackingLoop() {
    if (this.animationFrameId !== null) return;

    const tick = () => {
      if (!this.isStreaming && !this.isPlaying) {
        this.animationFrameId = null;
        return;
      }

      if (this.audioContext && this.isPlaying) {
        const now = this.audioContext.currentTime;

        // Determine which chunk is actively playing in the speakers
        for (const item of this.chunkSchedules) {
          if (now >= item.startTime && now < item.endTime) {
            if (this.activeChunkIndex !== item.chunkIndex) {
              this.activeChunkIndex = item.chunkIndex;
              this.notify();
            }
            break;
          }
        }
      }

      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  private scheduleCompletion(finishTime: number) {
    if (!this.audioContext) return;
    if (this.completionTimeoutId) {
      clearTimeout(this.completionTimeoutId);
    }

    const remainingSec = Math.max(0, finishTime - this.audioContext.currentTime);
    const delayMs = Math.round(remainingSec * 1000) + 100;

    this.completionTimeoutId = setTimeout(() => {
      console.log('[StreamingAudioPlayer] ✓ Stream playback completed gracefully.');
      this.isPlaying = false;
      this.isStreaming = false;
      this.notify();
    }, delayMs);
  }

  /**
   * Stops playback immediately and clears pending audio buffers.
   */
  public stop() {
    if (this.completionTimeoutId) {
      clearTimeout(this.completionTimeoutId);
      this.completionTimeoutId = null;
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    for (const source of this.scheduledSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {}
    }
    this.scheduledSources = [];
    this.chunkSchedules = [];
    this.receivedChunks.clear();

    this.isStreaming = false;
    this.isPlaying = false;
    this.activeSessionId = null;
    this.nextPlayTime = 0;
    this.streamStartTime = 0;

    this.notify();
  }

  /**
   * Sets player output volume (0.0 to 1.0).
   */
  public setVolume(volume: number) {
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), this.audioContext?.currentTime || 0);
    }
  }

  /**
   * Returns audio frequency bins (0 to 255) for live visualizer EQ animation.
   */
  public getVisualizerData(): Uint8Array {
    if (!this.analyserNode) {
      return new Uint8Array(32);
    }
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(data);
    return data;
  }
}

export const streamingAudioPlayer = new StreamingAudioPlayer();
