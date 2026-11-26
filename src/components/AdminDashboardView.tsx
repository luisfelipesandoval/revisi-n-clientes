import React, { useState, useEffect } from 'react';
import {
  Plus,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Circle,
  Lock,
  LogOut,
  Save,
  Film,
  Eye,
  EyeOff,
  ShieldAlert,
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
  parseVideoUrl,
} from '../utils/video';
import {
  VALID_STATUSES,
  VALID_CURRENCIES,
  isAuthorizedAdminUser,
} from '../utils/validation';

interface AdminDashboardViewProps {
  currentUser: FirebaseUser | null;
  authReady: boolean;
  unauthorizedDenied: boolean;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  projects: Project[];
  selectedProjectId: string | null;
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
  onSignInGoogle,
  onSignOut,
  projects,
  selectedProjectId,
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

  useEffect(() => {
    if (isCreatingNew || !selectedProject) {
      setFormState(DEFAULT_FORM_INPUT);
      setFormError(null);
      setSaveSuccess(null);
      return;
    }
    setFormState({
      title: selectedProject.title,
      clientName: selectedProject.clientName,
      videoUrl: selectedProject.videoUrl,
      price: selectedProject.price,
      currency: selectedProject.currency,
      showPrice: selectedProject.showPrice,
      watermarkEnabled: selectedProject.watermarkEnabled,
      watermarkText: selectedProject.watermarkText,
      status: selectedProject.status,
      whatsappNumber: selectedProject.whatsappNumber,
    });
    setFormError(null);
    setConfirmDeleteId(null);
  }, [selectedProject?.id, isCreatingNew]);

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

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaveSuccess(null);

    const trimmedTitle = formState.title.trim();
    const trimmedClient = formState.clientName.trim();
    const trimmedUrl = formState.videoUrl.trim();
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
    if (Number.isNaN(formState.price) || formState.price < 0) {
      setFormError('Ingresa un precio válido mayor o igual a 0.');
      return;
    }

