import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Circle,
  Lock,
  Unlock,
  LogOut,
  Save,
  Film,
  Eye,
  EyeOff,
  ShieldAlert,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  Project,
  ProjectFormInput,
  ProjectStatus,
  CurrencyCode,
  VideoComment,
} from '../types';
import {
  formatPrice,
  formatVideoTimestamp,
  sortCommentsByTime,
  getStatusVisuals,
  getAdminDeliveryBadge,
  parseVideoUrl,
} from '../utils/video';
import {
  VALID_STATUSES,
  VALID_CURRENCIES,
  isAuthorizedAdminUser,
} from '../utils/validation';
import { formatReadableFirestoreError } from '../firebase';

interface AdminDashboardViewProps {
  currentUser: FirebaseUser | null;
  authReady: boolean;
  unauthorizedDenied: boolean;
  firestoreError?: string | null;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  projects: Project[];
  selectedProjectId: string | null;
  selectedProjectFinalVideoUrl: string;
  onSelectProject: (projectId: string) => void;
  commentsForSelected: VideoComment[];
  onCreateProject: (input: ProjectFormInput) => Promise<string>;
  onUpdateProject: (projectId: string, input: ProjectFormInput) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onToggleCommentResolved: (commentId: string, currentResolved: boolean) => Promise<void>;
}

