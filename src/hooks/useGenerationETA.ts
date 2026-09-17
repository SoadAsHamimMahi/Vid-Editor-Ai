import { useState, useEffect, useMemo, useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';

export interface GenerationETAResult {
  isGenerating: boolean;
  isPaused: boolean;
  mediaType: 'image' | 'video';
  totalCount: number;
  completedCount: number;
  failedCount: number;
  remainingCount: number;
  percentComplete: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  formattedElapsed: string;
  formattedETA: string;
  formattedFinishTime: string;
  speedSecPerItem: number;
  formattedSpeed: string;
  throughputPerMinute: string;
  concurrency: number;
  initialEstimatedSeconds: number;
  initialFormattedETA: string;
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0s';
  const sec = Math.round(totalSeconds);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) {
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(m / 60);
  const remainingM = m % 60;
  return remainingM > 0 ? `${h}h ${remainingM}m` : `${h}h`;
}

export function formatFinishClock(remainingSeconds: number): string {
  if (remainingSeconds <= 0) return 'Any moment';
  const target = new Date(Date.now() + remainingSeconds * 1000);
  return target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function useGenerationETA(): GenerationETAResult {
  const {
    project,
    generationProgress,
    isGenerationPaused,
    browsers,
    flowGenerationMode,
    flowSettings,
  } = useProjectStore();

  const [tickTime, setTickTime] = useState<number>(() => Date.now());

  const activeBrowsers = browsers.filter((b) => b.connected && b.enabled !== false).length;
  const concurrency = Math.max(1, activeBrowsers);

  const isVideoMode = flowGenerationMode === 'video' || flowSettings.mode === 'video';
  const mediaType: 'image' | 'video' = generationProgress.mediaType || (isVideoMode ? 'video' : 'image');

  const generatingScenes = project.scenes.filter((s) => s.status === 'generating');
  const pendingScenesCount = project.scenes.filter(
    (s) => s.status !== 'ready' || (mediaType === 'video' ? !s.localVideoPath : !s.localImagePath)
  ).length;

  const isGenerating = generationProgress.isActive || generatingScenes.length > 0;
  const isPaused = isGenerationPaused || generationProgress.isPaused;

  // Real-time ticking interval every 1000ms while generating and not paused
  useEffect(() => {
    if (!isGenerating || isPaused) return;

    // Immediately sync current timestamp
    setTickTime(Date.now());

    const interval = setInterval(() => {
      setTickTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [isGenerating, isPaused]);

  // Compute live speed (seconds per item)
  const speedSecPerItem = useMemo(() => {
    const recent = generationProgress.recentDurations;
    if (recent && recent.length > 0) {
      // Calculate weighted moving average where more recent completions have higher weight
      let totalWeight = 0;
      let weightedSum = 0;
      for (let i = 0; i < recent.length; i++) {
        const weight = i + 1;
        weightedSum += recent[i] * weight;
        totalWeight += weight;
      }
      const avg = weightedSum / totalWeight;
      return Math.max(1.0, Number(avg.toFixed(1)));
    }

    if (generationProgress.sessionAvgSpeed && generationProgress.sessionAvgSpeed > 0) {
      return Math.max(1.0, Number(generationProgress.sessionAvgSpeed.toFixed(1)));
    }

    // Default intelligent baseline adjusted for active concurrency
    const baseline = mediaType === 'video' ? 45.0 : 12.0;
    const adjusted = baseline / concurrency;
    return Math.max(1.0, Number(adjusted.toFixed(1)));
  }, [
    generationProgress.recentDurations,
    generationProgress.sessionAvgSpeed,
    mediaType,
    concurrency,
  ]);

  // Counts and progress calculations
  const completedCount = generationProgress.completedInBatch;
  const failedCount = generationProgress.failedInBatch;

  // Dynamic remaining count
  const remainingCount = isGenerating
    ? Math.max(
        0,
        Math.min(
          pendingScenesCount,
          generationProgress.totalInBatch > 0
            ? generationProgress.totalInBatch - completedCount - failedCount
            : pendingScenesCount
        )
      )
    : pendingScenesCount;

  const totalCount = Math.max(
    generationProgress.totalInBatch,
    completedCount + failedCount + remainingCount,
    1
  );

  const percentComplete = isGenerating
    ? Math.min(100, Math.max(0, Math.round(((completedCount + failedCount) / totalCount) * 100)))
    : 0;

  // Elapsed time calculation
  const elapsedSeconds = useMemo(() => {
    if (!generationProgress.startTime || !isGenerating) return 0;
    return Math.max(0, Math.floor((tickTime - generationProgress.startTime) / 1000));
  }, [generationProgress.startTime, isGenerating, tickTime]);

  // Remaining seconds with smooth 1-second live countdown
  const remainingSeconds = useMemo(() => {
    if (!isGenerating || remainingCount <= 0) return 0;

    const baseRemaining = remainingCount * speedSecPerItem;

    // Time elapsed on current item in flight
    const anchorTime = generationProgress.lastFinishTime || generationProgress.startTime || tickTime;
    const timeSpentOnCurrent = Math.max(0, (tickTime - anchorTime) / 1000);

    // Smoothly decrement up to 85% of one item duration before next completion arrives
    const deducted = Math.min(timeSpentOnCurrent, speedSecPerItem * 0.85);
    const liveRemaining = Math.max(1, Math.round(baseRemaining - deducted));

    return liveRemaining;
  }, [
    isGenerating,
    remainingCount,
    speedSecPerItem,
    generationProgress.lastFinishTime,
    generationProgress.startTime,
    tickTime,
  ]);

  // Pre-generation (idle) upfront estimate
  const initialEstimatedSeconds = useMemo(() => {
    return Math.round(pendingScenesCount * speedSecPerItem);
  }, [pendingScenesCount, speedSecPerItem]);

  const formattedElapsed = formatDuration(elapsedSeconds);
  const formattedETA = isGenerating ? formatDuration(remainingSeconds) : formatDuration(initialEstimatedSeconds);
  const formattedFinishTime = formatFinishClock(remainingSeconds);
  const formattedSpeed = `~${speedSecPerItem.toFixed(1)}s / ${mediaType === 'video' ? 'video' : 'image'}`;
  const throughputPerMinute = `${(60 / speedSecPerItem).toFixed(1)} ${mediaType === 'video' ? 'vid' : 'img'}/min`;
  const initialFormattedETA = formatDuration(initialEstimatedSeconds);

  return {
    isGenerating,
    isPaused,
    mediaType,
    totalCount,
    completedCount,
    failedCount,
    remainingCount,
    percentComplete,
    elapsedSeconds,
    remainingSeconds,
    formattedElapsed,
    formattedETA,
    formattedFinishTime,
    speedSecPerItem,
    formattedSpeed,
    throughputPerMinute,
    concurrency,
    initialEstimatedSeconds,
    initialFormattedETA,
  };
}