    const cleanInput: ProjectFormInput = {
      title: trimmedTitle,
      clientName: trimmedClient,
      videoUrl: trimmedUrl,
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
        setIsCreatingNew(false);
        onSelectProject(newId);
        setSaveSuccess('Proyecto creado correctamente.');
      } else {
        await onUpdateProject(selectedProject.id, cleanInput);
        setSaveSuccess('Cambios guardados correctamente.');
      }
      window.setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo guardar el proyecto.'
      );
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
      setSaveSuccess('Proyecto eliminado.');
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo eliminar el proyecto.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-slate-400">Cargando...</p>
      </div>
    );
  }

  // Gate: If not logged in as the authorized admin, show ONLY the Google Sign-In screen (and "Sin acceso" if another account attempted sign-in)
  if (!isVerifiedAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            {unauthorizedDenied ? (
              <ShieldAlert className="w-6 h-6 text-rose-400" />
            ) : (
              <Lock className="w-6 h-6" />
            )}
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-white">
              Panel de Administración
            </h1>
            <p className="text-xs text-slate-400">
              Inicia sesión con tu cuenta de Google autorizada para continuar.
            </p>
          </div>

          {unauthorizedDenied && (
            <div
              className="bg-rose-950/70 border border-rose-500/40 rounded-xl p-3.5 text-sm font-semibold text-rose-200"
              role="alert"
              data-testid="access-denied-alert"
            >
              Sin acceso
            </div>
          )}

          {authError && (
            <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl p-3 text-xs text-rose-200 text-left">
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
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
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
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 mb-6 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Panel de Administración
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            {currentUser?.email}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsCreatingNew(true)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs sm:text-sm inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo proyecto</span>
          </button>

          <button
            type="button"
            onClick={() => onSignOut()}
            className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Project List (4 cols) */}
        <aside className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-slate-200">
              Proyectos ({projects.length})
            </h2>
          </div>

          {projects.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-2">
              <Film className="w-7 h-7 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-300 font-medium">
                Sin proyectos creados
              </p>
              <p className="text-xs text-slate-500">
                Usa el botón &ldquo;Nuevo proyecto&rdquo; para crear tu primer enlace de cliente.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((proj) => {
                const isSelected = !isCreatingNew && selectedProject?.id === proj.id;
                const st = getStatusVisuals(proj.status);
                return (
                  <div
                    key={proj.id}
                    className={`rounded-xl border p-3.5 transition-all ${
                      isSelected
                        ? 'bg-slate-800/90 border-sky-500/50'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingNew(false);
                        onSelectProject(proj.id);
                      }}
                      className="w-full text-left space-y-1.5 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-white line-clamp-1">
                          {proj.title}
                        </span>
                        <span className="font-mono tabular-nums text-xs text-slate-300 shrink-0">
                          {formatPrice(proj.price, proj.currency)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                        <span className="truncate">{proj.clientName}</span>
                        <span className={`font-medium shrink-0 ${st.textColor}`}>
                          {proj.status}
                        </span>
                      </div>
                    </button>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyClientLink(proj.id)}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {copiedId === proj.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-300">¡Enlace copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-sky-400" />
                            <span>Copiar enlace del cliente</span>
                          </>
                        )}
                      </button>

                      <a
                        href={`/ver/${encodeURIComponent(proj.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[36px] px-2 py-1 rounded-lg text-xs font-medium text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 transition-colors"
                        title="Abrir enlace del cliente en pestaña nueva"
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
          <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-800">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">
                  {isCreatingNew || !selectedProject
                    ? 'Nuevo proyecto'
                    : `Editar: ${selectedProject.title}`}
                </h2>
                {!isCreatingNew && selectedProject && (
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    /ver/{selectedProject.id}
                  </p>
                )}
              </div>

              {!isCreatingNew && selectedProject && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyClientLink(selectedProject.id)}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedId === selectedProject.id ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300">Enlace copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-sky-400" />
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
                    className="block text-xs font-medium text-slate-300 mb-1.5"
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
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="proj-client"
                    className="block text-xs font-medium text-slate-300 mb-1.5"
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
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="proj-video-url"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
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
                  placeholder="https://.../video.mp4"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="proj-currency"
                    className="block text-xs font-medium text-slate-300 mb-1.5"
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
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-sky-400"
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
                    className="block text-xs font-medium text-slate-300 mb-1.5"
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
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono tabular-nums focus:outline-none focus:border-sky-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="proj-status"
                    className="block text-xs font-medium text-slate-300 mb-1.5"
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
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-sky-400"
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
                <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      {formState.showPrice ? (
                        <Eye className="w-4 h-4 text-sky-400" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-slate-500" />
                      )}
                      <span>Mostrar precio al cliente</span>
                    </span>
                    <p className="text-xs text-slate-400">
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
                    className="w-5 h-5 accent-sky-400 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-slate-200">
                      Activar marca de agua
                    </span>
                    <p className="text-xs text-slate-400">
                      Superpone texto semitransparente sobre el video
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
                    className="w-5 h-5 accent-sky-400 rounded cursor-pointer"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="proj-watermark-text"
                    className="block text-xs font-medium text-slate-300 mb-1.5"
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
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="proj-whatsapp"
                    className="block text-xs font-medium text-slate-300 mb-1.5"
                  >
                    WhatsApp para botón de pago / entrega (con código de país)
                  </label>
                  <input
                    id="proj-whatsapp"
                    type="text"
                    maxLength={30}
                    value={formState.whatsappNumber}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        whatsappNumber: e.target.value,
                      }))
                    }
                    placeholder="Ej. 51987654321"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono tabular-nums placeholder-slate-500 focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs text-rose-200">
                  {formError}
                </div>
              )}

              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-xs text-emerald-200">
                  {saveSuccess}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <div>
                  {!isCreatingNew && selectedProject && (
                    <>
                      {confirmDeleteId === selectedProject.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleConfirmDelete(selectedProject.id)}
                            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                          >
                            Confirmar eliminación
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(selectedProject.id)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl text-rose-400 hover:bg-rose-950/50 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
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
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs sm:text-sm inline-flex items-center gap-2 transition-colors cursor-pointer"
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
            <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Comentarios del cliente ({sortedComments.length})
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Marca los comentarios como resueltos a medida que apliques los cambios en el video
                  </p>
                </div>
              </div>

              {sortedComments.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">
                  El cliente aún no ha dejado comentarios en este proyecto.
                </p>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {sortedComments.map((c) => (
                    <div
                      key={c.id}
                      className="py-3.5 flex items-start justify-between gap-4"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="font-mono tabular-nums text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800 text-sky-300 shrink-0 mt-0.5">
                          {formatVideoTimestamp(c.videoSecond)}
                        </span>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-slate-200">
                              {c.authorName}
                            </span>
                          </div>
                          <p
                            className={`text-sm break-words ${
                              c.resolved
                                ? 'line-through text-slate-500'
                                : 'text-slate-200'
                            }`}
                          >
                            {c.text}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggleCommentResolved(c.id, c.resolved)}
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                          c.resolved
                            ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        }`}
                      >
                        {c.resolved ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>Resuelto</span>
                          </>
                        ) : (
                          <>
                            <Circle className="w-4 h-4 text-slate-400" />
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
