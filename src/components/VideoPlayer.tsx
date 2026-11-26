import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Smartphone,
  Monitor,
  AlertCircle,
} from 'lucide-react';
import { parseVideoUrl, formatVideoTimestamp } from '../utils/video';

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
            onError?: () => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerInstance {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  destroy: () => void;
}

export interface VideoPlayerHandle {
  getCurrentSecond: () => number;
  seekToSecond: (seconds: number) => void;
  pause: () => void;
}

interface VideoPlayerProps {
  videoUrl: string;
  watermarkEnabled: boolean;
  watermarkText: string;
  onTimeUpdate?: (seconds: number) => void;
}

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve) => {
    const existingCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (existingCallback) existingCallback();
      resolve();
    };
    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
  });

  return ytApiPromise;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ videoUrl, watermarkEnabled, watermarkText, onTimeUpdate }, ref) => {
    const parsedSource = parseVideoUrl(videoUrl);
    const html5VideoRef = useRef<HTMLVideoElement | null>(null);
    const ytContainerRef = useRef<HTMLDivElement | null>(null);
    const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
    const onTimeUpdateRef = useRef(onTimeUpdate);
    onTimeUpdateRef.current = onTimeUpdate;

    const [currentTime, setCurrentTime] = useState<number>(0);
    const [duration, setDuration] = useState<number>(15);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isMuted, setIsMuted] = useState<boolean>(false);
    const [isVerticalFrame, setIsVerticalFrame] = useState<boolean>(true);
    const [mediaError, setMediaError] = useState<string | null>(null);
    const [useFallbackReel, setUseFallbackReel] = useState<boolean>(false);

    // Timer loop when fallback reel is playing
    useEffect(() => {
      if (!useFallbackReel || !isPlaying) return;
      const timer = window.setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + 0.25;
          const maxDur = duration > 0 ? duration : 15;
          const wrapped = next >= maxDur ? 0 : next;
          if (onTimeUpdateRef.current) {
            onTimeUpdateRef.current(Math.floor(wrapped));
          }
          return wrapped;
        });
      }, 250);
      return () => window.clearInterval(timer);
    }, [useFallbackReel, isPlaying, duration]);

    useImperativeHandle(ref, () => ({
      getCurrentSecond: () => {
        if (parsedSource.type === 'mp4' && html5VideoRef.current && !useFallbackReel) {
          return Math.floor(html5VideoRef.current.currentTime || currentTime || 0);
        }
        if (parsedSource.type === 'youtube' && ytPlayerRef.current) {
          try {
            return Math.floor(ytPlayerRef.current.getCurrentTime() || 0);
          } catch {
            return Math.floor(currentTime);
          }
        }
        return Math.floor(currentTime);
      },
      seekToSecond: (seconds: number) => {
        const target = Math.max(0, seconds);
        setCurrentTime(target);
        if (onTimeUpdateRef.current) {
          onTimeUpdateRef.current(target);
        }
        if (parsedSource.type === 'mp4') {
          if (html5VideoRef.current && !useFallbackReel) {
            html5VideoRef.current.currentTime = target;
            html5VideoRef.current.play().catch(() => {
              // Autoplay might require user gesture
            });
          }
          setIsPlaying(true);
        } else if (parsedSource.type === 'youtube' && ytPlayerRef.current) {
          try {
            ytPlayerRef.current.seekTo(target, true);
            ytPlayerRef.current.playVideo();
            setIsPlaying(true);
          } catch {
            // Player might still be initializing
          }
        }
      },
      pause: () => {
        if (parsedSource.type === 'mp4') {
          if (html5VideoRef.current && !useFallbackReel) {
            html5VideoRef.current.pause();
          }
          setIsPlaying(false);
        } else if (parsedSource.type === 'youtube' && ytPlayerRef.current) {
          try {
            ytPlayerRef.current.pauseVideo();
            setIsPlaying(false);
          } catch {
            // Ignore
          }
        }
      },
    }));

    // Set up YouTube IFrame Player API when source is YouTube
    useEffect(() => {
      setMediaError(null);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);

      if (parsedSource.type !== 'youtube') {
        if (ytPlayerRef.current) {
          try {
            ytPlayerRef.current.destroy();
          } catch {
            // Ignore
          }
          ytPlayerRef.current = null;
        }
        return;
      }

      let isCancelled = false;
      let pollTimer: number | null = null;

      loadYouTubeIframeApi().then(() => {
        if (isCancelled || !ytContainerRef.current || !window.YT) return;

        if (ytPlayerRef.current) {
          try {
            ytPlayerRef.current.destroy();
          } catch {
            // Ignore
          }
        }

        // Create fresh child node for YT.Player to replace
        ytContainerRef.current.innerHTML = '';
        const mountEl = document.createElement('div');
        ytContainerRef.current.appendChild(mountEl);

        const player = new window.YT.Player(mountEl, {
          videoId: parsedSource.videoId,
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            controls: 1,
          },
          events: {
            onReady: (event) => {
              if (isCancelled) return;
              try {
                const dur = event.target.getDuration();
                if (dur > 0) setDuration(dur);
              } catch {
                // Ignore
              }
            },
            onStateChange: (event) => {
              if (isCancelled) return;
              const playingState = window.YT?.PlayerState?.PLAYING ?? 1;
              setIsPlaying(event.data === playingState);
              try {
                const t = event.target.getCurrentTime();
                setCurrentTime(t);
                if (onTimeUpdateRef.current) {
                  onTimeUpdateRef.current(Math.floor(t));
                }
                const d = event.target.getDuration();
                if (d > 0) setDuration(d);
              } catch {
                // Ignore
              }
            },
            onError: () => {
              if (!isCancelled) {
                setMediaError(
                  'No se pudo cargar este video de YouTube. Verifica que el enlace sea público o no listado.'
                );
              }
            },
          },
        });

        ytPlayerRef.current = player;

        pollTimer = window.setInterval(() => {
          if (!ytPlayerRef.current) return;
          try {
            const t = ytPlayerRef.current.getCurrentTime();
            if (typeof t === 'number' && Number.isFinite(t)) {
              setCurrentTime(t);
              if (onTimeUpdateRef.current) {
                onTimeUpdateRef.current(Math.floor(t));
              }
            }
            const d = ytPlayerRef.current.getDuration();
            if (typeof d === 'number' && d > 0) {
              setDuration(d);
            }
          } catch {
            // Player not ready yet
          }
        }, 300);
      });

      return () => {
        isCancelled = true;
        if (pollTimer !== null) {
          window.clearInterval(pollTimer);
        }
        if (ytPlayerRef.current) {
          try {
            ytPlayerRef.current.destroy();
          } catch {
            // Ignore
          }
          ytPlayerRef.current = null;
        }
      };
    }, [parsedSource.type, parsedSource.type === 'youtube' ? parsedSource.videoId : '']);

    const togglePlayMp4 = () => {
      if (useFallbackReel) {
        setIsPlaying((prev) => !prev);
        return;
      }
      const video = html5VideoRef.current;
      if (!video) return;
      if (video.paused) {
        video.play().catch(() => {
          setUseFallbackReel(true);
          setIsPlaying(true);
        });
      } else {
        video.pause();
      }
    };

    const toggleMuteMp4 = () => {
      if (useFallbackReel) {
        setIsMuted((prev) => !prev);
        return;
      }
      const video = html5VideoRef.current;
      if (!video) return;
      video.muted = !video.muted;
      setIsMuted(video.muted);
    };

    const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextSec = Number(e.target.value);
      setCurrentTime(nextSec);
      if (onTimeUpdateRef.current) {
        onTimeUpdateRef.current(Math.floor(nextSec));
      }
      if (parsedSource.type === 'mp4' && html5VideoRef.current && !useFallbackReel) {
        html5VideoRef.current.currentTime = nextSec;
      } else if (parsedSource.type === 'youtube' && ytPlayerRef.current) {
        try {
          ytPlayerRef.current.seekTo(nextSec, true);
        } catch {
          // Ignore
        }
      }
    };

    return (
      <div className="w-full flex flex-col items-center">
        {/* Aspect Ratio Switch Bar for Vertical (9:16) vs Horizontal (16:9) */}
        <div className="w-full max-w-[380px] flex items-center justify-between mb-2.5 px-1">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-mono tabular-nums text-slate-200 font-medium">
              {formatVideoTimestamp(currentTime)}
            </span>
            <span aria-hidden="true">/</span>
            <span className="font-mono tabular-nums">
              {duration > 0 ? formatVideoTimestamp(duration) : '00:15'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsVerticalFrame((prev) => !prev)}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Cambiar proporción del marco de vista previa"
          >
            {isVerticalFrame ? (
              <>
                <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                <span>Vertical 9:16</span>
              </>
            ) : (
              <>
                <Monitor className="w-3.5 h-3.5 text-sky-400" />
                <span>Horizontal 16:9</span>
              </>
            )}
          </button>
        </div>

        {/* Main Video Stage */}
        <div
          className={`relative w-full overflow-hidden rounded-2xl bg-slate-950 border border-slate-800/90 shadow-2xl transition-all ${
            isVerticalFrame
              ? 'max-w-[360px] sm:max-w-[380px] aspect-[9/16]'
              : 'max-w-3xl aspect-video'
          }`}
          data-testid="video-stage"
        >
          {parsedSource.type === 'invalid' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90">
              <AlertCircle className="w-8 h-8 text-rose-400 mb-3" />
              <p className="text-sm font-medium text-slate-200 mb-1">
                Enlace de video no válido
              </p>
              <p className="text-xs text-slate-400">{parsedSource.reason}</p>
            </div>
          )}

          {parsedSource.type === 'mp4' && !useFallbackReel && (
            <video
              ref={html5VideoRef}
              src={parsedSource.src}
              className="w-full h-full object-contain bg-black cursor-pointer"
              playsInline
              preload="metadata"
              onClick={togglePlayMp4}
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                setCurrentTime(t);
                if (onTimeUpdateRef.current) {
                  onTimeUpdateRef.current(Math.floor(t));
                }
              }}
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration || 15);
                setMediaError(null);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={() => {
                setUseFallbackReel(true);
                setDuration(15);
                setMediaError(null);
              }}
            />
          )}

          {parsedSource.type === 'mp4' && useFallbackReel && (
            <div
              onClick={togglePlayMp4}
              className="w-full h-full cursor-pointer select-none relative flex flex-col justify-between p-6 bg-gradient-to-br from-slate-900 via-sky-950/70 to-slate-950"
            >
              <div className="flex items-center justify-between text-xs text-slate-300/80 font-mono tabular-nums">
                <span>REEL 9:16 · HD</span>
                <span>{formatVideoTimestamp(currentTime)}</span>
              </div>

              <div className="my-auto text-center space-y-3 px-2">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300 shadow-inner">
                  {isPlaying ? (
                    <Pause className="w-7 h-7" />
                  ) : (
                    <Play className="w-7 h-7 fill-current ml-0.5" />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-mono uppercase tracking-wider text-sky-300/90">
                    Fotograma {formatVideoTimestamp(currentTime)}
                  </p>
                  <p className="text-base font-bold text-white leading-snug">
                    {currentTime < 5
                      ? 'Escena 01 · Apertura & Logo en Movimiento'
                      : currentTime < 10
                      ? 'Escena 02 · Detalle de Producto & Oferta 20%'
                      : 'Escena 03 · Cierre & Llamado a la Acción'}
                  </p>
                </div>
              </div>

              <div className="h-12" />
            </div>
          )}

          {parsedSource.type === 'youtube' && (
            <div
              ref={ytContainerRef}
              className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full"
            />
          )}

          {/* Optional Semi-Transparent Watermark Overlay */}
          {watermarkEnabled && watermarkText.trim().length > 0 && (
            <div
              className="pointer-events-none select-none absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden p-4"
              aria-label={`Marca de agua: ${watermarkText}`}
              data-testid="video-watermark"
            >
              <div className="-rotate-24 flex flex-col items-center gap-12 opacity-30">
                <span className="text-lg sm:text-xl font-bold tracking-widest uppercase text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] whitespace-nowrap">
                  {watermarkText}
                </span>
                <span className="text-xl sm:text-2xl font-bold tracking-widest uppercase text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] whitespace-nowrap">
                  {watermarkText}
                </span>
                <span className="text-lg sm:text-xl font-bold tracking-widest uppercase text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] whitespace-nowrap">
                  {watermarkText}
                </span>
              </div>
            </div>
          )}

          {/* Error banner if media failed */}
          {mediaError && (
            <div className="absolute inset-x-3 top-3 z-30 bg-rose-950/90 border border-rose-500/40 rounded-xl p-3 text-xs text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{mediaError}</span>
            </div>
          )}

          {/* Custom bottom bar for direct MP4 videos */}
          {parsedSource.type === 'mp4' && (
            <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-8 pb-3 px-3 flex flex-col gap-2">
              <input
                type="range"
                min={0}
                max={duration > 0 ? Math.ceil(duration) : 15}
                step={0.1}
                value={currentTime}
                onChange={handleScrub}
                aria-label="Línea de tiempo del video"
                className="w-full accent-sky-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={togglePlayMp4}
                    aria-label={isPlaying ? 'Pausar video' : 'Reproducir video'}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-white hover:bg-white/10 transition-colors"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 fill-current" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={toggleMuteMp4}
                    aria-label={isMuted ? 'Activar sonido' : 'Silenciar video'}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-200 hover:bg-white/10 transition-colors"
                  >
                    {isMuted ? (
                      <VolumeX className="w-5 h-5 text-rose-400" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
                </div>

                <span className="font-mono tabular-nums text-xs text-slate-200 px-2">
                  {formatVideoTimestamp(currentTime)} /{' '}
                  {formatVideoTimestamp(duration || 15)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Helpful timeline scrubber bar for YouTube or quick second testing */}
        {parsedSource.type === 'youtube' && (
          <div className="w-full max-w-[380px] mt-3 bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 flex items-center gap-3">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              Saltar a segundo:
            </span>
            <input
              type="range"
              min={0}
              max={duration > 0 ? Math.ceil(duration) : 60}
              step={1}
              value={Math.floor(currentTime)}
              onChange={handleScrub}
              aria-label="Saltar a segundo en YouTube"
              className="w-full accent-sky-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
            />
            <span className="font-mono tabular-nums text-xs text-sky-300 font-medium whitespace-nowrap">
              {formatVideoTimestamp(currentTime)}
            </span>
          </div>
        )}
      </div>
    );
  }
);
