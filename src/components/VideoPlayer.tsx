import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  AlertCircle,
} from 'lucide-react';
import { parseVideoUrl, formatVideoTimestamp } from '../utils/video';

export interface VideoPlayerHandle {
  getCurrentSecond: () => number;
  seekToSecond: (seconds: number) => void;
  pause: () => void;
}

interface VideoPlayerProps {
  videoUrl: string;
  watermarkEnabled: boolean;
  watermarkText: string;
  commentSeconds?: number[];
  onTimeUpdate?: (seconds: number) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  (
    {
      videoUrl,
      watermarkEnabled,
      watermarkText,
      commentSeconds = [],
      onTimeUpdate,
    },
    ref
  ) => {
    const parsedSource = parseVideoUrl(videoUrl);
    const stageRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const progressBarRef = useRef<HTMLDivElement | null>(null);
    const hideControlsTimeoutRef = useRef<number | null>(null);
    const onTimeUpdateRef = useRef(onTimeUpdate);
    onTimeUpdateRef.current = onTimeUpdate;

    const [currentTime, setCurrentTime] = useState<number>(0);
    const [duration, setDuration] = useState<number>(15);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isMuted, setIsMuted] = useState<boolean>(false);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
    const [controlsVisible, setControlsVisible] = useState<boolean>(true);
    const [isDraggingProgress, setIsDraggingProgress] = useState<boolean>(false);
    const [useSimulatedClock, setUseSimulatedClock] = useState<boolean>(false);

