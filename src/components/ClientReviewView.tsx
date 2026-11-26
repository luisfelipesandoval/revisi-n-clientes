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
import { formatReadableFirestoreError } from '../firebase';
import { VideoPlayer, VideoPlayerHandle } from './VideoPlayer';

interface ClientReviewViewProps {
  project: Project;
  comments: VideoComment[];
  firestoreError?: string | null;
  onUpdateStatus: (newStatus: ProjectStatus) => Promise<void>;
  onAddComment: (payload: {
    authorName: string;
    text: string;
    videoSecond: number;
  }) => Promise<void>;
}

export const ClientReviewView: React.FC<ClientReviewViewProps> = ({
  project,
  comments,
  firestoreError,
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

  const [savedClientName, setSavedClientName] = useState<string>('');
  const [authorNameInput, setAuthorNameInput] = useState<string>('');
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
    setFormError(null);
    try {
      await onUpdateStatus(newStatus);
      setStatusFeedback(
        newStatus === 'Aprobado'
          ? 'Video aprobado. Ahora puedes contactar para coordinar el pago y la entrega.'
          : 'Estado actualizado a "Cambios solicitados".'
      );
    } catch (err) {
      setFormError(formatReadableFirestoreError(err));
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

      setSavedClientName(trimmedName);
      setAuthorNameInput(trimmedName);
      setIsEditingName(false);
      setCommentText('');
      setIsComposerOpen(false);
      setCapturedSecond(null);
    } catch (err) {
      setFormError(formatReadableFirestoreError(err));
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
      {firestoreError && (
        <div
          className="mb-6 bg-[#111111] border border-white rounded-xl p-4 text-xs text-white flex items-start gap-2.5"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{firestoreError}</span>
        </div>
      )}

      {/* Top Project Header Card */}
      <section className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-4 sm:p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              <span>Cliente: {project.clientName}</span>
              {project.showPrice && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className="font-mono tabular-nums text-white font-semibold text-sm"
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

          {/* Status Indicator (Monochrome: dotted, solid, or inverted white) & Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div
              className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs ${statusVisual.badgeClass}`}
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
              {/* Primary action: White background with black text */}
              <button
                type="button"
                disabled={isUpdatingStatus}
                onClick={() => handleStatusChange('Aprobado')}
                className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer bg-white text-black hover:bg-neutral-200"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Aprobar</span>
              </button>

              {/* Secondary action: Transparent with white border */}
              <button
                type="button"
                disabled={isUpdatingStatus}
                onClick={() => handleStatusChange('Cambios solicitados')}
                className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer bg-transparent text-white border border-white hover:bg-white/10"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Solicitar cambios</span>
              </button>
            </div>
          </div>
        </div>

        {statusFeedback && (
          <div className="mt-4 pt-3 border-t border-[#2A2A2A] flex items-center justify-between text-xs text-neutral-300">
            <span>{statusFeedback}</span>
          </div>
        )}

        {/* WhatsApp CTA when status is Approved */}
        {project.status === 'Aprobado' && (
          <div className="mt-4 pt-4 border-t border-[#2A2A2A] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#0A0A0A] -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 p-4 sm:px-6 rounded-b-2xl">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-white">
                Proyecto aprobado para entrega final
              </p>
              <p className="text-xs text-neutral-400">
                Coordina el pago o la descarga del archivo original sin marca de agua por WhatsApp.
              </p>
            </div>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="whatsapp-contact-btn"
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
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
        <div className="lg:col-span-7 bg-[#111111] border border-[#2A2A2A] rounded-2xl p-4 sm:p-6 flex flex-col items-center">
          <VideoPlayer
            ref={playerRef}
            videoUrl={project.videoUrl}
            watermarkEnabled={project.watermarkEnabled}
            watermarkText={project.watermarkText}
            commentSeconds={sortedComments.map((c) => c.videoSecond)}
            onTimeUpdate={(sec) => setLiveSecond(sec)}
          />

          {/* Primary Quick-Action underneath the player */}
          <div className="w-full max-w-[380px] mt-4">
            <button
              type="button"
              data-testid="capture-moment-btn"
              onClick={handleCaptureMoment}
              className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-sm inline-flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-[0.99]"
            >
              <MessageSquarePlus className="w-5 h-5 shrink-0" />
              <span>Comentar en este momento</span>
              <span className="font-mono tabular-nums bg-black/15 px-2 py-0.5 rounded-md text-xs font-bold">
                {formatVideoTimestamp(liveSecond)}
              </span>
            </button>
          </div>
        </div>

        {/* Right/Bottom Column: Comments Panel */}
        <aside className="lg:col-span-5 bg-[#111111] border border-[#2A2A2A] rounded-2xl p-4 sm:p-6 flex flex-col">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-[#2A2A2A]">
            <div>
              <h2 className="text-base font-semibold text-white">
                Comentarios en el video
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Toca cualquier comentario para saltar a ese segundo exacto
              </p>
            </div>
            <span className="font-mono tabular-nums text-xs text-neutral-400">
              {sortedComments.length}{' '}
              {sortedComments.length === 1 ? 'nota' : 'notas'}
            </span>
          </div>

          {/* Button inside comments panel to trigger or toggle moment composer */}
          {!isComposerOpen ? (
            <button
              type="button"
              onClick={handleCaptureMoment}
              className="mt-4 w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-transparent hover:bg-white/10 border border-white text-white text-xs sm:text-sm font-medium inline-flex items-center justify-between gap-2 transition-colors cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4 text-white" />
                <span>Agregar nota en el segundo actual</span>
              </span>
              <span className="font-mono tabular-nums text-white font-semibold">
                {formatVideoTimestamp(liveSecond)}
              </span>
            </button>
          ) : (
            <form
              onSubmit={handleCommentSubmit}
              className="mt-4 bg-[#0A0A0A] border border-white rounded-xl p-4 space-y-3"
              data-testid="comment-composer-form"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">
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
                    className="w-20 px-2 py-1 rounded-lg bg-[#111111] border border-[#2A2A2A] font-mono tabular-nums text-xs text-center text-white focus:outline-none focus:border-white"
                    placeholder="00:19"
                  />
                </div>
              </div>

              {!savedClientName || isEditingName ? (
                <div>
                  <label
                    htmlFor="client-author-name"
                    className="block text-xs font-medium text-neutral-300 mb-1"
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
                    className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-[#111111] border border-[#2A2A2A] text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-neutral-400 bg-[#111111] border border-[#2A2A2A] px-3 py-2 rounded-lg">
                  <span className="inline-flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-neutral-400" />
                    <span>
                      Comentando como <strong className="text-white">{savedClientName}</strong>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthorNameInput(savedClientName);
                      setIsEditingName(true);
                    }}
                    className="text-white underline font-medium cursor-pointer"
                  >
                    Cambiar nombre
                  </button>
                </div>
              )}

              <div>
                <label
                  htmlFor="client-comment-text"
                  className="block text-xs font-medium text-neutral-300 mb-1"
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
                  placeholder="Ej. Cambiar este texto por la oferta..."
                  className="w-full px-3 py-2 rounded-lg bg-[#111111] border border-[#2A2A2A] text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white resize-none"
                />
              </div>

              {formError && (
                <p className="text-xs text-white bg-[#111111] border border-white rounded-lg p-2.5" role="alert">
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
                  className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-transparent border border-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingComment}
                  className="min-h-[40px] px-4 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isSubmittingComment ? 'Guardando...' : 'Guardar comentario'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {formError && !isComposerOpen && (
            <div className="mt-3 p-3 rounded-xl bg-[#0A0A0A] border border-white text-xs text-white" role="alert">
              {formError}
            </div>
          )}

          {/* Time-ordered list of comments */}
          <div className="mt-4 divide-y divide-[#2A2A2A] max-h-[520px] overflow-y-auto pr-1">
            {sortedComments.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-sm font-medium text-neutral-300">
                  Aún no hay comentarios en este video
                </p>
                <p className="text-xs text-neutral-500 max-w-xs mx-auto">
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
                      ? 'opacity-50 hover:opacity-75 bg-transparent'
                      : 'hover:bg-white/5'
                  }`}
                >
                  {/* Timestamp Trigger */}
                  <span
                    className={`mt-0.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono tabular-nums text-xs font-semibold shrink-0 transition-colors ${
                      comment.resolved
                        ? 'bg-[#0A0A0A] border border-[#2A2A2A] text-neutral-500 line-through'
                        : 'bg-white text-black group-hover:bg-neutral-200'
                    }`}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    {formatVideoTimestamp(comment.videoSecond)}
                  </span>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-semibold truncate ${
                          comment.resolved ? 'text-neutral-500' : 'text-white'
                        }`}
                      >
                        {comment.authorName}
                      </span>
                      {comment.resolved && (
                        <span className="inline-flex items-center gap-1 text-xs text-neutral-400 shrink-0">
                          <Check className="w-3 h-3" />
                          <span>Resuelto</span>
                        </span>
                      )}
                    </div>

                    <p
                      className={`text-sm leading-relaxed break-words ${
                        comment.resolved
                          ? 'line-through text-neutral-500'
                          : 'text-neutral-200'
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