const DEFAULT_FORM_INPUT: ProjectFormInput = {
  title: '',
  clientName: '',
  videoUrl: '',
  finalVideoUrl: '',
  descargaHabilitada: false,
  price: 0,
  currency: 'S/',
  showPrice: true,
  watermarkEnabled: true,
  watermarkText: '',
  status: 'En revisión',
  whatsappNumber: '',
};

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  currentUser,
  authReady,
  unauthorizedDenied,
  firestoreError,
  onSignInGoogle,
  onSignOut,
  projects,
  selectedProjectId,
  selectedProjectFinalVideoUrl,
  onSelectProject,
  commentsForSelected,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onToggleCommentResolved,
}) => {
  const isVerifiedAdmin = isAuthorizedAdminUser(currentUser);
  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [formState, setFormState] = useState<ProjectFormInput>(DEFAULT_FORM_INPUT);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Payment confirmation dialog when turning on "Habilitar descarga"
  const [showConfirmPaymentModal, setShowConfirmPaymentModal] = useState<boolean>(false);

  // Track which project ID was last loaded into the form so we don't wipe form/messages on re-renders
  const loadedProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isCreatingNew) {
      if (loadedProjectIdRef.current !== '__new__') {
        loadedProjectIdRef.current = '__new__';
        setFormState(DEFAULT_FORM_INPUT);
        setFormError(null);
        setSaveSuccess(null);
        setShowConfirmPaymentModal(false);
      }
      return;
    }

    if (selectedProject) {
      if (loadedProjectIdRef.current !== selectedProject.id) {
        loadedProjectIdRef.current = selectedProject.id;
        setFormState({
          title: selectedProject.title,
          clientName: selectedProject.clientName,
          videoUrl: selectedProject.videoUrl,
          finalVideoUrl: selectedProjectFinalVideoUrl || '',
          descargaHabilitada: Boolean(selectedProject.descargaHabilitada),
          price: selectedProject.price,
          currency: selectedProject.currency,
          showPrice: selectedProject.showPrice,
          watermarkEnabled: selectedProject.watermarkEnabled,
          watermarkText: selectedProject.watermarkText,
          status: selectedProject.status,
          whatsappNumber: selectedProject.whatsappNumber,
        });
        setConfirmDeleteId(null);
        setShowConfirmPaymentModal(false);
      }
    } else if (loadedProjectIdRef.current !== null) {
      loadedProjectIdRef.current = null;
      setFormState(DEFAULT_FORM_INPUT);
      setShowConfirmPaymentModal(false);
    }
  }, [selectedProject, isCreatingNew, selectedProjectFinalVideoUrl]);

  // Sync finalVideoUrl from entregas/{projectId} listener when it arrives for the selected project
  useEffect(() => {
    if (!isCreatingNew && selectedProject && loadedProjectIdRef.current === selectedProject.id) {
      setFormState((prev) => ({
        ...prev,
        finalVideoUrl: selectedProjectFinalVideoUrl,
      }));
    }
  }, [selectedProjectFinalVideoUrl, isCreatingNew, selectedProject]);

  // Also keep status & descargaHabilitada synced if client approves in real-time
  useEffect(() => {
    if (!isCreatingNew && selectedProject && loadedProjectIdRef.current === selectedProject.id) {
      setFormState((prev) => ({
        ...prev,
        status: selectedProject.status,
        descargaHabilitada: Boolean(selectedProject.descargaHabilitada),
      }));
    }
  }, [selectedProject?.status, selectedProject?.descargaHabilitada, isCreatingNew, selectedProject]);

  const getClientShareUrl = (projectId: string) => {
    return `${window.location.origin}/ver/${encodeURIComponent(projectId)}`;
  };

  const handleCopyClientLink = async (projectId: string) => {
    const url = getClientShareUrl(projectId);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback ignore
    }
    setCopiedId(projectId);
    window.setTimeout(() => setCopiedId(null), 2500);
  };

  const handleToggleDownloadClick = () => {
    if (!formState.descargaHabilitada) {
      // Turning ON requires confirmation: "¿Confirmas que recibiste el pago?"
      setShowConfirmPaymentModal(true);
    } else {
      // Turning OFF locks download immediately
      setFormState((prev) => ({
        ...prev,
        descargaHabilitada: false,
      }));
    }
  };

  const handleConfirmPaymentReceived = () => {
    setFormState((prev) => ({
      ...prev,
      descargaHabilitada: true,
      status: 'Aprobado',
    }));
    setShowConfirmPaymentModal(false);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaveSuccess(null);

    if (!currentUser || !isAuthorizedAdminUser(currentUser)) {
      setFormError('Tu sesión de Google no está activa. Vuelve a iniciar sesión.');
      return;
    }

    const trimmedTitle = formState.title.trim();
    const trimmedClient = formState.clientName.trim();
    const trimmedUrl = formState.videoUrl.trim();
    const trimmedFinalUrl = formState.finalVideoUrl.trim();
    const trimmedWatermark = formState.watermarkText.trim();
    const trimmedWa = formState.whatsappNumber.trim();

    if (!trimmedTitle) {
      setFormError('El título del proyecto es obligatorio.');
      return;
    }
    if (!trimmedClient) {
      setFormError('El nombre del cliente es obligatorio.');
      return;
    }
    const parsedVideo = parseVideoUrl(trimmedUrl);
    if (parsedVideo.type === 'invalid') {
      setFormError(parsedVideo.reason);
      return;
    }
    if (trimmedFinalUrl) {
      const parsedFinal = parseVideoUrl(trimmedFinalUrl);
      if (parsedFinal.type === 'invalid') {
        setFormError(`Enlace del video FINAL: ${parsedFinal.reason}`);
        return;
      }
    }
    if (Number.isNaN(formState.price) || formState.price < 0) {
      setFormError('Ingresa un precio válido mayor o igual a 0.');
      return;
    }

    const cleanInput: ProjectFormInput = {
      title: trimmedTitle,
      clientName: trimmedClient,
      videoUrl: trimmedUrl,
      finalVideoUrl: trimmedFinalUrl,
      descargaHabilitada: Boolean(formState.descargaHabilitada),
      price: Number(formState.price),
      currency: formState.currency,
      showPrice: formState.showPrice,
      watermarkEnabled: formState.watermarkEnabled,
      watermarkText: trimmedWatermark,
      status: formState.status,
      whatsappNumber: trimmedWa,
    };

    setIsSaving(true);
    try {
      if (isCreatingNew || !selectedProject) {
        const newId = await onCreateProject(cleanInput);
        loadedProjectIdRef.current = newId;
        setIsCreatingNew(false);
        onSelectProject(newId);
        setSaveSuccess('Proyecto guardado en Firestore correctamente.');
      } else {
        await onUpdateProject(selectedProject.id, cleanInput);
        setSaveSuccess('Cambios guardados en Firestore correctamente.');
      }
      window.setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err) {
      setFormError(formatReadableFirestoreError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async (projectId: string) => {
    setIsSaving(true);
    setFormError(null);
    try {
      await onDeleteProject(projectId);
      setConfirmDeleteId(null);
      setSaveSuccess('Proyecto eliminado de Firestore.');
    } catch (err) {
      setFormError(formatReadableFirestoreError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleResolveClick = async (commentId: string, currentResolved: boolean) => {
    setFormError(null);
    try {
      await onToggleCommentResolved(commentId, currentResolved);
    } catch (err) {
      setFormError(formatReadableFirestoreError(err));
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center px-4">
        <p className="text-sm text-neutral-400">Cargando...</p>
      </div>
    );
  }

  // Gate: If not logged in as the authorized admin, show ONLY the Google Sign-In screen
  if (!isVerifiedAdmin) {
    return (
      <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm bg-[#111111] border border-[#2A2A2A] rounded-2xl p-6 sm:p-8 space-y-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#0A0A0A] border border-[#2A2A2A] flex items-center justify-center text-white">
            {unauthorizedDenied ? (
              <ShieldAlert className="w-6 h-6 text-white" />
            ) : (
              <Lock className="w-6 h-6 text-white" />
            )}
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-white">
              Panel de Administración
            </h1>
            <p className="text-xs text-neutral-400">
              Inicia sesión con tu cuenta de Google autorizada para continuar.
            </p>
          </div>

          {unauthorizedDenied && (
            <div
              className="bg-[#0A0A0A] border border-white rounded-xl p-3.5 text-sm font-semibold text-white"
              role="alert"
              data-testid="access-denied-alert"
            >
              Sin acceso
            </div>
          )}

          {authError && (
            <div className="bg-[#0A0A0A] border border-white rounded-xl p-3 text-xs text-white text-left">
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={async () => {
              setAuthError(null);
              try {
                await onSignInGoogle();
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.includes('auth/unauthorized-domain')) {
                  setAuthError(
                    `Agrega el dominio "${window.location.hostname}" en Firebase Console → Authentication → Settings → Dominios autorizados.`
                  );
                } else {
                  setAuthError(
                    msg || 'No se pudo completar el inicio de sesión con Google.'
                  );
                }
              }
            }}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Iniciar sesión con Google</span>
          </button>
        </div>
      </div>
    );
  }

  const sortedComments = sortCommentsByTime(commentsForSelected);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Admin Header Strip */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 mb-6 border-b border-[#2A2A2A]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Panel de Administración
          </h1>
          <p className="text-xs text-neutral-400 mt-1 font-mono">
            {currentUser?.email}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Primary Button: White background, black text */}
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setSaveSuccess(null);
              setIsCreatingNew(true);
            }}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs sm:text-sm inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo proyecto</span>
          </button>

          {/* Secondary Button: Transparent with white border */}
          <button
            type="button"
            onClick={() => onSignOut()}
            className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-transparent hover:bg-white/10 border border-white text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </header>

      {/* Global Firestore Error Banner if any listener or write failed */}
      {firestoreError && (
        <div
          className="mb-6 bg-[#111111] border border-white rounded-xl p-4 text-xs text-white flex items-start gap-2.5"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{firestoreError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Project List (4 cols) */}
        <aside className="lg:col-span-4 bg-[#111111] border border-[#2A2A2A] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-white">
              Proyectos ({projects.length})
            </h2>
          </div>

          {projects.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-2">
              <Film className="w-7 h-7 text-neutral-500 mx-auto" />
              <p className="text-sm text-neutral-300 font-medium">
                Sin proyectos creados
              </p>
              <p className="text-xs text-neutral-500">
                Completa el formulario de la derecha o toca &ldquo;Nuevo proyecto&rdquo; para guardar tu primer proyecto en Firestore.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {projects.map((proj) => {
                const isSelected = !isCreatingNew && selectedProject?.id === proj.id;
                const st = getStatusVisuals(proj.status);
                const deliveryBadge = getAdminDeliveryBadge(
                  proj.status,
                  Boolean(proj.descargaHabilitada)
                );

                return (
                  <div
                    key={proj.id}
                    className={`rounded-xl border p-3.5 transition-all ${
                      isSelected
                        ? 'bg-[#1A1A1A] border-white'
                        : 'bg-[#0A0A0A] border-[#2A2A2A] hover:border-neutral-500'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFormError(null);
                        setSaveSuccess(null);
                        setIsCreatingNew(false);
                        onSelectProject(proj.id);
                      }}
                      className="w-full text-left space-y-2 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-white line-clamp-1">
                          {proj.title}
                        </span>
                        <span className="font-mono tabular-nums text-xs text-neutral-200 shrink-0">
                          {formatPrice(proj.price, proj.currency)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
                        <span className="truncate">{proj.clientName}</span>
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <span className={`inline-flex items-center gap-1 text-[11px] ${st.listTextClass}`}>
                            {proj.status === 'Aprobado' && <CheckCircle2 className="w-3 h-3" />}
                            {proj.status === 'Cambios solicitados' && <AlertCircle className="w-3 h-3" />}
                            {proj.status === 'En revisión' && <Clock className="w-3 h-3" />}
                            <span>{proj.status}</span>
                          </span>

                          {deliveryBadge && (
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] ${deliveryBadge.badgeClass}`}
                              data-testid={`project-delivery-badge-${proj.id}`}
                            >
                              {proj.descargaHabilitada ? (
                                <Unlock className="w-3 h-3" />
                              ) : (
                                <Lock className="w-3 h-3" />
                              )}
                              <span>{deliveryBadge.label}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="mt-3 pt-2.5 border-t border-[#2A2A2A] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyClientLink(proj.id)}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-transparent hover:bg-white/10 border border-white text-xs font-medium text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {copiedId === proj.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-white" />
                            <span>¡Enlace copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-white" />
                            <span>Copiar enlace del cliente</span>
                          </>
                        )}
                      </button>

                      <a
                        href={`/ver/${encodeURIComponent(proj.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[36px] px-2 py-1 rounded-lg text-xs font-medium text-neutral-300 hover:text-white inline-flex items-center gap-1 transition-colors"
                        title="Abrir página del cliente en pestaña nueva"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right Editor & Comments Workspace (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Project Form Card */}
          <section className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-[#2A2A2A]">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">
                  {isCreatingNew || !selectedProject
                    ? 'Nuevo proyecto'
                    : `Editar: ${selectedProject.title}`}
                </h2>
                {!isCreatingNew && selectedProject && (
                  <p className="text-xs text-neutral-400 font-mono mt-0.5">
                    /ver/{selectedProject.id}
                  </p>
                )}
              </div>

              {!isCreatingNew && selectedProject && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyClientLink(selectedProject.id)}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-transparent hover:bg-white/10 border border-white text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedId === selectedProject.id ? (
                      <>
                        <Check className="w-4 h-4 text-white" />
                        <span>Enlace copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-white" />
                        <span>Copiar enlace del cliente</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="proj-title"
                    className="block text-xs font-medium text-neutral-300 mb-1.5"
                  >
                    Título del proyecto
                  </label>
                  <input
                    id="proj-title"
                    type="text"
                    maxLength={120}
                    required
                    value={formState.title}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="Ej. Reel Campaña Verano"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="proj-client"
                    className="block text-xs font-medium text-neutral-300 mb-1.5"
                  >
                    Nombre del cliente
                  </label>
                  <input
                    id="proj-client"
                    type="text"
                    maxLength={100}
                    required
                    value={formState.clientName}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        clientName: e.target.value,
                      }))
                    }
                    placeholder="Ej. Valeria Mendoza"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="proj-video-url"
                  className="block text-xs font-medium text-neutral-300 mb-1.5"
                >
                  Enlace del video (URL directa a archivo .mp4)
                </label>
                <input
                  id="proj-video-url"
                  type="url"
                  maxLength={500}
                  required
                  value={formState.videoUrl}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      videoUrl: e.target.value,
                    }))
                  }
                  placeholder="https://.../video-borrador.mp4"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] text-sm text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-white"
                />
              </div>

              {/* Enlace del video FINAL (sin marca de agua) — guardado en colección separada entregas/{projectId} */}
              <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl p-4 space-y-4">
                <div>
                  <label
                    htmlFor="proj-final-video-url"
                    className="block text-xs font-medium text-white mb-1.5"
                  >
                    Enlace del video FINAL (sin marca de agua)
                  </label>
                  <input
                    id="proj-final-video-url"
                    type="url"
                    maxLength={500}
                    value={formState.finalVideoUrl}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        finalVideoUrl: e.target.value,
                      }))
                    }
                    placeholder="https://.../video-final-limpio.mp4"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#111111] border border-[#2A2A2A] text-sm text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-white"
                  />
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Se guarda de forma protegida en la colección &ldquo;entregas&rdquo; y el cliente solo puede acceder cuando habilites la descarga.
                  </p>
                </div>

                {/* Interruptor "Habilitar descarga" */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#2A2A2A]">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      {formState.descargaHabilitada ? (
                        <Unlock className="w-4 h-4 text-white" />
                      ) : (
                        <Lock className="w-4 h-4 text-neutral-400" />
                      )}
                      <span>Habilitar descarga</span>
                    </span>
                    <p className="text-xs text-neutral-400">
                      {formState.descargaHabilitada
                        ? 'Descarga habilitada para el cliente (Estado: Entregado)'
                        : 'Descarga bloqueada hasta confirmar el pago por Yape'}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={formState.descargaHabilitada}
                    data-testid="toggle-download-switch"
                    onClick={handleToggleDownloadClick}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out ${
                      formState.descargaHabilitada
                        ? 'bg-white border-white'
                        : 'bg-[#111111] border-[#2A2A2A]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full transition duration-200 ease-in-out mt-0.5 ${
                        formState.descargaHabilitada
                          ? 'translate-x-5 bg-black'
                          : 'translate-x-0.5 bg-neutral-400'
                      }`}
                    />
                  </button>
                </div>

                {/* Confirmación al encender "Habilitar descarga" */}
                {showConfirmPaymentModal && (
                  <div
                    className="p-4 rounded-xl bg-[#111111] border border-white space-y-3"
                    role="alertdialog"
                    aria-labelledby="confirm-payment-question"
                    data-testid="confirm-payment-dialog"
                  >
                    <p
                      id="confirm-payment-question"
                      className="text-sm font-semibold text-white"
                    >
                      ¿Confirmas que recibiste el pago?
                    </p>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        data-testid="confirm-payment-yes-btn"
                        onClick={handleConfirmPaymentReceived}
                        className="min-h-[38px] px-4 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-semibold cursor-pointer"
                      >
                        Sí, habilitar descarga
                      </button>
                      <button
                        type="button"
                        data-testid="confirm-payment-cancel-btn"
                        onClick={() => setShowConfirmPaymentModal(false)}
                        className="min-h-[38px] px-4 py-1.5 rounded-xl bg-transparent hover:bg-white/10 border border-white text-white text-xs font-medium cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="proj-currency"
                    className="block text-xs font-medium text-neutral-300 mb-1.5"
                  >
                    Moneda
                  </label>
                  <select
                    id="proj-currency"
                    value={formState.currency}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        currency: e.target.value as CurrencyCode,
                      }))
                    }
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] text-sm text-white focus:outline-none focus:border-white"
                  >
                    {VALID_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c === 'S/' ? 'Soles (S/)' : 'Dólares ($)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="proj-price"
                    className="block text-xs font-medium text-neutral-300 mb-1.5"
                  >
                    Precio
                  </label>
                  <input
                    id="proj-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={formState.price}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        price: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] text-sm text-white font-mono tabular-nums focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="proj-status"
                    className="block text-xs font-medium text-neutral-300 mb-1.5"
                  >
                    Estado del proyecto
                  </label>
                  <select
                    id="proj-status"
                    value={formState.status}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        status: e.target.value as ProjectStatus,
                      }))
                    }
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] text-sm text-white focus:outline-none focus:border-white"
                  >
                    {VALID_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] cursor-pointer">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      {formState.showPrice ? (
                        <Eye className="w-4 h-4 text-white" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-neutral-500" />
                      )}
                      <span>Mostrar precio al cliente</span>
                    </span>
                    <p className="text-xs text-neutral-400">
                      Visible junto al título en la página del cliente
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formState.showPrice}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        showPrice: e.target.checked,
                      }))
                    }
                    className="w-5 h-5 accent-white rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] cursor-pointer">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-white">
                      Activar marca de agua
                    </span>
                    <p className="text-xs text-neutral-400">
                      Superpone texto blanco semitransparente sobre el video
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formState.watermarkEnabled}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        watermarkEnabled: e.target.checked,
                      }))
                    }
                    className="w-5 h-5 accent-white rounded cursor-pointer"
                  />
                </label>
              </div>

              <div>
                <label
                  htmlFor="proj-watermark-text"
                  className="block text-xs font-medium text-neutral-300 mb-1.5"
                >
                  Texto de la marca de agua
                </label>
                <input
                  id="proj-watermark-text"
                  type="text"
                  maxLength={100}
                  value={formState.watermarkText}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      watermarkText: e.target.value,
                    }))
                  }
                  placeholder="Ej. VISTA PREVIA"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                />
              </div>

              {formError && (
                <div
                  className="p-3.5 rounded-xl bg-[#0A0A0A] border border-white text-xs text-white flex items-start gap-2"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {saveSuccess && (
                <div
                  className="p-3.5 rounded-xl bg-white text-black font-semibold text-xs flex items-center gap-2"
                  role="status"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{saveSuccess}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#2A2A2A]">
                <div>
                  {!isCreatingNew && selectedProject && (
                    <>
                      {confirmDeleteId === selectedProject.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleConfirmDelete(selectedProject.id)}
                            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-semibold cursor-pointer"
                          >
                            Confirmar eliminación
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-transparent border border-white text-white text-xs font-medium cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(selectedProject.id)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-transparent border border-[#2A2A2A] hover:border-white text-neutral-300 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Eliminar proyecto</span>
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  {isCreatingNew && projects.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsCreatingNew(false)}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-transparent hover:bg-white/10 border border-white text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}

                  {/* Primary Save/Create Button: White background, black text */}
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs sm:text-sm inline-flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>
                      {isSaving
                        ? 'Guardando...'
                        : isCreatingNew || !selectedProject
                        ? 'Crear proyecto'
                        : 'Guardar cambios'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </section>

          {/* Comments Moderation Section for Selected Project */}
          {!isCreatingNew && selectedProject && (
            <section className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2 pb-4 mb-4 border-b border-[#2A2A2A]">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Comentarios del cliente ({sortedComments.length})
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Marca los comentarios como resueltos a medida que apliques los cambios en el video
                  </p>
                </div>
              </div>

              {sortedComments.length === 0 ? (
                <p className="text-sm text-neutral-400 py-6 text-center">
                  El cliente aún no ha dejado comentarios en este proyecto.
                </p>
              ) : (
                <div className="divide-y divide-[#2A2A2A]">
                  {sortedComments.map((c) => (
                    <div
                      key={c.id}
                      className="py-3.5 flex items-start justify-between gap-4"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="font-mono tabular-nums text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#0A0A0A] border border-[#2A2A2A] text-white shrink-0 mt-0.5">
                          {formatVideoTimestamp(c.videoSecond)}
                        </span>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-white">
                              {c.authorName}
                            </span>
                          </div>
                          <p
                            className={`text-sm break-words ${
                              c.resolved
                                ? 'line-through text-neutral-500'
                                : 'text-neutral-200'
                            }`}
                          >
                            {c.text}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleResolveClick(c.id, c.resolved)}
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                          c.resolved
                            ? 'bg-white text-black font-semibold'
                            : 'bg-transparent hover:bg-white/10 border border-white text-white'
                        }`}
                      >
                        {c.resolved ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Resuelto</span>
                          </>
                        ) : (
                          <>
                            <Circle className="w-4 h-4" />
                            <span>Marcar resuelto</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