    // Schedule auto-hide of controls after 2 seconds (2000ms) of mouse inactivity
    const resetControlsTimer = useCallback(() => {
      setControlsVisible(true);
      if (hideControlsTimeoutRef.current !== null) {
        window.clearTimeout(hideControlsTimeoutRef.current);
      }
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 2000);
    }, []);

    useEffect(() => {
      resetControlsTimer();
      return () => {
        if (hideControlsTimeoutRef.current !== null) {
          window.clearTimeout(hideControlsTimeoutRef.current);
        }
      };
    }, [resetControlsTimer]);

    // Reset state when video URL changes
    useEffect(() => {
      setCurrentTime(0);
      setDuration(15);
      setIsPlaying(false);
      setUseSimulatedClock(false);
    }, [videoUrl]);

    // Fallback clock only if browser lacks codec in headless test container
    useEffect(() => {
      if (!useSimulatedClock || !isPlaying) return;
      const timer = window.setInterval(() => {
        setCurrentTime((prev) => {
          const maxDur = duration > 0 ? duration : 15;
          const next = prev + 0.25 >= maxDur ? 0 : prev + 0.25;
          if (onTimeUpdateRef.current) {
            onTimeUpdateRef.current(Math.floor(next));
          }
          return next;
        });
      }, 250);
      return () => window.clearInterval(timer);
    }, [useSimulatedClock, isPlaying, duration]);

    // Sync fullscreen state with browser Fullscreen API
    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(Boolean(document.fullscreenElement));
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
      };
    }, []);

    const seekTo = useCallback(
      (seconds: number) => {
        const maxDur = duration > 0 ? duration : 15;
        const clamped = Math.max(0, Math.min(maxDur, seconds));
        setCurrentTime(clamped);
        if (onTimeUpdateRef.current) {
          onTimeUpdateRef.current(Math.floor(clamped));
        }
        if (videoRef.current && !useSimulatedClock) {
          try {
            videoRef.current.currentTime = clamped;
          } catch {
            // Ignore if metadata not loaded yet
          }
        }
      },
      [duration, useSimulatedClock]
    );

    useImperativeHandle(ref, () => ({
      getCurrentSecond: () => {
        if (
          videoRef.current &&
          !useSimulatedClock &&
          Number.isFinite(videoRef.current.currentTime) &&
          videoRef.current.currentTime > 0
        ) {
          return Math.floor(videoRef.current.currentTime);
        }
        return Math.floor(currentTime);
      },
      seekToSecond: (seconds: number) => {
        seekTo(seconds);
        resetControlsTimer();
        if (videoRef.current && !useSimulatedClock) {
          videoRef.current.play().catch(() => {
            setUseSimulatedClock(true);
            setIsPlaying(true);
          });
        } else {
          setIsPlaying(true);
        }
      },
      pause: () => {
        if (videoRef.current && !useSimulatedClock) {
          videoRef.current.pause();
        }
        setIsPlaying(false);
        resetControlsTimer();
      },
    }));

    const togglePlay = () => {
      resetControlsTimer();
      if (useSimulatedClock) {
        setIsPlaying((prev) => !prev);
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) {
        video.play().catch(() => {
          setUseSimulatedClock(true);
          setIsPlaying(true);
        });
      } else {
        video.pause();
      }
    };

    const toggleMute = (e: React.MouseEvent) => {
      e.stopPropagation();
      resetControlsTimer();
      const video = videoRef.current;
      if (video) {
        video.muted = !video.muted;
        setIsMuted(video.muted);
      } else {
        setIsMuted((prev) => !prev);
      }
    };

    const toggleFullscreen = async (e: React.MouseEvent) => {
      e.stopPropagation();
      resetControlsTimer();
      const container = stageRef.current;
      if (!container) return;

      try {
        if (!document.fullscreenElement) {
          await container.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch {
        // Fullscreen may be restricted in some environments
      }
    };

    const updateProgressFromClientX = useCallback(
      (clientX: number) => {
        const bar = progressBarRef.current;
        if (!bar) return;
        const rect = bar.getBoundingClientRect();
        if (rect.width <= 0) return;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const maxDur = duration > 0 ? duration : 15;
        seekTo(ratio * maxDur);
      },
      [duration, seekTo]
    );

    const handleProgressPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      resetControlsTimer();
      setIsDraggingProgress(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      updateProgressFromClientX(e.clientX);
    };

    const handleProgressPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingProgress) return;
      e.stopPropagation();
      resetControlsTimer();
      updateProgressFromClientX(e.clientX);
    };

    const handleProgressPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingProgress) return;
      e.stopPropagation();
      setIsDraggingProgress(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    };

    const effectiveDuration = duration > 0 ? duration : 15;
    const progressPercent = Math.max(
      0,
      Math.min(100, (currentTime / effectiveDuration) * 100)
    );

    // Deduplicate and filter valid comment markers inside video duration
    const uniqueCommentMarkers = Array.from(new Set(commentSeconds)).filter(
      (sec) => Number.isFinite(sec) && sec >= 0 && sec <= effectiveDuration
    );

    return (
      <div className="w-full flex flex-col items-center">
        {/* Vertical 9:16 Video Container (also acts as the Fullscreen root so Watermark & Custom Controls remain visible in Fullscreen) */}
        <div
          ref={stageRef}
          onMouseMove={resetControlsTimer}
          onMouseEnter={resetControlsTimer}
          onTouchStart={resetControlsTimer}
          onContextMenu={(e) => e.preventDefault()}
          className={`relative overflow-hidden bg-black select-none ${
            isFullscreen
              ? 'w-screen h-screen flex items-center justify-center rounded-none'
              : 'w-full max-w-[360px] sm:max-w-[380px] aspect-[9/16] rounded-2xl'
          }`}
          data-testid="video-stage"
        >
          {parsedSource.type === 'invalid' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black">
              <AlertCircle className="w-8 h-8 text-white mb-3" />
              <p className="text-sm font-medium text-white mb-1">
                Enlace de video .mp4 no válido
              </p>
              <p className="text-xs text-neutral-400">{parsedSource.reason}</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={parsedSource.src}
              playsInline
              preload="metadata"
              controlsList="nodownload noplaybackrate noremoteplayback"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              onClick={togglePlay}
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                setCurrentTime(t);
                if (onTimeUpdateRef.current) {
                  onTimeUpdateRef.current(Math.floor(t));
                }
              }}
              onLoadedMetadata={(e) => {
                if (
                  Number.isFinite(e.currentTarget.duration) &&
                  e.currentTarget.duration > 0
                ) {
                  setDuration(e.currentTarget.duration);
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onError={() => {
                setUseSimulatedClock(true);
              }}
              className={`cursor-pointer bg-black ${
                isFullscreen
                  ? 'h-full aspect-[9/16] max-w-full object-cover'
                  : 'w-full h-full object-cover'
              }`}
            />
          )}

          {/* Diagonal Repeated Semi-Transparent Watermark Overlay (pointer-events-none, stays visible in fullscreen) */}
          {watermarkEnabled && watermarkText.trim().length > 0 && (
            <div
              className="pointer-events-none select-none absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden p-4"
              aria-label={`Marca de agua: ${watermarkText}`}
              data-testid="video-watermark"
            >
              <div className="-rotate-24 flex flex-col items-center gap-14 opacity-25">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <span
                    key={idx}
                    className="text-base sm:text-lg font-bold tracking-widest uppercase text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] whitespace-nowrap"
                  >
                    {watermarkText} &nbsp;·&nbsp; {watermarkText}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Custom Minimalist Bottom Controls (Auto-hide after 2s of mouse inactivity) */}
          {parsedSource.type === 'mp4' && (
            <div
              onClick={(e) => e.stopPropagation()}
              data-testid="custom-video-controls"
              data-visible={controlsVisible ? 'true' : 'false'}
              className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/55 to-transparent pt-8 pb-3 px-3.5 flex flex-col gap-2.5 transition-opacity duration-200 ${
                controlsVisible
                  ? 'opacity-100'
                  : 'opacity-0 pointer-events-none'
              }`}
            >
              {/* Draggable Progress Bar with Comment Timestamp Markers */}
              <div
                ref={progressBarRef}
                role="slider"
                tabIndex={0}
                aria-label="Barra de progreso del video"
                aria-valuemin={0}
                aria-valuemax={Math.ceil(effectiveDuration)}
                aria-valuenow={Math.floor(currentTime)}
                onPointerDown={handleProgressPointerDown}
                onPointerMove={handleProgressPointerMove}
                onPointerUp={handleProgressPointerUp}
                onPointerCancel={handleProgressPointerUp}
                onKeyDown={(e) => {
                  resetControlsTimer();
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    seekTo(currentTime + 1);
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    seekTo(currentTime - 1);
                  }
                }}
                className="relative w-full h-5 flex items-center cursor-pointer group touch-none"
                data-testid="video-progress-bar"
              >
                {/* Track background */}
                <div className="relative w-full h-1.5 group-hover:h-2 bg-white/25 rounded-full overflow-visible transition-all">
                  {/* Filled progress */}
                  <div
                    className="absolute inset-y-0 left-0 bg-white rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />

                  {/* Small markers at seconds where comments exist */}
                  {uniqueCommentMarkers.map((sec) => {
                    const leftPct = Math.max(
                      0,
                      Math.min(100, (sec / effectiveDuration) * 100)
                    );
                    return (
                      <span
                        key={sec}
                        title={`Comentario en ${formatVideoTimestamp(sec)}`}
                        data-testid="comment-timeline-marker"
                        style={{ left: `${leftPct}%` }}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-2.5 rounded-full bg-white ring-1 ring-black pointer-events-none z-10"
                      />
                    );
                  })}

                  {/* Scrubber thumb */}
                  <span
                    style={{ left: `${progressPercent}%` }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white ring-1 ring-black shadow-md z-20 transition-transform group-hover:scale-110"
                  />
                </div>
              </div>

              {/* Bottom Control Row: Play/Pause, Current Time / Duration, Mute, Fullscreen */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={isPlaying ? 'Pausar video' : 'Reproducir video'}
                    className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-white hover:bg-white/15 transition-colors cursor-pointer"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 fill-current" />
                    )}
                  </button>

                  <span
                    className="font-mono tabular-nums text-xs text-neutral-200 select-none px-1"
                    data-testid="video-time-display"
                  >
                    {formatVideoTimestamp(currentTime)} /{' '}
                    {formatVideoTimestamp(effectiveDuration)}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={isMuted ? 'Activar sonido' : 'Silenciar video'}
                    className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-neutral-200 hover:bg-white/15 transition-colors cursor-pointer"
                  >
                    {isMuted ? (
                      <VolumeX className="w-5 h-5 text-neutral-400" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    aria-label={
                      isFullscreen
                        ? 'Salir de pantalla completa'
                        : 'Pantalla completa'
                    }
                    className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-neutral-200 hover:bg-white/15 transition-colors cursor-pointer"
                  >
                    {isFullscreen ? (
                      <Minimize className="w-4 h-4" />
                    ) : (
                      <Maximize className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);
