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
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  FileText,
  Eye,
  EyeOff,
  ShieldAlert,
  AlertCircle,
  Clock,
  Users,
  UserPlus,
  Edit3,
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  Cliente,
  FinalDeliveryFile,
  Project,
  ProjectFormInput,
  ProjectStatus,
  DisplayProjectStatus,
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
  parseImageUrlsFromText,
} from '../utils/video';
import {
  VALID_STATUSES,
  VALID_CURRENCIES,
  isAuthorizedAdminUser,
  filterMatchingClients,
  findSimilarExistingClient,
  normalizeClientName,
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
  clientes: Cliente[];
  selectedProjectId: string | null;
  selectedProjectFinalVideoUrl: string;
  selectedProjectFinalFiles: FinalDeliveryFile[];
  onSelectProject: (projectId: string) => void;
  commentsForSelected: VideoComment[];
  onCreateProject: (input: ProjectFormInput) => Promise<string>;
  onUpdateProject: (projectId: string, input: ProjectFormInput) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onToggleCommentResolved: (commentId: string, currentResolved: boolean) => Promise<void>;
  onCreateCliente: (name: string, note: string) => Promise<Cliente>;
  onUpdateCliente: (clienteId: string, name: string, note: string) => Promise<void>;
  onDeleteCliente: (clienteId: string) => Promise<void>;
}

