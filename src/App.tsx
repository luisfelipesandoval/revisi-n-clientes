import React, { useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  formatReadableFirestoreError,
  OperationType,
} from './firebase';
import {
  Cliente,
  DisplayProjectStatus,
  FinalDeliveryFile,
  Project,
  ProjectFormInput,
  ProjectStatus,
  ProjectType,
  VideoComment,
  VisibleProjectSummary,
} from './types';
import {
  isAuthorizedAdminUser,
  generateSecureProjectId,
  parseRoutePath,
  AppRoute,
  normalizeClientName,
  buildVisibleProjectsSummary,
} from './utils/validation';
import { formatFinalVideoFilename } from './utils/video';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ClientReviewView } from './components/ClientReviewView';
import { ClientPortalView } from './components/ClientPortalView';
import { AdminDashboardView } from './components/AdminDashboardView';

function toDate(val: unknown): Date {
  if (val instanceof Timestamp) {
    return val.toDate();
  }
  if (val instanceof Date) {
    return val;
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function parseFinalFilesArray(
  raw: unknown,
  fallbackVideoUrl?: string,
  fallbackProjectTitle?: string
): FinalDeliveryFile[] {
  if (Array.isArray(raw)) {
    const parsed: FinalDeliveryFile[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const name = String(obj.name || '').trim();
      const url = String(obj.url || '').trim();
      if (!url) continue;
      parsed.push({
        name: name || `Archivo final ${parsed.length + 1}`,
        url,
      });
    }
    if (parsed.length > 0) return parsed;
  }
  const cleanFallbackUrl = String(fallbackVideoUrl || '').trim();
  if (cleanFallbackUrl) {
    return [
      {
        name: formatFinalVideoFilename(fallbackProjectTitle || 'video'),
        url: cleanFallbackUrl,
      },
    ];
  }
  return [];
}

function parseVisibleProjectsArray(raw: unknown): VisibleProjectSummary[] {
  if (!Array.isArray(raw)) return [];
  const result: VisibleProjectSummary[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const id = String(obj.id || '').trim();
    const title = String(obj.title || '').trim();
    if (!id || !title) continue;
    const rawStatus = String(obj.status || 'En revisión');
    const status: DisplayProjectStatus =
      rawStatus === 'Entregado' ||
      rawStatus === 'Aprobado' ||
      rawStatus === 'Cambios solicitados'
        ? rawStatus
        : 'En revisión';
    const showPrice = Boolean(obj.showPrice);
    const currency = obj.currency === '$' ? '$' : 'S/';
    const projectType: ProjectType =
      obj.projectType === 'images' ? 'images' : 'video';
    const summary: VisibleProjectSummary = {
      id,
      title,
      status,
      showPrice,
      currency,
      projectType,
    };
    if (showPrice && typeof obj.price === 'number' && Number.isFinite(obj.price)) {
      summary.price = obj.price;
    }
    result.push(summary);
  }
  return result;
}

export function AppContent() {
  const [route] = useState<AppRoute>(() =>
    parseRoutePath(window.location.pathname)
  );

  // Admin Zone State (only used when route.view === 'admin')
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [unauthorizedDenied, setUnauthorizedDenied] = useState<boolean>(false);
  const [adminProjects, setAdminProjects] = useState<Project[]>([]);
  const [adminProjectsLoaded, setAdminProjectsLoaded] = useState<boolean>(false);
  const [adminClientes, setAdminClientes] = useState<Cliente[]>([]);
  const [adminClientesLoaded, setAdminClientesLoaded] = useState<boolean>(false);
  const [selectedAdminProjectId, setSelectedAdminProjectId] = useState<
    string | null
  >(null);
  const [adminSelectedFinalVideoUrl, setAdminSelectedFinalVideoUrl] =
    useState<string>('');
  const [adminSelectedFinalFiles, setAdminSelectedFinalFiles] = useState<
    FinalDeliveryFile[]
  >([]);
  const [adminComments, setAdminComments] = useState<VideoComment[]>([]);
  const [adminFirestoreError, setAdminFirestoreError] = useState<string | null>(
    null
  );

  // Client Project Page State (only used when route.view === 'client')
  const [clientProject, setClientProject] = useState<Project | null>(null);
  const [clientOtherProjects, setClientOtherProjects] = useState<
    VisibleProjectSummary[]
  >([]);
  const [clientFinalVideoUrl, setClientFinalVideoUrl] = useState<string | null>(
    null
  );
  const [clientFinalFiles, setClientFinalFiles] = useState<FinalDeliveryFile[]>(
    []
  );
  const [clientComments, setClientComments] = useState<VideoComment[]>([]);
  const [loadingClientProject, setLoadingClientProject] =
    useState<boolean>(true);
  const [clientLinkInvalid, setClientLinkInvalid] = useState<boolean>(false);
  const [clientFirestoreError, setClientFirestoreError] = useState<
    string | null
  >(null);

  // Client Portal Page State (only used when route.view === 'client-portal')
  const [portalCliente, setPortalCliente] = useState<Cliente | null>(null);
  const [loadingPortalCliente, setLoadingPortalCliente] =
    useState<boolean>(true);
  const [portalLinkInvalid, setPortalLinkInvalid] = useState<boolean>(false);
  const [portalFirestoreError, setPortalFirestoreError] = useState<
    string | null
  >(null);

  // Prevent concurrent automatic migrations
  const isMigratingRef = useRef<boolean>(false);

  // 1) ADMIN ZONE AUTH & DATA ("/")
  useEffect(() => {
    if (route.view !== 'admin') return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user && !isAuthorizedAdminUser(user)) {
        // Any account other than chat.gpt.sandoval@gmail.com sees "Sin acceso" and is signed out immediately
        setUnauthorizedDenied(true);
        setCurrentUser(null);
        setAuthReady(true);
        await signOut(auth);
        return;
      }
      if (user && isAuthorizedAdminUser(user)) {
        setUnauthorizedDenied(false);
      }
      setCurrentUser(user);
      setAuthReady(true);
    });

    return () => unsub();
  }, [route.view]);

  const isRealAdmin =
    route.view === 'admin' && authReady && isAuthorizedAdminUser(currentUser);

  // Listen to all projects in Firestore when Admin is signed in
  useEffect(() => {
    if (!isRealAdmin) {
      setAdminProjects([]);
      setAdminProjectsLoaded(false);
      return;
    }

    setAdminFirestoreError(null);
    const unsub = onSnapshot(
      collection(db, 'projects'),
      (snap) => {
        setAdminFirestoreError(null);
        const list: Project[] = snap.docs.map((d) => {
          const data = d.data();
          const projectType: ProjectType =
            data.projectType === 'images' ? 'images' : 'video';
          const imageUrls = Array.isArray(data.imageUrls)
            ? data.imageUrls.map((u: unknown) => String(u || '').trim()).filter(Boolean)
            : [];
          const finalFileNames = Array.isArray(data.finalFileNames)
            ? data.finalFileNames
                .map((n: unknown) => String(n || '').trim())
                .filter(Boolean)
            : [];
          return {
            id: d.id,
            title: String(data.title || ''),
            clientName: String(data.clientName || ''),
            clientId: String(data.clientId || ''),
            mostrarEnListaCliente:
              data.mostrarEnListaCliente === undefined
                ? true
                : Boolean(data.mostrarEnListaCliente),
            projectType,
            videoUrl: String(data.videoUrl || ''),
            imageUrls,
            finalFileNames,
            price: Number(data.price || 0),
            currency: data.currency === '$' ? '$' : 'S/',
            showPrice: Boolean(data.showPrice),
            watermarkEnabled: Boolean(data.watermarkEnabled),
            watermarkText: String(data.watermarkText || ''),
            status:
              data.status === 'Aprobado' || data.status === 'Cambios solicitados'
                ? data.status
                : 'En revisión',
            whatsappNumber: String(data.whatsappNumber || ''),
            descargaHabilitada: Boolean(data.descargaHabilitada),
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
          };
        });
        list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        setAdminProjects(list);
        setAdminProjectsLoaded(true);
        setSelectedAdminProjectId((prev) =>
          prev && list.some((p) => p.id === prev)
            ? prev
            : list[0]?.id || null
        );
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'projects');
        } catch (formattedErr) {
          setAdminFirestoreError(formatReadableFirestoreError(formattedErr));
        }
      }
    );

    return () => unsub();
  }, [isRealAdmin]);

  // Listen to all saved clients in Firestore when Admin is signed in
  useEffect(() => {
    if (!isRealAdmin) {
      setAdminClientes([]);
      setAdminClientesLoaded(false);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'clientes'),
      (snap) => {
        const list: Cliente[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name || ''),
            note: String(data.note || ''),
            visibleProjects: parseVisibleProjectsArray(data.visibleProjects),
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
          };
        });
        list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        setAdminClientes(list);
        setAdminClientesLoaded(true);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'clientes');
        } catch (formattedErr) {
          setAdminFirestoreError(formatReadableFirestoreError(formattedErr));
        }
      }
    );

    return () => unsub();
  }, [isRealAdmin]);

  // Automatic migration of existing projects without clientId + synchronization of visibleProjects summary
  useEffect(() => {
    if (
      !isRealAdmin ||
      !adminProjectsLoaded ||
      !adminClientesLoaded ||
      isMigratingRef.current
    ) {
      return;
    }

    const runMigrationAndSync = async () => {
      isMigratingRef.current = true;
      try {
        const clientById = new Map<string, Cliente>();
        const clientByNormName = new Map<string, Cliente>();
        for (const c of adminClientes) {
          clientById.set(c.id, c);
          clientByNormName.set(normalizeClientName(c.name), c);
        }

        const updatedProjects: Project[] = [...adminProjects];
        const newlyCreatedClients: Cliente[] = [];

        // 1) Migrate any existing project that does not have a valid clientId
        for (let i = 0; i < updatedProjects.length; i++) {
          const proj = updatedProjects[i];
          const trimmedName = proj.clientName.trim();
          if (!trimmedName) continue;

          if (proj.clientId && clientById.has(proj.clientId)) {
            continue;
          }

          const normName = normalizeClientName(trimmedName);
          let targetClient = clientByNormName.get(normName);

          if (!targetClient) {
            const newClienteId = generateSecureProjectId(28);
            const now = new Date();
            targetClient = {
              id: newClienteId,
              name: trimmedName.slice(0, 100),
              note: '',
              visibleProjects: [],
              createdAt: now,
              updatedAt: now,
            };
            await setDoc(doc(db, 'clientes', newClienteId), {
              name: targetClient.name,
              note: '',
              visibleProjects: [],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            clientById.set(targetClient.id, targetClient);
            clientByNormName.set(normName, targetClient);
            newlyCreatedClients.push(targetClient);
          }

          const updatedProj: Project = {
            ...proj,
            clientId: targetClient.id,
            clientName: targetClient.name,
            mostrarEnListaCliente: proj.mostrarEnListaCliente !== false,
          };
          updatedProjects[i] = updatedProj;

          await updateDoc(doc(db, 'projects', proj.id), {
            clientId: targetClient.id,
            clientName: targetClient.name,
            mostrarEnListaCliente: updatedProj.mostrarEnListaCliente,
            updatedAt: serverTimestamp(),
          });
        }

        // 2) Keep visibleProjects summary in sync on every client document
        const allClients = [...adminClientes, ...newlyCreatedClients];
        for (const cli of allClients) {
          const expectedSummary = buildVisibleProjectsSummary(
            updatedProjects,
            cli.id
          );
          const currentJson = JSON.stringify(cli.visibleProjects || []);
          const expectedJson = JSON.stringify(expectedSummary);
          if (currentJson !== expectedJson) {
            await updateDoc(doc(db, 'clientes', cli.id), {
              name: cli.name,
              note: cli.note || '',
              visibleProjects: expectedSummary,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (err) {
        // Non-fatal sync error; surface if needed
        console.error('Migration/Sync error:', err);
      } finally {
        isMigratingRef.current = false;
      }
    };

    runMigrationAndSync();
  }, [
    isRealAdmin,
    adminProjectsLoaded,
    adminClientesLoaded,
    adminProjects,
    adminClientes,
  ]);

  // Listen to entregas/{selectedAdminProjectId} in Admin Zone so Admin can view/edit finalFiles & finalVideoUrl
  useEffect(() => {
    if (!isRealAdmin || !selectedAdminProjectId) {
      setAdminSelectedFinalVideoUrl('');
      setAdminSelectedFinalFiles([]);
      return;
    }

    const currentProj = adminProjects.find(
      (p) => p.id === selectedAdminProjectId
    );
    const entregaPath = `entregas/${selectedAdminProjectId}`;
    const unsub = onSnapshot(
      doc(db, 'entregas', selectedAdminProjectId),
      (snap) => {
        if (!snap.exists()) {
          setAdminSelectedFinalVideoUrl('');
          setAdminSelectedFinalFiles([]);
          return;
        }
        const data = snap.data();
        const rawFinalVideoUrl = String(data.finalVideoUrl || '');
        setAdminSelectedFinalVideoUrl(rawFinalVideoUrl);
        setAdminSelectedFinalFiles(
          parseFinalFilesArray(
            data.finalFiles,
            rawFinalVideoUrl,
            currentProj?.title
          )
        );
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, entregaPath);
        } catch (formattedErr) {
          setAdminFirestoreError(formatReadableFirestoreError(formattedErr));
        }
      }
    );

    return () => unsub();
  }, [isRealAdmin, selectedAdminProjectId, adminProjects]);

  // Listen to comments for the selected project in Admin Zone
  useEffect(() => {
    if (!isRealAdmin || !selectedAdminProjectId) {
      setAdminComments([]);
      return;
    }

    const q = query(
      collection(db, 'comments'),
      where('projectId', '==', selectedAdminProjectId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: VideoComment[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            projectId: String(data.projectId || selectedAdminProjectId),
            authorName: String(data.authorName || 'Cliente'),
            text: String(data.text || ''),
            videoSecond: Number(data.videoSecond || 0),
            imageNumber:
              typeof data.imageNumber === 'number'
                ? data.imageNumber
                : undefined,
            createdAt: toDate(data.createdAt),
            resolved: Boolean(data.resolved),
          };
        });
        setAdminComments(list);
      },
      (error) => {
        try {
          handleFirestoreError(
            error,
            OperationType.LIST,
            `comments?projectId=${selectedAdminProjectId}`
          );
        } catch (formattedErr) {
          setAdminFirestoreError(formatReadableFirestoreError(formattedErr));
        }
      }
    );

    return () => unsub();
  }, [isRealAdmin, selectedAdminProjectId]);

  // 2) INDEPENDENT CLIENT PROJECT PAGE ("/ver/ID_DEL_PROYECTO")
  useEffect(() => {
    if (route.view !== 'client') return;
    const { projectId } = route;

    setLoadingClientProject(true);
    setClientLinkInvalid(false);
    setClientFirestoreError(null);

    const projectPath = `projects/${projectId}`;
    const unsubProject = onSnapshot(
      doc(db, 'projects', projectId),
      (snap) => {
        setLoadingClientProject(false);
        if (!snap.exists()) {
          setClientProject(null);
          setClientLinkInvalid(true);
          return;
        }
        const data = snap.data();
        const projectType: ProjectType =
          data.projectType === 'images' ? 'images' : 'video';
        const imageUrls = Array.isArray(data.imageUrls)
          ? data.imageUrls.map((u: unknown) => String(u || '').trim()).filter(Boolean)
          : [];
        const finalFileNames = Array.isArray(data.finalFileNames)
          ? data.finalFileNames
              .map((n: unknown) => String(n || '').trim())
              .filter(Boolean)
          : [];
        setClientProject({
          id: snap.id,
          title: String(data.title || ''),
          clientName: String(data.clientName || ''),
          clientId: String(data.clientId || ''),
          mostrarEnListaCliente:
            data.mostrarEnListaCliente === undefined
              ? true
              : Boolean(data.mostrarEnListaCliente),
          projectType,
          videoUrl: String(data.videoUrl || ''),
          imageUrls,
          finalFileNames,
          price: Number(data.price || 0),
          currency: data.currency === '$' ? '$' : 'S/',
          showPrice: Boolean(data.showPrice),
          watermarkEnabled: Boolean(data.watermarkEnabled),
          watermarkText: String(data.watermarkText || ''),
          status:
            data.status === 'Aprobado' || data.status === 'Cambios solicitados'
              ? data.status
              : 'En revisión',
          whatsappNumber: String(data.whatsappNumber || ''),
          descargaHabilitada: Boolean(data.descargaHabilitada),
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        });
        setClientLinkInvalid(false);
      },
      (error) => {
        setLoadingClientProject(false);
        try {
          handleFirestoreError(error, OperationType.GET, projectPath);
        } catch (formattedErr) {
          setClientFirestoreError(formatReadableFirestoreError(formattedErr));
        }
      }
    );

    const commentsQuery = query(
      collection(db, 'comments'),
      where('projectId', '==', projectId)
    );
    const unsubComments = onSnapshot(
      commentsQuery,
      (snap) => {
        const list: VideoComment[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            projectId: String(data.projectId || projectId),
            authorName: String(data.authorName || 'Cliente'),
            text: String(data.text || ''),
            videoSecond: Number(data.videoSecond || 0),
            imageNumber:
              typeof data.imageNumber === 'number'
                ? data.imageNumber
                : undefined,
            createdAt: toDate(data.createdAt),
            resolved: Boolean(data.resolved),
          };
        });
        setClientComments(list);
      },
      (error) => {
        try {
          handleFirestoreError(
            error,
            OperationType.LIST,
            `comments?projectId=${projectId}`
          );
        } catch (formattedErr) {
          setClientFirestoreError(formatReadableFirestoreError(formattedErr));
        }
      }
    );

    return () => {
      unsubProject();
      unsubComments();
    };
  }, [route]);

  // Read clientes/{clientProject.clientId} with a single document GET (no collection scan on projects!)
  useEffect(() => {
    if (route.view !== 'client' || !clientProject?.clientId) {
      setClientOtherProjects([]);
      return;
    }

    const clienteId = clientProject.clientId;
    const unsubCliente = onSnapshot(
      doc(db, 'clientes', clienteId),
      (snap) => {
        if (!snap.exists()) {
          setClientOtherProjects([]);
          return;
        }
        const data = snap.data();
        setClientOtherProjects(parseVisibleProjectsArray(data.visibleProjects));
      },
      () => {
        setClientOtherProjects([]);
      }
    );

    return () => unsubCliente();
  }, [route, clientProject?.clientId]);

  // SECURITY: While descargaHabilitada is false, the client page NEVER queries or loads entregas/{projectId}
  useEffect(() => {
    if (route.view !== 'client' || !clientProject || !clientProject.descargaHabilitada) {
      setClientFinalVideoUrl(null);
      setClientFinalFiles([]);
      return;
    }

    const entregaPath = `entregas/${clientProject.id}`;
    const unsubEntrega = onSnapshot(
      doc(db, 'entregas', clientProject.id),
      (snap) => {
        if (!snap.exists()) {
          setClientFinalVideoUrl(null);
          setClientFinalFiles([]);
          return;
        }
        const data = snap.data();
        const url = String(data.finalVideoUrl || '').trim();
        setClientFinalVideoUrl(url || null);
        setClientFinalFiles(
          parseFinalFilesArray(data.finalFiles, url, clientProject.title)
        );
      },
      (error) => {
        setClientFinalVideoUrl(null);
        setClientFinalFiles([]);
        try {
          handleFirestoreError(error, OperationType.GET, entregaPath);
        } catch (formattedErr) {
          setClientFirestoreError(formatReadableFirestoreError(formattedErr));
        }
      }
    );

    return () => unsubEntrega();
  }, [route, clientProject?.id, clientProject?.descargaHabilitada, clientProject?.title]);

  // 3) INDEPENDENT CLIENT PORTAL PAGE ("/cliente/ID_DEL_CLIENTE")
  useEffect(() => {
    if (route.view !== 'client-portal') return;
    const { clientId } = route;

    setLoadingPortalCliente(true);
    setPortalLinkInvalid(false);
    setPortalFirestoreError(null);

    const clientePath = `clientes/${clientId}`;
    const unsub = onSnapshot(
      doc(db, 'clientes', clientId),
      (snap) => {
        setLoadingPortalCliente(false);
        if (!snap.exists()) {
          setPortalCliente(null);
          setPortalLinkInvalid(true);
          return;
        }
        const data = snap.data();
        setPortalCliente({
          id: snap.id,
          name: String(data.name || ''),
          note: String(data.note || ''),
          visibleProjects: parseVisibleProjectsArray(data.visibleProjects),
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        });
        setPortalLinkInvalid(false);
      },
      (error) => {
        setLoadingPortalCliente(false);
        try {
          handleFirestoreError(error, OperationType.GET, clientePath);
        } catch (formattedErr) {
          setPortalFirestoreError(formatReadableFirestoreError(formattedErr));
        }
      }
    );

    return () => unsub();
  }, [route]);

  // Client Actions (Firestore Only)
  const handleClientUpdateStatus = async (newStatus: ProjectStatus) => {
    if (route.view !== 'client') return;
    if (clientProject?.descargaHabilitada) {
      throw new Error(
        'La descarga ya fue habilitada y el estado del proyecto quedó fijo en Aprobado.'
      );
    }
    const path = `projects/${route.projectId}`;
    try {
      await updateDoc(doc(db, 'projects', route.projectId), {
        status: newStatus,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleClientAddComment = async (payload: {
    authorName: string;
    text: string;
    videoSecond: number;
    imageNumber?: number;
  }) => {
    if (route.view !== 'client') return;
    const safeAuthor = payload.authorName.trim().slice(0, 80);
    const safeText = payload.text.trim().slice(0, 1000);
    const safeSecond = Math.max(
      0,
      Math.min(86400, Math.floor(payload.videoSecond))
    );
    const safeImageNumber =
      typeof payload.imageNumber === 'number' &&
      Number.isFinite(payload.imageNumber)
        ? Math.max(1, Math.min(500, Math.floor(payload.imageNumber)))
        : undefined;

    const commentId = generateSecureProjectId(24);
    const path = `comments/${commentId}`;
    try {
      await setDoc(doc(db, 'comments', commentId), {
        projectId: route.projectId,
        authorName: safeAuthor,
        text: safeText,
        videoSecond: safeSecond,
        ...(safeImageNumber ? { imageNumber: safeImageNumber } : {}),
        createdAt: serverTimestamp(),
        resolved: false,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  // Admin Actions (Firestore Only)
  const handleSignInGoogle = async () => {
    setUnauthorizedDenied(false);
    const cred = await signInWithPopup(auth, googleProvider);
    if (cred.user && !isAuthorizedAdminUser(cred.user)) {
      setUnauthorizedDenied(true);
      await signOut(auth);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const ensureActiveAdminSession = () => {
    const activeUser = auth.currentUser;
    if (!activeUser || !isAuthorizedAdminUser(activeUser)) {
      throw new Error(
        'La sesión de Google no está activa o no corresponde al correo de administrador autorizado.'
      );
    }
  };

  // Admin: Create or update saved Cliente
  const handleAdminCreateCliente = async (
    name: string,
    note: string
  ): Promise<Cliente> => {
    ensureActiveAdminSession();
    setAdminFirestoreError(null);

    const safeName = name.trim().slice(0, 100);
    const safeNote = note.trim().slice(0, 500);
    const existing = adminClientes.find(
      (c) => normalizeClientName(c.name) === normalizeClientName(safeName)
    );
    if (existing) {
      return existing;
    }

    const newClienteId = generateSecureProjectId(28);
    const path = `clientes/${newClienteId}`;
    const visibleSummary = buildVisibleProjectsSummary(
      adminProjects,
      newClienteId
    );

    try {
      await setDoc(doc(db, 'clientes', newClienteId), {
        name: safeName,
        note: safeNote,
        visibleProjects: visibleSummary,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const now = new Date();
      const created: Cliente = {
        id: newClienteId,
        name: safeName,
        note: safeNote,
        visibleProjects: visibleSummary,
        createdAt: now,
        updatedAt: now,
      };
      setAdminClientes((prev) =>
        prev.some((c) => c.id === newClienteId) ? prev : [...prev, created]
      );
      return created;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleAdminUpdateCliente = async (
    clienteId: string,
    name: string,
    note: string
  ) => {
    ensureActiveAdminSession();
    setAdminFirestoreError(null);

    const safeName = name.trim().slice(0, 100);
    const safeNote = note.trim().slice(0, 500);
    const path = `clientes/${clienteId}`;
    const visibleSummary = buildVisibleProjectsSummary(
      adminProjects,
      clienteId
    );

    try {
      await updateDoc(doc(db, 'clientes', clienteId), {
        name: safeName,
        note: safeNote,
        visibleProjects: visibleSummary,
        updatedAt: serverTimestamp(),
      });

      // Also update clientName on all projects linked to this clienteId
      const linkedProjects = adminProjects.filter(
        (p) => p.clientId === clienteId && p.clientName !== safeName
      );
      for (const proj of linkedProjects) {
        await updateDoc(doc(db, 'projects', proj.id), {
          clientName: safeName,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleAdminDeleteCliente = async (clienteId: string) => {
    ensureActiveAdminSession();
    setAdminFirestoreError(null);

    const path = `clientes/${clienteId}`;
    try {
      await deleteDoc(doc(db, 'clientes', clienteId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  // Resolve or create a Cliente record for a project form submission
  const resolveOrCreateClienteForProject = async (
    input: ProjectFormInput
  ): Promise<{ clientId: string; clientName: string }> => {
    const trimmedName = input.clientName.trim().slice(0, 100);
    if (input.clientId) {
      const byId = adminClientes.find((c) => c.id === input.clientId);
      if (byId) {
        return { clientId: byId.id, clientName: byId.name };
      }
    }

    const byNorm = adminClientes.find(
      (c) => normalizeClientName(c.name) === normalizeClientName(trimmedName)
    );
    if (byNorm) {
      return { clientId: byNorm.id, clientName: byNorm.name };
    }

    const created = await handleAdminCreateCliente(
      trimmedName,
      input.clientNote || ''
    );
    return { clientId: created.id, clientName: created.name };
  };

  const syncClienteSummary = async (
    clienteId: string,
    projectsList: Project[]
  ) => {
    if (!clienteId) return;
    const targetCliente = adminClientes.find((c) => c.id === clienteId);
    const summary = buildVisibleProjectsSummary(projectsList, clienteId);
    await updateDoc(doc(db, 'clientes', clienteId), {
      ...(targetCliente
        ? { name: targetCliente.name, note: targetCliente.note || '' }
        : {}),
      visibleProjects: summary,
      updatedAt: serverTimestamp(),
    });
  };

  const handleAdminCreateProject = async (
    input: ProjectFormInput
  ): Promise<string> => {
    ensureActiveAdminSession();
    setAdminFirestoreError(null);

    const { clientId, clientName } =
      await resolveOrCreateClienteForProject(input);

    // Cryptographically random code of 28 characters (>= 20 chars requirement)
    const newId = generateSecureProjectId(28);
    const path = `projects/${newId}`;

    const projectType: ProjectType =
      input.projectType === 'images' ? 'images' : 'video';
    const cleanImageUrls = (input.imageUrls || [])
      .map((u) => u.trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, 200);
    const cleanFinalFiles: FinalDeliveryFile[] = (input.finalFiles || [])
      .map((f, idx) => ({
        name: (f.name.trim() || `Archivo final ${idx + 1}`).slice(0, 140),
        url: f.url.trim().slice(0, 500),
      }))
      .filter((f) => Boolean(f.url))
      .slice(0, 100);
    const cleanFinalFileNames = cleanFinalFiles.map((f) => f.name);

    const sanitized = {
      title: input.title.trim().slice(0, 120),
      clientName,
      clientId,
      mostrarEnListaCliente: input.mostrarEnListaCliente !== false,
      projectType,
      videoUrl:
        projectType === 'video' ? input.videoUrl.trim().slice(0, 500) : '',
      imageUrls: projectType === 'images' ? cleanImageUrls : [],
      finalFileNames: cleanFinalFileNames,
      price: Math.max(0, Number(input.price) || 0),
      currency: input.currency,
      showPrice: Boolean(input.showPrice),
      watermarkEnabled: Boolean(input.watermarkEnabled),
      watermarkText: input.watermarkText.trim().slice(0, 100),
      status: input.status,
      whatsappNumber: input.whatsappNumber.trim().slice(0, 30),
      descargaHabilitada: Boolean(input.descargaHabilitada),
    };

    const sanitizedFinalVideoUrl = (
      cleanFinalFiles[0]?.url ||
      input.finalVideoUrl ||
      ''
    )
      .trim()
      .slice(0, 500);

    try {
      await setDoc(doc(db, 'projects', newId), {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'entregas', newId), {
        finalVideoUrl: sanitizedFinalVideoUrl,
        finalFiles: cleanFinalFiles,
        updatedAt: serverTimestamp(),
      });

      const now = new Date();
      const createdProject: Project = {
        id: newId,
        ...sanitized,
        createdAt: now,
        updatedAt: now,
      };

      const nextProjects = [
        createdProject,
        ...adminProjects.filter((p) => p.id !== newId),
      ];

      await syncClienteSummary(clientId, nextProjects);

      // Ensure immediate appearance in the admin list while onSnapshot syncs
      setAdminProjects(nextProjects);
      setSelectedAdminProjectId(newId);
      setAdminSelectedFinalVideoUrl(sanitizedFinalVideoUrl);
      setAdminSelectedFinalFiles(cleanFinalFiles);
      return newId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleAdminUpdateProject = async (
    projectId: string,
    input: ProjectFormInput
  ) => {
    ensureActiveAdminSession();
    setAdminFirestoreError(null);

    const existingProj = adminProjects.find((p) => p.id === projectId);
    const previousClientId = existingProj?.clientId || '';

    const { clientId, clientName } =
      await resolveOrCreateClienteForProject(input);

    const projectType: ProjectType =
      input.projectType === 'images' ? 'images' : 'video';
    const cleanImageUrls = (input.imageUrls || [])
      .map((u) => u.trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, 200);
    const cleanFinalFiles: FinalDeliveryFile[] = (input.finalFiles || [])
      .map((f, idx) => ({
        name: (f.name.trim() || `Archivo final ${idx + 1}`).slice(0, 140),
        url: f.url.trim().slice(0, 500),
      }))
      .filter((f) => Boolean(f.url))
      .slice(0, 100);
    const cleanFinalFileNames = cleanFinalFiles.map((f) => f.name);

    const path = `projects/${projectId}`;
    const sanitized = {
      title: input.title.trim().slice(0, 120),
      clientName,
      clientId,
      mostrarEnListaCliente: input.mostrarEnListaCliente !== false,
      projectType,
      videoUrl:
        projectType === 'video' ? input.videoUrl.trim().slice(0, 500) : '',
      imageUrls: projectType === 'images' ? cleanImageUrls : [],
      finalFileNames: cleanFinalFileNames,
      price: Math.max(0, Number(input.price) || 0),
      currency: input.currency,
      showPrice: Boolean(input.showPrice),
      watermarkEnabled: Boolean(input.watermarkEnabled),
      watermarkText: input.watermarkText.trim().slice(0, 100),
      status: input.status,
      whatsappNumber: input.whatsappNumber.trim().slice(0, 30),
      descargaHabilitada: Boolean(input.descargaHabilitada),
    };

    const sanitizedFinalVideoUrl = (
      cleanFinalFiles[0]?.url ||
      input.finalVideoUrl ||
      ''
    )
      .trim()
      .slice(0, 500);

    try {
      await updateDoc(doc(db, 'projects', projectId), {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'entregas', projectId), {
        finalVideoUrl: sanitizedFinalVideoUrl,
        finalFiles: cleanFinalFiles,
        updatedAt: serverTimestamp(),
      });

      const now = new Date();
      const nextProjects = adminProjects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              ...sanitized,
              updatedAt: now,
            }
          : p
      );

      await syncClienteSummary(clientId, nextProjects);
      if (previousClientId && previousClientId !== clientId) {
        await syncClienteSummary(previousClientId, nextProjects);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleAdminDeleteProject = async (projectId: string) => {
    ensureActiveAdminSession();
    setAdminFirestoreError(null);

    const targetProj = adminProjects.find((p) => p.id === projectId);
    const path = `projects/${projectId}`;
    try {
      const q = query(
        collection(db, 'comments'),
        where('projectId', '==', projectId)
      );
      const snap = await getDocs(q);
      for (const commentDoc of snap.docs) {
        await deleteDoc(doc(db, 'comments', commentDoc.id));
      }
      await deleteDoc(doc(db, 'entregas', projectId));
      await deleteDoc(doc(db, 'projects', projectId));

      const remainingProjects = adminProjects.filter((p) => p.id !== projectId);
      if (targetProj?.clientId) {
        await syncClienteSummary(targetProj.clientId, remainingProjects);
      }

      const nextProj = remainingProjects[0];
      setSelectedAdminProjectId(nextProj ? nextProj.id : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleAdminToggleCommentResolved = async (
    commentId: string,
    currentResolved: boolean
  ) => {
    ensureActiveAdminSession();
    setAdminFirestoreError(null);

    const path = `comments/${commentId}`;
    try {
      await updateDoc(doc(db, 'comments', commentId), {
        resolved: !currentResolved,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  // RENDER 1: Invalid Link or non-existent project/client -> Simple "Enlace no válido"
  if (
    route.view === 'invalid-client-link' ||
    (route.view === 'client' &&
      !loadingClientProject &&
      !clientFirestoreError &&
      (clientLinkInvalid || !clientProject)) ||
    (route.view === 'client-portal' &&
      !loadingPortalCliente &&
      !portalFirestoreError &&
      (portalLinkInvalid || !portalCliente))
  ) {
    return (
      <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center p-6">
        <p
          className="text-base font-medium text-neutral-300"
          data-testid="invalid-link-message"
        >
          Enlace no válido
        </p>
      </div>
    );
  }

  // RENDER 2: Independent Client Portal Page (/cliente/ID_DEL_CLIENTE)
  if (route.view === 'client-portal') {
    if (loadingPortalCliente) {
      return (
        <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center p-6">
          <p className="text-sm text-neutral-400">Cargando...</p>
        </div>
      );
    }

    if (portalFirestoreError && !portalCliente) {
      return (
        <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#111111] border border-white rounded-2xl p-6 text-xs text-white">
            {portalFirestoreError}
          </div>
        </div>
      );
    }

    if (!portalCliente) {
      return (
        <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center p-6">
          <p
            className="text-base font-medium text-neutral-300"
            data-testid="invalid-link-message"
          >
            Enlace no válido
          </p>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#000000] text-white">
        <main>
          <ClientPortalView
            cliente={portalCliente}
            firestoreError={portalFirestoreError}
          />
        </main>
      </div>
    );
  }

  // RENDER 3: Independent Client Project Page (/ver/ID_DEL_PROYECTO)
  if (route.view === 'client') {
    if (loadingClientProject) {
      return (
        <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center p-6">
          <p className="text-sm text-neutral-400">Cargando...</p>
        </div>
      );
    }

    if (clientFirestoreError && !clientProject) {
      return (
        <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#111111] border border-white rounded-2xl p-6 text-xs text-white">
            {clientFirestoreError}
          </div>
        </div>
      );
    }

    if (!clientProject) {
      return (
        <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center p-6">
          <p
            className="text-base font-medium text-neutral-300"
            data-testid="invalid-link-message"
          >
            Enlace no válido
          </p>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#000000] text-white">
        <main>
          <ClientReviewView
            project={clientProject}
            comments={clientComments}
            otherClientProjects={clientOtherProjects}
            finalVideoUrl={
              clientProject.descargaHabilitada ? clientFinalVideoUrl : null
            }
            finalFiles={
              clientProject.descargaHabilitada ? clientFinalFiles : []
            }
            firestoreError={clientFirestoreError}
            onUpdateStatus={handleClientUpdateStatus}
            onAddComment={handleClientAddComment}
          />
        </main>
      </div>
    );
  }

  // RENDER 4: Admin Zone ("/")
  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <main>
        <AdminDashboardView
          currentUser={currentUser}
          authReady={authReady}
          unauthorizedDenied={unauthorizedDenied}
          firestoreError={adminFirestoreError}
          onSignInGoogle={handleSignInGoogle}
          onSignOut={handleSignOut}
          projects={adminProjects}
          clientes={adminClientes}
          selectedProjectId={selectedAdminProjectId}
          selectedProjectFinalVideoUrl={adminSelectedFinalVideoUrl}
          selectedProjectFinalFiles={adminSelectedFinalFiles}
          onSelectProject={(id) => setSelectedAdminProjectId(id)}
          commentsForSelected={adminComments}
          onCreateProject={handleAdminCreateProject}
          onUpdateProject={handleAdminUpdateProject}
          onDeleteProject={handleAdminDeleteProject}
          onToggleCommentResolved={handleAdminToggleCommentResolved}
          onCreateCliente={handleAdminCreateCliente}
          onUpdateCliente={handleAdminUpdateCliente}
          onDeleteCliente={handleAdminDeleteCliente}
        />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
