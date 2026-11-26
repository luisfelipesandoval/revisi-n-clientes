import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  MessageSquarePlus,
  MessageCircle,
  Play,
  Send,
  User,
  Check,
} from 'lucide-react';
import { Project, ProjectStatus, VideoComment } from '../types';
import {
  formatPrice,
  formatVideoTimestamp,
  parseTimestampInput,
  sortCommentsByTime,
  buildWhatsAppApprovalUrl,
  getStatusVisuals,
} from '../utils/video';
import { VideoPlayer, VideoPlayerHandle } from './VideoPlayer';

interface ClientReviewViewProps {
  project: Project;
  comments: VideoComment[];
  onUpdateStatus: (newStatus: ProjectStatus) => Promise<void>;
  onAddComment: (payload: {
    authorName: string;
    text: string;
    videoSecond: number;
  }) => Promise<void>;
}

const CLIENT_NAME_STORAGE_KEY = 'clipreview_client_author_name';

export const ClientReviewView: React.FC<ClientReviewViewProps> = ({
  project,
  comments,
  onUpdateStatus,
  onAddComment,
}) => {
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [liveSecond, setLiveSecond] = useState<number>(0);
  const [capturedSecond, setCapturedSecond] = useState<number | null>(null);
  const [customTimeInput, setCustomTimeInput] = useState<string>('00:00');
  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(false);

  const [savedClientName, setSavedClientName] = useState<string>(() => {
    try {
      return localStorage.getItem(CLIENT_NAME_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [authorNameInput, setAuthorNameInput] = useState<string>(() => {
    try {
      return localStorage.getItem(CLIENT_NAME_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [commentText, setCommentText] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState<boolean>(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const sortedComments = sortCommentsByTime(comments);
  const statusVisual = getStatusVisuals(project.status);

  const handleCaptureMoment = () => {
    const sec = playerRef.current ? playerRef.current.getCurrentSecond() : liveSecond;
    playerRef.current?.pause();
    setCapturedSecond(sec);
    setCustomTimeInput(formatVideoTimestamp(sec));
    setIsComposerOpen(true);
    setFormError(null);

    window.setTimeout(() => {
      if (!savedClientName.trim()) {
        nameInputRef.current?.focus();
      } else {
        commentInputRef.current?.focus();
      }
    }, 50);
  };

  const handleSeekToComment = (seconds: number) => {
    playerRef.current?.seekToSecond(seconds);
  };

  const handleStatusChange = async (newStatus: ProjectStatus) => {
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    setStatusFeedback(null);
    try {
      await onUpdateStatus(newStatus);
      setStatusFeedback(
        newStatus === 'Aprobado'
          ? '¡Video aprobado! Ahora puedes contactar para coordinar el pago y la entrega.'
          : 'Estado actualizado a "Cambios solicitados".'
      );
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el estado del proyecto.'
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = (savedClientName && !isEditingName ? savedClientName : authorNameInput).trim();
    const trimmedText = commentText.trim();

    if (!trimmedName) {
      setFormError('Por favor, escribe tu nombre para registrar el comentario.');
      nameInputRef.current?.focus();
      return;
    }
    if (trimmedName.length > 80) {
      setFormError('El nombre no puede superar los 80 caracteres.');
      return;
    }
    if (!trimmedText) {
      setFormError('Escribe el detalle del cambio o comentario en este segundo.');
      commentInputRef.current?.focus();
      return;
    }
    if (trimmedText.length > 1000) {
      setFormError('El comentario no puede superar los 1000 caracteres.');
      return;
    }

    const parsedSec =
      parseTimestampInput(customTimeInput) ??
      capturedSecond ??
      (playerRef.current ? playerRef.current.getCurrentSecond() : liveSecond);

    setIsSubmittingComment(true);
    try {
      await onAddComment({
        authorName: trimmedName,
        text: trimmedText,
        videoSecond: parsedSec,
      });

      try {
        localStorage.setItem(CLIENT_NAME_STORAGE_KEY, trimmedName);
      } catch {
        // Ignore storage error
      }
      setSavedClientName(trimmedName);
      setAuthorNameInput(trimmedName);
      setIsEditingName(false);
      setCommentText('');
      setIsComposerOpen(false);
      setCapturedSecond(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo guardar el comentario.'
      );
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const whatsappUrl = buildWhatsAppApprovalUrl({
    whatsappNumber: project.whatsappNumber,
    projectTitle: project.title,
    clientName: savedClientName || project.clientName,
    price: project.price,
    currency: project.currency,
    showPrice: project.showPrice,
  });

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Top Project Header Card */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Cliente: {project.clientName}</span>
              {project.showPrice && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className="font-mono tabular-nums text-slate-100 font-semibold text-sm"
                    data-testid="project-price"
                  >
                    {formatPrice(project.price, project.currency)}
                  </span>
                </>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight break-words">
              {project.title}
            </h1>
          </div>

          {/* Status Indicator & Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {/* Color-coded status tag required by brief */}
            <div
              className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold ${statusVisual.bgColor} ${statusVisual.borderColor} ${statusVisual.textColor}`}
              data-testid="project-status-badge"
            >
              {project.status === 'Aprobado' && (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              {project.status === 'Cambios solicitados' && (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              {project.status === 'En revisión' && (
                <Clock className="w-4 h-4 shrink-0" />
              )}
              <span>Estado: {project.status}</span>
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-2.5">
              <button
                type="button"
                disabled={isUpdatingStatus}
                onClick={() => handleStatusChange('Aprobado')}
                className={`min-h-[44px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  project.status === 'Aprobado'
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                    : 'bg-emerald-600/90 hover:bg-emerald-500 text-white'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Aprobar</span>
              </button>

              <button
                type="button"
                disabled={isUpdatingStatus}
                onClick={() => handleStatusChange('Cambios solicitados')}
                className={`min-h-[44px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  project.status === 'Cambios solicitados'
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                    : 'bg-slate-800 hover:bg-rose-950/80 text-slate-200 hover:text-rose-200 border border-slate-700 hover:border-rose-500/40'
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Solicitar cambios</span>
              </button>
            </div>
          </div>
        </div>

        {statusFeedback && (
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-emerald-300">
            <span>{statusFeedback}</span>
          </div>
        )}

        {/* WhatsApp CTA when status is Approved */}
        {project.status === 'Aprobado' && (
          <div className="mt-4 pt-4 border-t border-emerald-500/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-emerald-950/30 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 p-4 sm:px-6 rounded-b-2xl">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-emerald-200">
                Proyecto aprobado para entrega final
              </p>
              <p className="text-xs text-emerald-300/80">
                Coordina el pago o la descarga del archivo original sin marca de agua por WhatsApp.
              </p>
            </div>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="whatsapp-contact-btn"
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 shadow-lg shadow-emerald-500/10"
            >
              <MessageCircle className="w-4 h-4 fill-current" />
              <span>Contactar para el pago / entrega</span>
            </a>
          </div>
        )}
      </section>

      {/* Main 2-Column Layout: Video Left/Center (7 cols) + Time-coded Comments Right/Bottom (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Top Column: Centered Vertical Video Player */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800/90 rounded-2xl p-4 sm:p-6 flex flex-col items-center">
          <VideoPlayer
            ref={playerRef}
            videoUrl={project.videoUrl}
            watermarkEnabled={project.watermarkEnabled}
            watermarkText={project.watermarkText}
            onTimeUpdate={(sec) => setLiveSecond(sec)}
          />

          {/* Primary Quick-Action underneath the player for mobile & desktop thumb reach */}
          <div className="w-full max-w-[380px] mt-4">
            <button
              type="button"
              data-testid="capture-moment-btn"
              onClick={handleCaptureMoment}
              className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2.5 shadow-lg shadow-sky-500/15 transition-all cursor-pointer active:scale-[0.99]"
            >
              <MessageSquarePlus className="w-5 h-5 shrink-0" />
              <span>Comentar en este momento</span>
              <span className="font-mono tabular-nums bg-slate-950/20 px-2 py-0.5 rounded-md text-xs font-bold">
                {formatVideoTimestamp(liveSecond)}
              </span>
            </button>
          </div>
        </div>

        {/* Right/Bottom Column: Comments Panel */}
        <aside className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-white">
                Comentarios en el video
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Toca cualquier comentario para saltar a ese segundo exacto
              </p>
            </div>
            <span className="font-mono tabular-nums text-xs text-slate-400">
              {sortedComments.length}{' '}
              {sortedComments.length === 1 ? 'nota' : 'notas'}
            </span>
          </div>

          {/* Button inside comments panel to trigger or toggle moment composer */}
          {!isComposerOpen ? (
            <button
              type="button"
              onClick={handleCaptureMoment}
              className="mt-4 w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-100 text-xs sm:text-sm font-medium inline-flex items-center justify-between gap-2 transition-colors cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4 text-sky-400" />
                <span>Agregar nota en el segundo actual</span>
              </span>
              <span className="font-mono tabular-nums text-sky-300 font-semibold">
                {formatVideoTimestamp(liveSecond)}
              </span>
            </button>
          ) : (
            <form
              onSubmit={handleCommentSubmit}
              className="mt-4 bg-slate-950/90 border border-sky-500/40 rounded-xl p-4 space-y-3"
              data-testid="comment-composer-form"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sky-300">
                  Nuevo comentario en segundo exacto
                </span>
                <div className="flex items-center gap-1.5">
                  <label htmlFor="comment-timestamp-input" className="sr-only">
                    Segundo del video (MM:SS)
                  </label>
                  <input
                    id="comment-timestamp-input"
                    type="text"
                    value={customTimeInput}
                    onChange={(e) => setCustomTimeInput(e.target.value)}
                    className="w-20 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono tabular-nums text-xs text-center text-sky-300 focus:outline-none focus:border-sky-400"
                    placeholder="00:19"
                  />
                </div>
              </div>

              {/* Ask for client name the first time, or show remembered name with edit link */}
              {!savedClientName || isEditingName ? (
                <div>
                  <label
                    htmlFor="client-author-name"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Tu nombre
                  </label>
                  <input
                    ref={nameInputRef}
                    id="client-author-name"
                    type="text"
                    maxLength={80}
                    value={authorNameInput}
                    onChange={(e) => setAuthorNameInput(e.target.value)}
                    placeholder="Ej. Valeria Mendoza"
                    className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/70 px-3 py-2 rounded-lg">
                  <span className="inline-flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      Comentando como <strong className="text-slate-200">{savedClientName}</strong>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthorNameInput(savedClientName);
                      setIsEditingName(true);
                    }}
                    className="text-sky-400 hover:underline font-medium"
                  >
                    Cambiar nombre
                  </button>
                </div>
              )}

              <div>
                <label
                  htmlFor="client-comment-text"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  ¿Qué cambio o detalle necesitas en este momento?
                </label>
                <textarea
                  ref={commentInputRef}
                  id="client-comment-text"
                  rows={3}
                  maxLength={1000}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Ej. Cambiar este texto por la oferta del 2x1..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 resize-none"
                />
              </div>

              {formError && (
                <p className="text-xs text-rose-400" role="alert">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsComposerOpen(false);
                    setFormError(null);
                  }}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingComment}
                  className="min-h-[40px] px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isSubmittingComment ? 'Guardando...' : 'Guardar comentario'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* Time-ordered list of comments */}
          <div className="mt-4 divide-y divide-slate-800/80 max-h-[520px] overflow-y-auto pr-1">
            {sortedComments.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-sm font-medium text-slate-300">
                  Aún no hay comentarios en este video
                </p>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Reproduce el video y presiona &ldquo;Comentar en este momento&rdquo; para dejar una nota en el segundo exacto.
                </p>
              </div>
            ) : (
              sortedComments.map((comment) => (
                <button
                  key={comment.id}
                  type="button"
                  onClick={() => handleSeekToComment(comment.videoSecond)}
                  className={`w-full text-left py-3.5 px-3 first:mt-0 rounded-xl transition-colors flex items-start gap-3 group cursor-pointer ${
                    comment.resolved
                      ? 'opacity-60 hover:opacity-80 bg-transparent'
                      : 'hover:bg-slate-800/60'
                  }`}
                >
                  {/* Timestamp Trigger */}
                  <span
                    className={`mt-0.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono tabular-nums text-xs font-semibold shrink-0 transition-colors ${
                      comment.resolved
                        ? 'bg-slate-800/70 text-slate-500 line-through'
                        : 'bg-sky-500/15 text-sky-300 group-hover:bg-sky-500 group-hover:text-slate-950'
                    }`}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    {formatVideoTimestamp(comment.videoSecond)}
                  </span>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-semibold truncate ${
                          comment.resolved ? 'text-slate-500' : 'text-slate-200'
                        }`}
                      >
                        {comment.authorName}
                      </span>
                      {comment.resolved && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400/80 shrink-0">
                          <Check className="w-3 h-3" />
                          <span>Resuelto</span>
                        </span>
                      )}
                    </div>

                    <p
                      className={`text-sm leading-relaxed break-words ${
                        comment.resolved
                          ? 'line-through text-slate-500'
                          : 'text-slate-300'
                      }`}
                    >
                      {comment.text}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