const DEFAULT_FORM_INPUT: ProjectFormInput = {
  title: '',
  clientName: '',
  clientId: '',
  clientNote: '',
  mostrarEnListaCliente: true,
  projectType: 'video',
  videoUrl: '',
  imageUrls: [],
  finalVideoUrl: '',
  finalFiles: [],
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
  clientes,
  selectedProjectId,
  selectedProjectFinalVideoUrl,
  selectedProjectFinalFiles,
  onSelectProject,
  commentsForSelected,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onToggleCommentResolved,
  onCreateCliente,
  onUpdateCliente,
  onDeleteCliente,
}) => {
  const isVerifiedAdmin = isAuthorizedAdminUser(currentUser);
  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  const [adminTab, setAdminTab] = useState<'proyectos' | 'clientes'>('proyectos');
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);

  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [formState, setFormState] = useState<ProjectFormInput>(DEFAULT_FORM_INPUT);
  const [rawImageLinksText, setRawImageLinksText] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Autocomplete dropdown state for Cliente field
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState<boolean>(false);
  const clientAutocompleteRef = useRef<HTMLDivElement | null>(null);

  // Payment confirmation dialog when turning on "Habilitar descarga"
  const [showConfirmPaymentModal, setShowConfirmPaymentModal] = useState<boolean>(false);

  // Clientes tab editor state
  const [isCreatingNewCliente, setIsCreatingNewCliente] = useState<boolean>(false);
  const [clienteNameInput, setClienteNameInput] = useState<string>('');
  const [clienteNoteInput, setClienteNoteInput] = useState<string>('');
  const [clienteFormError, setClienteFormError] = useState<string | null>(null);
  const [clienteSaveSuccess, setClienteSaveSuccess] = useState<string | null>(null);
  const [confirmDeleteClienteId, setConfirmDeleteClienteId] = useState<string | null>(null);

  // Track which project ID was last loaded into the form so we don't wipe form/messages on re-renders
  const loadedProjectIdRef = useRef<string | null>(null);

  // Keep selectedClienteId valid when clientes list updates
  useEffect(() => {
    if (clientes.length === 0) {
      setSelectedClienteId(null);
      return;
    }
    if (!selectedClienteId || !clientes.some((c) => c.id === selectedClienteId)) {
      setSelectedClienteId(clientes[0].id);
    }
  }, [clientes, selectedClienteId]);

  const activeCliente =
    clientes.find((c) => c.id === selectedClienteId) || clientes[0] || null;

  useEffect(() => {
    if (isCreatingNewCliente) {
      setClienteNameInput('');
      setClienteNoteInput('');
      setClienteFormError(null);
      return;
    }
    if (activeCliente) {
      setClienteNameInput(activeCliente.name);
      setClienteNoteInput(activeCliente.note || '');
      setClienteFormError(null);
      setConfirmDeleteClienteId(null);
    }
  }, [activeCliente?.id, isCreatingNewCliente]);

  // Close client autocomplete dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        clientAutocompleteRef.current &&
        !clientAutocompleteRef.current.contains(e.target as Node)
      ) {
        setIsClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isCreatingNew) {
      if (loadedProjectIdRef.current !== '__new__') {
        loadedProjectIdRef.current = '__new__';
        setFormState(DEFAULT_FORM_INPUT);
        setRawImageLinksText('');
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
          clientId: selectedProject.clientId || '',
          clientNote: '',
          mostrarEnListaCliente: selectedProject.mostrarEnListaCliente !== false,
          projectType: selectedProject.projectType === 'images' ? 'images' : 'video',
          videoUrl: selectedProject.videoUrl,
          imageUrls: Array.isArray(selectedProject.imageUrls)
            ? [...selectedProject.imageUrls]
            : [],
          finalVideoUrl: selectedProjectFinalVideoUrl || '',
          finalFiles: Array.isArray(selectedProjectFinalFiles)
            ? selectedProjectFinalFiles.map((f) => ({ ...f }))
            : [],
          descargaHabilitada: Boolean(selectedProject.descargaHabilitada),
          price: selectedProject.price,
          currency: selectedProject.currency,
          showPrice: selectedProject.showPrice,
          watermarkEnabled: selectedProject.watermarkEnabled,
          watermarkText: selectedProject.watermarkText,
          status: selectedProject.status,
          whatsappNumber: selectedProject.whatsappNumber,
        });
        setRawImageLinksText('');
        setConfirmDeleteId(null);
        setShowConfirmPaymentModal(false);
      }
    } else if (loadedProjectIdRef.current !== null) {
      loadedProjectIdRef.current = null;
      setFormState(DEFAULT_FORM_INPUT);
      setRawImageLinksText('');
      setShowConfirmPaymentModal(false);
    }
  }, [
    selectedProject,
    isCreatingNew,
    selectedProjectFinalVideoUrl,
    selectedProjectFinalFiles,
  ]);

  // Sync finalVideoUrl & finalFiles from entregas/{projectId} listener when it arrives for the selected project
  useEffect(() => {
    if (!isCreatingNew && selectedProject && loadedProjectIdRef.current === selectedProject.id) {
      setFormState((prev) => ({
        ...prev,
        finalVideoUrl: selectedProjectFinalVideoUrl,
        finalFiles: Array.isArray(selectedProjectFinalFiles)
          ? selectedProjectFinalFiles.map((f) => ({ ...f }))
          : prev.finalFiles,
      }));
    }
  }, [
    selectedProjectFinalVideoUrl,
    selectedProjectFinalFiles,
    isCreatingNew,
    selectedProject,
  ]);

  // Also keep status, descargaHabilitada, and clientId synced if updated in real-time
  useEffect(() => {
    if (!isCreatingNew && selectedProject && loadedProjectIdRef.current === selectedProject.id) {
      setFormState((prev) => ({
        ...prev,
        status: selectedProject.status,
        descargaHabilitada: Boolean(selectedProject.descargaHabilitada),
        clientId: selectedProject.clientId || prev.clientId,
      }));
    }
  }, [
    selectedProject?.status,
    selectedProject?.descargaHabilitada,
    selectedProject?.clientId,
    isCreatingNew,
    selectedProject,
  ]);

  const getClientShareUrl = (projectId: string) => {
    return `${window.location.origin}/ver/${encodeURIComponent(projectId)}`;
  };

  const getClientPortalUrl = (clienteId: string) => {
    return `${window.location.origin}/cliente/${encodeURIComponent(clienteId)}`;
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

  const handleCopyClientPortalLink = async (clienteId: string) => {
    const url = getClientPortalUrl(clienteId);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback ignore
    }
    setCopiedId(`portal_${clienteId}`);
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

  // Image list management helpers
  const handleAddPastedImageLinks = () => {
    setFormError(null);
    const { validUrls, invalidLines } = parseImageUrlsFromText(rawImageLinksText);
    if (invalidLines.length > 0) {
      setFormError(
        `Enlace de imagen no válido: ${invalidLines[0]}. Asegúrate de que empiece con http:// o https://.`
      );
      return;
    }
    if (validUrls.length === 0) return;
    setFormState((prev) => ({
      ...prev,
      imageUrls: [...prev.imageUrls, ...validUrls],
    }));
    setRawImageLinksText('');
  };

  const handleMoveImage = (index: number, direction: 'up' | 'down') => {
    setFormState((prev) => {
      const next = [...prev.imageUrls];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return { ...prev, imageUrls: next };
    });
  };

  const handleRemoveImage = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      imageUrls: prev.imageUrls.filter((_, i) => i !== index),
    }));
  };

  const handleUpdateImageUrlAt = (index: number, newUrl: string) => {
    setFormState((prev) => {
      const next = [...prev.imageUrls];
      next[index] = newUrl;
      return { ...prev, imageUrls: next };
    });
  };

  // Final files management helpers
  const handleAddFinalFileRow = () => {
    setFormState((prev) => ({
      ...prev,
      finalFiles: [...prev.finalFiles, { name: '', url: '' }],
    }));
  };

  const handleUpdateFinalFileRow = (
    index: number,
    field: 'name' | 'url',
    value: string
  ) => {
    setFormState((prev) => {
      const next = prev.finalFiles.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      );
      return { ...prev, finalFiles: next };
    });
  };

  const handleRemoveFinalFileRow = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      finalFiles: prev.finalFiles.filter((_, i) => i !== index),
    }));
  };

  // Autocomplete helpers for Cliente input
  const matchingClients = filterMatchingClients(clientes, formState.clientName);
  const similarClient = !formState.clientId
    ? findSimilarExistingClient(clientes, formState.clientName)
    : null;
  const exactNormalizedMatch = clientes.find(
    (c) =>
      normalizeClientName(c.name) === normalizeClientName(formState.clientName)
  );

  const handleSelectExistingCliente = (cliente: Cliente) => {
    setFormState((prev) => ({
      ...prev,
      clientName: cliente.name,
      clientId: cliente.id,
    }));
    setIsClientDropdownOpen(false);
  };

  const handleQuickCreateNewClienteFromDropdown = async () => {
    const trimmed = formState.clientName.trim();
    if (!trimmed) return;
    setIsSaving(true);
    setFormError(null);
    try {
      const created = await onCreateCliente(trimmed, formState.clientNote || '');
      setFormState((prev) => ({
        ...prev,
        clientName: created.name,
        clientId: created.id,
      }));
      setIsClientDropdownOpen(false);
    } catch (err) {
      setFormError(formatReadableFirestoreError(err));
    } finally {
      setIsSaving(false);
    }
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
    const trimmedWatermark = formState.watermarkText.trim();
    const trimmedWa = formState.whatsappNumber.trim();
    const projectType = formState.projectType === 'images' ? 'images' : 'video';

    if (!trimmedTitle) {
      setFormError('El título del proyecto es obligatorio.');
      return;
    }
    if (!trimmedClient) {
      setFormError('El nombre del cliente es obligatorio.');
      return;
    }

    // Merge any remaining pasted image links in the textarea into imageUrls
    const pendingPasted = parseImageUrlsFromText(rawImageLinksText);
    if (projectType === 'images' && pendingPasted.invalidLines.length > 0) {
      setFormError(
        `Enlace de imagen no válido: ${pendingPasted.invalidLines[0]}`
      );
      return;
    }
    const mergedImageUrls = [
      ...formState.imageUrls.map((u) => u.trim()).filter(Boolean),
      ...pendingPasted.validUrls,
    ];

    if (projectType === 'video') {
      const parsedVideo = parseVideoUrl(trimmedUrl);
      if (parsedVideo.type === 'invalid') {
        setFormError(parsedVideo.reason);
        return;
      }
    } else {
      if (mergedImageUrls.length === 0) {
        setFormError(
          'Agrega al menos un enlace de imagen (JPG o PNG) para el proyecto de imágenes.'
        );
        return;
      }
      for (const imgUrl of mergedImageUrls) {
        try {
          const parsed = new URL(imgUrl);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            setFormError(`Enlace de imagen no válido: ${imgUrl}`);
            return;
          }
        } catch {
          setFormError(`Enlace de imagen no válido: ${imgUrl}`);
          return;
        }
      }
    }

    // Validate finalFiles rows (ignore rows where both name and url are empty)
    const cleanedFinalFiles: FinalDeliveryFile[] = [];
    for (let i = 0; i < formState.finalFiles.length; i++) {
      const row = formState.finalFiles[i];
      const fName = row.name.trim();
      const fUrl = row.url.trim();
      if (!fName && !fUrl) continue;
      if (!fUrl) {
        setFormError(
          `Ingresa el enlace para el archivo final "${fName || `#${i + 1}`}".`
        );
        return;
      }
      try {
        const parsed = new URL(fUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setFormError(`El enlace del archivo final "${fName || fUrl}" debe usar http o https.`);
          return;
        }
      } catch {
        setFormError(`El enlace del archivo final "${fName || fUrl}" no es una URL válida.`);
        return;
      }
      const fallbackName =
        fName ||
        decodeURIComponent(fUrl.split('/').pop()?.split('?')[0] || '') ||
        `Archivo final ${cleanedFinalFiles.length + 1}`;
      cleanedFinalFiles.push({
        name: fallbackName.slice(0, 140),
        url: fUrl.slice(0, 500),
      });
    }

    if (Number.isNaN(formState.price) || formState.price < 0) {
      setFormError('Ingresa un precio válido mayor o igual a 0.');
      return;
    }

    const firstFinalUrl = cleanedFinalFiles[0]?.url || formState.finalVideoUrl.trim();

    const cleanInput: ProjectFormInput = {
      title: trimmedTitle,
      clientName: trimmedClient,
      clientId: formState.clientId,
      clientNote: formState.clientNote,
      mostrarEnListaCliente: Boolean(formState.mostrarEnListaCliente),
      projectType,
      videoUrl: projectType === 'video' ? trimmedUrl : '',
      imageUrls: projectType === 'images' ? mergedImageUrls : [],
      finalVideoUrl: firstFinalUrl,
      finalFiles: cleanedFinalFiles,
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
      setFormState((prev) => ({
        ...prev,
        imageUrls: mergedImageUrls,
        finalFiles: cleanedFinalFiles,
      }));
      setRawImageLinksText('');

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

  const handleClienteFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClienteFormError(null);
    setClienteSaveSuccess(null);

    const trimmedName = clienteNameInput.trim();
    const trimmedNote = clienteNoteInput.trim();

    if (!trimmedName) {
      setClienteFormError('El nombre del cliente es obligatorio.');
      return;
    }

    setIsSaving(true);
    try {
      if (isCreatingNewCliente || !activeCliente) {
        const created = await onCreateCliente(trimmedName, trimmedNote);
        setIsCreatingNewCliente(false);
        setSelectedClienteId(created.id);
        setClienteSaveSuccess('Cliente creado correctamente.');
      } else {
        await onUpdateCliente(activeCliente.id, trimmedName, trimmedNote);
        setClienteSaveSuccess('Datos del cliente actualizados.');
      }
      window.setTimeout(() => setClienteSaveSuccess(null), 4000);
    } catch (err) {
      setClienteFormError(formatReadableFirestoreError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDeleteCliente = async (clienteId: string) => {
    setIsSaving(true);
    setClienteFormError(null);
    try {
      await onDeleteCliente(clienteId);
      setConfirmDeleteClienteId(null);
      setClienteSaveSuccess('Cliente eliminado.');
    } catch (err) {
      setClienteFormError(formatReadableFirestoreError(err));
    } finally {
      setIsSaving(false);
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

  const sortedComments = sortCommentsByTime(
    commentsForSelected,
    selectedProject?.projectType || 'video'
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Admin Header Strip */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 mb-6 border-b border-[#2A2A2A]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Panel de Administración
            </h1>
            <p className="text-xs text-neutral-400 mt-1 font-mono">
              {currentUser?.email}
            </p>
          </div>

          {/* Section Switcher: Proyectos / Clientes */}
          <div className="inline-flex items-center bg-[#111111] border border-[#2A2A2A] rounded-xl p-1 gap-1 self-start sm:self-auto">
            <button
              type="button"
              data-testid="admin-tab-proyectos"
              onClick={() => setAdminTab('proyectos')}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                adminTab === 'proyectos'
                  ? 'bg-white text-black'
                  : 'bg-transparent text-neutral-300 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Proyectos ({projects.length})</span>
            </button>

            <button
              type="button"
              data-testid="admin-tab-clientes"
              onClick={() => setAdminTab('clientes')}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                adminTab === 'clientes'
                  ? 'bg-white text-black'
                  : 'bg-transparent text-neutral-300 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Clientes ({clientes.length})</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Primary Button: White background, black text */}
          <button
            type="button"
            onClick={() => {
              setAdminTab('proyectos');
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

      {/* TAB 2: SECCIÓN "CLIENTES" */}
      {adminTab === 'clientes' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Sidebar: Saved Clients List (4 cols) */}
          <aside className="lg:col-span-4 bg-[#111111] border border-[#2A2A2A] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-white">
                Clientes ({clientes.length})
              </h2>
              <button
                type="button"
                data-testid="new-cliente-btn"
                onClick={() => {
                  setIsCreatingNewCliente(true);
                  setClienteFormError(null);
                  setClienteSaveSuccess(null);
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Nuevo cliente</span>
              </button>
            </div>

            {clientes.length === 0 ? (
              <div className="py-8 px-4 text-center space-y-2">
                <Users className="w-7 h-7 text-neutral-500 mx-auto" />
                <p className="text-sm text-neutral-300 font-medium">
                  Sin clientes guardados
                </p>
                <p className="text-xs text-neutral-500">
                  Los clientes se crean automáticamente al guardar proyectos o desde el botón &ldquo;Nuevo cliente&rdquo;.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {clientes.map((cli) => {
                  const isSelected =
                    !isCreatingNewCliente && activeCliente?.id === cli.id;
                  const clientProjectsCount = projects.filter(
                    (p) =>
                      p.clientId === cli.id ||
                      (!p.clientId &&
                        normalizeClientName(p.clientName) ===
                          normalizeClientName(cli.name))
                  ).length;

                  return (
                    <button
                      key={cli.id}
                      type="button"
                      onClick={() => {
                        setIsCreatingNewCliente(false);
                        setSelectedClienteId(cli.id);
                      }}
                      className={`w-full text-left rounded-xl border p-3.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#1A1A1A] border-white'
                          : 'bg-[#0A0A0A] border-[#2A2A2A] hover:border-neutral-500'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-white truncate">
                          {cli.name}
                        </span>
                        <span className="font-mono tabular-nums text-xs px-2 py-0.5 rounded bg-[#111111] border border-[#2A2A2A] text-neutral-200 shrink-0">
                          {clientProjectsCount}{' '}
                          {clientProjectsCount === 1 ? 'proyecto' : 'proyectos'}
                        </span>
                      </div>
                      {cli.note && (
                        <p className="text-xs text-neutral-400 mt-1 line-clamp-1">
                          {cli.note}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          {/* Right Workspace: Selected Client Details & Projects List (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            <section className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-[#2A2A2A]">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">
                    {isCreatingNewCliente || !activeCliente
                      ? 'Nuevo cliente'
                      : `Cliente: ${activeCliente.name}`}
                  </h2>
                  {!isCreatingNewCliente && activeCliente && (
                    <p className="text-xs text-neutral-400 font-mono mt-0.5">
                      /cliente/{activeCliente.id}
                    </p>
                  )}
                </div>

                {!isCreatingNewCliente && activeCliente && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyClientPortalLink(activeCliente.id)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-transparent hover:bg-white/10 border border-white text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedId === `portal_${activeCliente.id}` ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>¡Enlace general copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar enlace general (/cliente/ID)</span>
                        </>
                      )}
                    </button>

                    <a
                      href={`/cliente/${encodeURIComponent(activeCliente.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-[#2A2A2A] hover:border-white text-neutral-300 hover:text-white inline-flex items-center justify-center transition-colors"
                      title="Abrir lista pública del cliente"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                )}
              </div>

              <form onSubmit={handleClienteFormSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="cliente-name-input"
                      className="block text-xs font-medium text-neutral-300 mb-1.5"
                    >
                      Nombre del cliente
                    </label>
                    <input
                      id="cliente-name-input"
                      type="text"
                      maxLength={100}
                      required
                      value={clienteNameInput}
                      onChange={(e) => setClienteNameInput(e.target.value)}
                      placeholder="Ej. Dreyzon"
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="cliente-note-input"
                      className="block text-xs font-medium text-neutral-300 mb-1.5"
                    >
                      Nota opcional
                    </label>
                    <input
                      id="cliente-note-input"
                      type="text"
                      maxLength={500}
                      value={clienteNoteInput}
                      onChange={(e) => setClienteNoteInput(e.target.value)}
                      placeholder="Ej. Prefiere formato 9:16 con subtítulos..."
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                    />
                  </div>
                </div>

                {clienteFormError && (
                  <div
                    className="p-3 rounded-xl bg-[#0A0A0A] border border-white text-xs text-white"
                    role="alert"
                  >
                    {clienteFormError}
                  </div>
                )}

                {clienteSaveSuccess && (
                  <div
                    className="p-3 rounded-xl bg-white text-black font-semibold text-xs flex items-center gap-2"
                    role="status"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{clienteSaveSuccess}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#2A2A2A]">
                  <div>
                    {!isCreatingNewCliente && activeCliente && (
                      <>
                        {confirmDeleteClienteId === activeCliente.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() =>
                                handleConfirmDeleteCliente(activeCliente.id)
                              }
                              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-semibold cursor-pointer"
                            >
                              Confirmar eliminación
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteClienteId(null)}
                              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-transparent border border-white text-white text-xs font-medium cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDeleteClienteId(activeCliente.id)
                            }
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-transparent border border-[#2A2A2A] hover:border-white text-neutral-300 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Eliminar cliente</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isCreatingNewCliente && clientes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsCreatingNewCliente(false)}
                        className="min-h-[40px] px-4 py-1.5 rounded-xl bg-transparent border border-white text-white text-xs font-medium cursor-pointer"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="min-h-[40px] px-4 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>
                        {isCreatingNewCliente || !activeCliente
                          ? 'Crear cliente'
                          : 'Guardar cliente'}
                      </span>
                    </button>
                  </div>
                </div>
              </form>
            </section>

            {/* Projects belonging to Selected Client */}
            {!isCreatingNewCliente && activeCliente && (() => {
              const clientProjects = projects.filter(
                (p) =>
                  p.clientId === activeCliente.id ||
                  (!p.clientId &&
                    normalizeClientName(p.clientName) ===
                      normalizeClientName(activeCliente.name))
              );

              return (
                <section className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#2A2A2A]">
                    <div>
                      <h3 className="text-base font-bold text-white">
                        Proyectos de {activeCliente.name} ({clientProjects.length})
                      </h3>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Estados: En revisión, Cambios solicitados, Aprobado o Entregado
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAdminTab('proyectos');
                        setIsCreatingNew(true);
                        loadedProjectIdRef.current = '__new__';
                        setFormState({
                          ...DEFAULT_FORM_INPUT,
                          clientName: activeCliente.name,
                          clientId: activeCliente.id,
                        });
                        setRawImageLinksText('');
                      }}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nuevo proyecto para {activeCliente.name}</span>
                    </button>
                  </div>

                  {clientProjects.length === 0 ? (
                    <p className="text-sm text-neutral-400 py-6 text-center">
                      Este cliente aún no tiene proyectos registrados.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {clientProjects.map((proj) => {
                        const displayStatus: DisplayProjectStatus =
                          proj.descargaHabilitada ? 'Entregado' : proj.status;
                        const st = getStatusVisuals(displayStatus);
                        const isImageProj = proj.projectType === 'images';

                        return (
                          <div
                            key={proj.id}
                            className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                          >
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className="inline-flex items-center justify-center text-neutral-400 shrink-0"
                                  title={
                                    isImageProj
                                      ? 'Proyecto de imágenes'
                                      : 'Proyecto de video'
                                  }
                                >
                                  {isImageProj ? (
                                    <ImageIcon className="w-3.5 h-3.5" />
                                  ) : (
                                    <Film className="w-3.5 h-3.5" />
                                  )}
                                </span>
                                <span className="text-sm font-semibold text-white">
                                  {proj.title}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] ${st.listTextClass}`}
                                >
                                  {(displayStatus === 'Aprobado' ||
                                    displayStatus === 'Entregado') && (
                                    <CheckCircle2 className="w-3 h-3" />
                                  )}
                                  {displayStatus === 'Cambios solicitados' && (
                                    <AlertCircle className="w-3 h-3" />
                                  )}
                                  {displayStatus === 'En revisión' && (
                                    <Clock className="w-3 h-3" />
                                  )}
                                  <span>{displayStatus}</span>
                                </span>

                                {proj.mostrarEnListaCliente === false && (
                                  <span className="text-[11px] text-neutral-400 border border-[#2A2A2A] px-2 py-0.5 rounded">
                                    Oculto en lista del cliente
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-neutral-400 font-mono">
                                {formatPrice(proj.price, proj.currency)} · /ver/{proj.id}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCopyClientLink(proj.id)}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-transparent hover:bg-white/10 border border-white text-xs font-medium text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                {copiedId === proj.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>¡Enlace copiado!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copiar enlace del cliente</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setIsCreatingNew(false);
                                  onSelectProject(proj.id);
                                  setAdminTab('proyectos');
                                }}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Editar</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })()}
          </div>
        </div>
      ) : (
        /* TAB 1: SECCIÓN "PROYECTOS" */
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
                  const isImageProj = proj.projectType === 'images';

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
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="inline-flex items-center justify-center text-neutral-400 shrink-0"
                              title={
                                isImageProj
                                  ? 'Proyecto de imágenes'
                                  : 'Proyecto de video'
                              }
                              data-testid={`admin-project-type-icon-${proj.id}`}
                            >
                              {isImageProj ? (
                                <ImageIcon className="w-3.5 h-3.5" />
                              ) : (
                                <Film className="w-3.5 h-3.5" />
                              )}
                            </span>
                            <span className="text-sm font-semibold text-white line-clamp-1">
                              {proj.title}
                            </span>
                          </div>
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
                {/* Selector de Tipo de proyecto: Video o Imágenes */}
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Tipo de proyecto
                  </label>
                  <div
                    className="grid grid-cols-2 gap-3"
                    role="radiogroup"
                    aria-label="Tipo de proyecto"
                  >
                    <button
                      type="button"
                      data-testid="project-type-video-btn"
                      onClick={() =>
                        setFormState((prev) => ({ ...prev, projectType: 'video' }))
                      }
                      className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                        formState.projectType !== 'images'
                          ? 'bg-white text-black border-white'
                          : 'bg-[#0A0A0A] text-neutral-300 border-[#2A2A2A] hover:border-white hover:text-white'
                      }`}
                    >
                      <Film className="w-4 h-4" />
                      <span>Video</span>
                    </button>

                    <button
                      type="button"
                      data-testid="project-type-images-btn"
                      onClick={() =>
                        setFormState((prev) => ({ ...prev, projectType: 'images' }))
                      }
                      className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                        formState.projectType === 'images'
                          ? 'bg-white text-black border-white'
                          : 'bg-[#0A0A0A] text-neutral-300 border-[#2A2A2A] hover:border-white hover:text-white'
                      }`}
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>Imágenes</span>
                    </button>
                  </div>
                </div>

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

                  {/* Campo "Cliente" con Autocompletado y prevención de duplicados */}
                  <div ref={clientAutocompleteRef} className="relative">
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="proj-client"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        Cliente
                      </label>
                      {formState.clientId && (
                        <span className="text-[11px] text-neutral-400">
                          Cliente vinculado
                        </span>
                      )}
                    </div>
                    <input
                      id="proj-client"
                      type="text"
                      maxLength={100}
                      required
                      autoComplete="off"
                      value={formState.clientName}
                      onFocus={() => setIsClientDropdownOpen(true)}
                      onChange={(e) => {
                        const val = e.target.value;
                        const exact = clientes.find(
                          (c) => c.name === val.trim()
                        );
                        setFormState((prev) => ({
                          ...prev,
                          clientName: val,
                          clientId: exact ? exact.id : '',
                        }));
                        setIsClientDropdownOpen(true);
                      }}
                      placeholder="Escribe o elige un cliente guardado..."
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                    />

                    {/* Autocomplete dropdown */}
                    {isClientDropdownOpen &&
                      (matchingClients.length > 0 ||
                        formState.clientName.trim().length > 0) && (
                        <div
                          className="absolute z-30 left-0 right-0 mt-1.5 bg-[#111111] border border-white rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-[#2A2A2A]"
                          data-testid="client-autocomplete-dropdown"
                        >
                          {matchingClients.map((cli) => (
                            <button
                              key={cli.id}
                              type="button"
                              data-testid={`autocomplete-client-${cli.id}`}
                              onClick={() => handleSelectExistingCliente(cli)}
                              className="w-full text-left px-3.5 py-2.5 hover:bg-white/10 flex items-center justify-between gap-2 text-xs text-white transition-colors cursor-pointer"
                            >
                              <div className="min-w-0">
                                <span className="font-semibold block truncate">
                                  {cli.name}
                                </span>
                                {cli.note && (
                                  <span className="text-[11px] text-neutral-400 block truncate">
                                    {cli.note}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-neutral-400 shrink-0">
                                Elegir
                              </span>
                            </button>
                          ))}

                          {formState.clientName.trim().length > 0 &&
                            !exactNormalizedMatch && (
                              <button
                                type="button"
                                data-testid="autocomplete-create-new-client"
                                onClick={handleQuickCreateNewClienteFromDropdown}
                                className="w-full text-left px-3.5 py-2.5 bg-[#0A0A0A] hover:bg-white/10 flex items-center gap-2 text-xs font-semibold text-white transition-colors cursor-pointer"
                              >
                                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  Crear cliente nuevo: {formState.clientName.trim()}
                                </span>
                              </button>
                            )}
                        </div>
                      )}

                    {/* Duplicate / near-duplicate warning */}
                    {similarClient && !formState.clientId && (
                      <div
                        className="mt-2 p-2.5 rounded-xl bg-[#0A0A0A] border border-white text-xs text-white flex items-center justify-between gap-2"
                        data-testid="similar-client-warning"
                      >
                        <span>
                          Ya existe un cliente similar:{' '}
                          <strong>{similarClient.name}</strong>
                        </span>
                        <button
                          type="button"
                          data-testid="use-existing-similar-client-btn"
                          onClick={() =>
                            handleSelectExistingCliente(similarClient)
                          }
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs shrink-0 cursor-pointer"
                        >
                          Usar {similarClient.name}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* VISTA PREVIA: Campo de Video (.mp4) o Enlaces de Imágenes (JPG/PNG) */}
                {formState.projectType !== 'images' ? (
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
                ) : (
                  <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl p-4 space-y-4">
                    <div className="space-y-2">
                      <label
                        htmlFor="proj-image-urls-textarea"
                        className="block text-xs font-medium text-white"
                      >
                        Enlaces de imágenes de vista previa (JPG o PNG, uno por línea)
                      </label>
                      <textarea
                        id="proj-image-urls-textarea"
                        data-testid="image-urls-textarea"
                        rows={4}
                        value={rawImageLinksText}
                        onChange={(e) => setRawImageLinksText(e.target.value)}
                        placeholder={
                          'https://.../pieza-1-preview.jpg\nhttps://.../pieza-2-preview.png'
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#111111] border border-[#2A2A2A] text-xs sm:text-sm text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-white resize-y"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-neutral-400">
                          Pega uno o varios enlaces (uno por línea) y agrégalos para ordenarlos o borrarlos.
                        </p>
                        <button
                          type="button"
                          data-testid="add-pasted-images-btn"
                          onClick={handleAddPastedImageLinks}
                          disabled={!rawImageLinksText.trim()}
                          className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-neutral-200 disabled:opacity-40 text-black text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Agregar imágenes a la lista</span>
                        </button>
                      </div>
                    </div>

                    {/* Lista ordenable y borrable de imágenes de vista previa */}
                    {formState.imageUrls.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-[#2A2A2A]">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">
                            Imágenes agregadas ({formState.imageUrls.length})
                          </span>
                          <span className="text-[11px] text-neutral-400">
                            Usa las flechas para reordenar
                          </span>
                        </div>

                        <div
                          className="space-y-2"
                          data-testid="admin-preview-images-list"
                        >
                          {formState.imageUrls.map((imgUrl, idx) => (
                            <div
                              key={`${idx}-${imgUrl}`}
                              data-testid={`admin-preview-image-row-${idx}`}
                              className="flex items-center gap-2.5 bg-[#111111] border border-[#2A2A2A] rounded-xl p-2.5"
                            >
                              <span className="font-mono tabular-nums text-xs font-semibold px-2 py-1 rounded bg-[#0A0A0A] border border-[#2A2A2A] text-white shrink-0">
                                {idx + 1}
                              </span>

                              <div className="w-10 h-10 rounded-lg bg-[#000000] border border-[#2A2A2A] overflow-hidden shrink-0 flex items-center justify-center">
                                <img
                                  src={imgUrl}
                                  alt={`Miniatura ${idx + 1}`}
                                  className="w-full h-full object-contain"
                                />
                              </div>

                              <input
                                type="url"
                                value={imgUrl}
                                onChange={(e) =>
                                  handleUpdateImageUrlAt(idx, e.target.value)
                                }
                                className="flex-1 min-w-0 min-h-[36px] px-2.5 py-1 rounded-lg bg-[#0A0A0A] border border-[#2A2A2A] text-xs text-white font-mono focus:outline-none focus:border-white"
                              />

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  data-testid={`move-image-up-${idx}`}
                                  disabled={idx === 0}
                                  onClick={() => handleMoveImage(idx, 'up')}
                                  className="w-8 h-8 rounded-lg bg-[#0A0A0A] hover:bg-white/10 disabled:opacity-30 border border-[#2A2A2A] text-white inline-flex items-center justify-center transition-colors cursor-pointer"
                                  title="Subir imagen"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  data-testid={`move-image-down-${idx}`}
                                  disabled={idx === formState.imageUrls.length - 1}
                                  onClick={() => handleMoveImage(idx, 'down')}
                                  className="w-8 h-8 rounded-lg bg-[#0A0A0A] hover:bg-white/10 disabled:opacity-30 border border-[#2A2A2A] text-white inline-flex items-center justify-center transition-colors cursor-pointer"
                                  title="Bajar imagen"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  data-testid={`remove-image-${idx}`}
                                  onClick={() => handleRemoveImage(idx)}
                                  className="w-8 h-8 rounded-lg bg-[#0A0A0A] hover:bg-white/10 border border-[#2A2A2A] hover:border-white text-neutral-300 hover:text-white inline-flex items-center justify-center transition-colors cursor-pointer"
                                  title="Borrar imagen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ENTREGA FINAL (para ambos tipos): Archivos finales con nombre visible y enlace — guardados en entregas/{projectId} */}
                <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl p-4 space-y-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-white">
                          Archivos de entrega final (sin marca de agua)
                        </h3>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          Agrega uno o varios archivos con su nombre visible y enlace (Cloudinary, archivo directo .mp4/.png/.pdf o Google Drive). Se guardan protegidos en la colección &ldquo;entregas&rdquo;.
                        </p>
                      </div>

                      <button
                        type="button"
                        data-testid="add-final-file-row-btn"
                        onClick={handleAddFinalFileRow}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Agregar archivo final</span>
                      </button>
                    </div>

                    {formState.finalFiles.length === 0 ? (
                      <div className="p-3.5 rounded-xl bg-[#111111] border border-[#2A2A2A] text-xs text-neutral-400 flex items-center justify-between gap-2">
                        <span>
                          Aún no has agregado archivos finales. Toca &ldquo;Agregar archivo final&rdquo; para añadir enlaces de entrega.
                        </span>
                      </div>
                    ) : (
                      <div
                        className="space-y-2.5"
                        data-testid="admin-final-files-list"
                      >
                        {formState.finalFiles.map((file, idx) => (
                          <div
                            key={idx}
                            data-testid={`admin-final-file-row-${idx}`}
                            className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center bg-[#111111] border border-[#2A2A2A] rounded-xl p-3"
                          >
                            <div className="sm:col-span-5 flex items-center gap-2">
                              <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
                              <input
                                type="text"
                                maxLength={140}
                                data-testid={`final-file-name-input-${idx}`}
                                value={file.name}
                                onChange={(e) =>
                                  handleUpdateFinalFileRow(
                                    idx,
                                    'name',
                                    e.target.value
                                  )
                                }
                                placeholder="Nombre visible (ej. Diseño final.pdf, Pieza 1.png)"
                                className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[#0A0A0A] border border-[#2A2A2A] text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                              />
                            </div>

                            <div className="sm:col-span-6">
                              <input
                                type="url"
                                maxLength={500}
                                data-testid={`final-file-url-input-${idx}`}
                                value={file.url}
                                onChange={(e) =>
                                  handleUpdateFinalFileRow(
                                    idx,
                                    'url',
                                    e.target.value
                                  )
                                }
                                placeholder="Enlace (Cloudinary, .mp4, Google Drive...)"
                                className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[#0A0A0A] border border-[#2A2A2A] text-xs text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-white"
                              />
                            </div>

                            <div className="sm:col-span-1 flex justify-end">
                              <button
                                type="button"
                                data-testid={`remove-final-file-btn-${idx}`}
                                onClick={() => handleRemoveFinalFileRow(idx)}
                                className="w-9 h-9 rounded-lg bg-[#0A0A0A] hover:bg-white/10 border border-[#2A2A2A] hover:border-white text-neutral-300 hover:text-white inline-flex items-center justify-center transition-colors cursor-pointer"
                                title="Eliminar archivo final"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
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
                        Visible en la página y tarjetas del proyecto
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
                        Superpone texto blanco semitransparente
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

                  {/* Interruptor "Mostrar en la lista del cliente" (encendido por defecto) */}
                  <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] cursor-pointer">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-white">
                        Mostrar en la lista del cliente
                      </span>
                      <p className="text-xs text-neutral-400">
                        Aparece en &ldquo;Más proyectos&rdquo; del cliente
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      data-testid="toggle-show-in-client-list"
                      checked={formState.mostrarEnListaCliente}
                      onChange={(e) =>
                        setFormState((prev) => ({
                          ...prev,
                          mostrarEnListaCliente: e.target.checked,
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
                      {selectedProject.projectType === 'images'
                        ? 'Marca los comentarios como resueltos a medida que apliques los cambios en cada imagen'
                        : 'Marca los comentarios como resueltos a medida que apliques los cambios en el video'}
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
                            {selectedProject.projectType === 'images'
                              ? `Imagen ${c.imageNumber || 1}`
                              : formatVideoTimestamp(c.videoSecond)}
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
      )}
    </div>
  );
};
