import React, { useEffect, useState } from 'react';
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
  Project,
  ProjectFormInput,
  ProjectStatus,
  VideoComment,
} from './types';
import {
  isAuthorizedAdminUser,
  generateSecureProjectId,
  parseRoutePath,
  AppRoute,
} from './utils/validation';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ClientReviewView } from './components/ClientReviewView';
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

export function AppContent() {
  const [route] = useState<AppRoute>(() =>
    parseRoutePath(window.location.pathname)
  );

  // Admin Zone State (only used when route.view === 'admin')
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [unauthorizedDenied, setUnauthorizedDenied] = useState<boolean>(false);
  const [adminProjects, setAdminProjects] = useState<Project[]>([]);
  const [selectedAdminProjectId, setSelectedAdminProjectId] = useState<
    string | null
  >(null);
  const [adminComments, setAdminComments] = useState<VideoComment[]>([]);
  const [adminFirestoreError, setAdminFirestoreError] = useState<string | null>(
    null
  );

  // Client Page State (only used when route.view === 'client')
  const [clientProject, setClientProject] = useState<Project | null>(null);
  const [clientComments, setClientComments] = useState<VideoComment[]>([]);
  const [loadingClientProject, setLoadingClientProject] =
    useState<boolean>(true);
  const [clientLinkInvalid, setClientLinkInvalid] = useState<boolean>(false);
  const [clientFirestoreError, setClientFirestoreError] = useState<
    string | null
  >(null);

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
      return;
    }

    setAdminFirestoreError(null);
    const unsub = onSnapshot(
      collection(db, 'projects'),
      (snap) => {
        setAdminFirestoreError(null);
        const list: Project[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title || ''),
            clientName: String(data.clientName || ''),
            videoUrl: String(data.videoUrl || ''),
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
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
          };
        });
        list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        setAdminProjects(list);
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

  // 2) INDEPENDENT CLIENT PAGE ("/ver/ID_DEL_PROYECTO")
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
        setClientProject({
          id: snap.id,
          title: String(data.title || ''),
          clientName: String(data.clientName || ''),
          videoUrl: String(data.videoUrl || ''),
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

  // Client Actions (Firestore Only)
  const handleClientUpdateStatus = async (newStatus: ProjectStatus) => {
    if (route.view !== 'client') return;
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
  }) => {
    if (route.view !== 'client') return;
    const safeAuthor = payload.authorName.trim().slice(0, 80);
    const safeText = payload.text.trim().slice(0, 1000);
    const safeSecond = Math.max(
      0,
      Math.min(86400, Math.floor(payload.videoSecond))
    );

    const commentId = generateSecureProjectId(24);
    const path = `comments/${commentId}`;
    try {
      await setDoc(doc(db, 'comments', commentId), {
        projectId: route.projectId,
        authorName: safeAuthor,
        text: safeText,
        videoSecond: safeSecond,
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

  const handleAdminCreateProject = async (
    input: ProjectFormInput
  ): Promise<string> => {
    ensureActiveAdminSession();
    setAdminFirestoreError(null);

    // Cryptographically random code of 28 characters (>= 20 chars requirement)
    const newId = generateSecureProjectId(28);
    const path = `projects/${newId}`;

    const sanitized = {
      title: input.title.trim().slice(0, 120),
      clientName: input.clientName.trim().slice(0, 100),
      videoUrl: input.videoUrl.trim().slice(0, 500),
      price: Math.max(0, Number(input.price) || 0),
      currency: input.currency,
      showPrice: Boolean(input.showPrice),
      watermarkEnabled: Boolean(input.watermarkEnabled),
      watermarkText: input.watermarkText.trim().slice(0, 100),
      status: input.status,
      whatsappNumber: input.whatsappNumber.trim().slice(0, 30),
    };

    try {
      await setDoc(doc(db, 'projects', newId), {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const now = new Date();
      const createdProject: Project = {
        id: newId,
        ...sanitized,
        createdAt: now,
        updatedAt: now,
      };

      // Ensure immediate appearance in the admin list while onSnapshot syncs
      setAdminProjects((prev) =>
        prev.some((p) => p.id === newId) ? prev : [createdProject, ...prev]
      );
      setSelectedAdminProjectId(newId);
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

    const path = `projects/${projectId}`;
    const sanitized = {
      title: input.title.trim().slice(0, 120),
      clientName: input.clientName.trim().slice(0, 100),
      videoUrl: input.videoUrl.trim().slice(0, 500),
      price: Math.max(0, Number(input.price) || 0),
      currency: input.currency,
      showPrice: Boolean(input.showPrice),
      watermarkEnabled: Boolean(input.watermarkEnabled),
      watermarkText: input.watermarkText.trim().slice(0, 100),
      status: input.status,
      whatsappNumber: input.whatsappNumber.trim().slice(0, 30),
    };

    try {
      await updateDoc(doc(db, 'projects', projectId), {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleAdminDeleteProject = async (projectId: string) => {
    ensureActiveAdminSession();
    setAdminFirestoreError(null);

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
      await deleteDoc(doc(db, 'projects', projectId));
      const nextProj = adminProjects.find((p) => p.id !== projectId);
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

  // RENDER 1: Invalid Link or non-existent project on /ver/ID_DEL_PROYECTO -> Simple "Enlace no válido"
  if (
    route.view === 'invalid-client-link' ||
    (route.view === 'client' &&
      !loadingClientProject &&
      !clientFirestoreError &&
      (clientLinkInvalid || !clientProject))
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

  // RENDER 2: Independent Client Page (/ver/ID_DEL_PROYECTO)
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
            firestoreError={clientFirestoreError}
            onUpdateStatus={handleClientUpdateStatus}
            onAddComment={handleClientAddComment}
          />
        </main>
      </div>
    );
  }

  // RENDER 3: Admin Zone ("/")
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
          selectedProjectId={selectedAdminProjectId}
          onSelectProject={(id) => setSelectedAdminProjectId(id)}
          commentsForSelected={adminComments}
          onCreateProject={handleAdminCreateProject}
          onUpdateProject={handleAdminUpdateProject}
          onDeleteProject={handleAdminDeleteProject}
          onToggleCommentResolved={handleAdminToggleCommentResolved}
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
