import React, { useEffect, useState, useCallback } from 'react';
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
import { Copy, Check, AlertCircle } from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  Project,
  ProjectFormInput,
  ProjectStatus,
  VideoComment,
} from './types';
import {
  DEMO_PROJECT_ID,
  loadDemoProjects,
  saveDemoProjects,
  loadDemoComments,
  saveDemoComments,
} from './data/demoSeed';
import {
  isAuthorizedAdminUser,
  isValidId,
} from './utils/validation';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ClientReviewView } from './components/ClientReviewView';
import { AdminDashboardView } from './components/AdminDashboardView';

type ActiveScreen = 'client' | 'admin';

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
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'admin') return 'admin';
    return 'client';
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('p');
    return p && isValidId(p) ? p : DEMO_PROJECT_ID;
  });

  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isDemoAdmin, setIsDemoAdmin] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('demo_admin') === '1';
  });

  // Local Demo State (always available for demo projects or demo admin preview)
  const [demoProjects, setDemoProjects] = useState<Project[]>(() =>
    loadDemoProjects()
  );
  const [demoComments, setDemoComments] = useState<VideoComment[]>(() =>
    loadDemoComments()
  );

  // Firestore State
  const [firestoreProjects, setFirestoreProjects] = useState<Project[]>([]);
  const [singleFirestoreProject, setSingleFirestoreProject] =
    useState<Project | null>(null);
  const [firestoreComments, setFirestoreComments] = useState<VideoComment[]>([]);
  const [loadingProject, setLoadingProject] = useState<boolean>(false);
  const [projectNotFound, setProjectNotFound] = useState<boolean>(false);
  const [headerLinkCopied, setHeaderLinkCopied] = useState<boolean>(false);

  // Sync URL query parameter when switching projects
  const updateUrlProjectParam = useCallback(
    (projectId: string, screen: ActiveScreen) => {
      const url = new URL(window.location.href);
      if (screen === 'client') {
        url.searchParams.set('p', projectId);
        url.searchParams.delete('view');
      } else {
        url.searchParams.set('view', 'admin');
      }
      window.history.replaceState({}, '', url.toString());
    },
    []
  );

  // Track Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const isRealAdmin = authReady && isAuthorizedAdminUser(currentUser);
  const isCurrentProjectDemo = demoProjects.some(
    (p) => p.id === activeProjectId
  );

  // Listen to single Firestore project & its comments when viewing a non-demo project
  useEffect(() => {
    if (isCurrentProjectDemo) {
      setProjectNotFound(false);
      setLoadingProject(false);
      return;
    }

    if (!isValidId(activeProjectId)) {
      setProjectNotFound(true);
      return;
    }

    setLoadingProject(true);
    setProjectNotFound(false);

    const projectPath = `projects/${activeProjectId}`;
    const unsubProject = onSnapshot(
      doc(db, 'projects', activeProjectId),
      (snap) => {
        setLoadingProject(false);
        if (!snap.exists()) {
          setSingleFirestoreProject(null);
          setProjectNotFound(true);
          return;
        }
        const data = snap.data();
        setSingleFirestoreProject({
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
        setProjectNotFound(false);
      },
      (error) => {
        setLoadingProject(false);
        handleFirestoreError(error, OperationType.GET, projectPath);
      }
    );

    const commentsQuery = query(
      collection(db, 'comments'),
      where('projectId', '==', activeProjectId)
    );
    const unsubComments = onSnapshot(
      commentsQuery,
      (snap) => {
        const list: VideoComment[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            projectId: String(data.projectId || activeProjectId),
            authorName: String(data.authorName || 'Cliente'),
            text: String(data.text || ''),
            videoSecond: Number(data.videoSecond || 0),
            createdAt: toDate(data.createdAt),
            resolved: Boolean(data.resolved),
          };
        });
        setFirestoreComments(list);
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.LIST,
          `comments?projectId=${activeProjectId}`
        );
      }
    );

    return () => {
      unsubProject();
      unsubComments();
    };
  }, [activeProjectId, isCurrentProjectDemo]);

  // Listen to full Firestore projects collection ONLY when authenticated as the authorized Admin
  useEffect(() => {
    if (!isRealAdmin) {
      setFirestoreProjects([]);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'projects'),
      (snap) => {
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
        setFirestoreProjects(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'projects');
      }
    );

    return () => unsub();
  }, [isRealAdmin]);

  // Combined project & comments selection
  const activeClientProject: Project | null = isCurrentProjectDemo
    ? demoProjects.find((p) => p.id === activeProjectId) || null
    : singleFirestoreProject;

  const activeClientComments: VideoComment[] = isCurrentProjectDemo
    ? demoComments.filter((c) => c.projectId === activeProjectId)
    : firestoreComments;

  const adminProjectsList: Project[] = isRealAdmin
    ? firestoreProjects
    : demoProjects;

  // Handlers for Client View
  const handleClientUpdateStatus = async (newStatus: ProjectStatus) => {
    if (isCurrentProjectDemo) {
      const updated = demoProjects.map((p) =>
        p.id === activeProjectId
          ? { ...p, status: newStatus, updatedAt: new Date() }
          : p
      );
      setDemoProjects(updated);
      saveDemoProjects(updated);
      return;
    }

    const path = `projects/${activeProjectId}`;
    try {
      // Firestore rule allows anyone with the link to update ONLY the 'status' field
      await updateDoc(doc(db, 'projects', activeProjectId), {
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
    const safeAuthor = payload.authorName.trim().slice(0, 80);
    const safeText = payload.text.trim().slice(0, 1000);
    const safeSecond = Math.max(
      0,
      Math.min(86400, Math.floor(payload.videoSecond))
    );

    if (isCurrentProjectDemo) {
      const newComment: VideoComment = {
        id: `demo-c-${Date.now()}`,
        projectId: activeProjectId,
        authorName: safeAuthor,
        text: safeText,
        videoSecond: safeSecond,
        createdAt: new Date(),
        resolved: false,
      };
      const updated = [...demoComments, newComment];
      setDemoComments(updated);
      saveDemoComments(updated);
      return;
    }

    const commentId = `comm_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const path = `comments/${commentId}`;
    try {
      await setDoc(doc(db, 'comments', commentId), {
        projectId: activeProjectId,
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

  // Handlers for Admin Panel
  const handleSignInGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setIsDemoAdmin(false);
  };

  const handleAdminCreateProject = async (
    input: ProjectFormInput
  ): Promise<string> => {
    const newId = `proj_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;

    if (!isRealAdmin) {
      const now = new Date();
      const created: Project = {
        id: newId,
        ...input,
        createdAt: now,
        updatedAt: now,
        isDemo: true,
      };
      const updated = [created, ...demoProjects];
      setDemoProjects(updated);
      saveDemoProjects(updated);
      setActiveProjectId(newId);
      return newId;
    }

    const path = `projects/${newId}`;
    try {
      await setDoc(doc(db, 'projects', newId), {
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActiveProjectId(newId);
      return newId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleAdminUpdateProject = async (
    projectId: string,
    input: ProjectFormInput
  ) => {
    if (!isRealAdmin || demoProjects.some((p) => p.id === projectId)) {
      const updated = demoProjects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              ...input,
              updatedAt: new Date(),
            }
          : p
      );
      setDemoProjects(updated);
      saveDemoProjects(updated);
      return;
    }

    const path = `projects/${projectId}`;
    try {
      await updateDoc(doc(db, 'projects', projectId), {
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
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleAdminDeleteProject = async (projectId: string) => {
    if (!isRealAdmin || demoProjects.some((p) => p.id === projectId)) {
      const remaining = demoProjects.filter((p) => p.id !== projectId);
      const remainingComments = demoComments.filter(
        (c) => c.projectId !== projectId
      );
      setDemoProjects(remaining);
      saveDemoProjects(remaining);
      setDemoComments(remainingComments);
      saveDemoComments(remainingComments);
      if (remaining[0]) {
        setActiveProjectId(remaining[0].id);
      }
      return;
    }

    const path = `projects/${projectId}`;
    try {
      // Delete associated comments first
      const q = query(
        collection(db, 'comments'),
        where('projectId', '==', projectId)
      );
      const snap = await getDocs(q);
      for (const commentDoc of snap.docs) {
        await deleteDoc(doc(db, 'comments', commentDoc.id));
      }
      await deleteDoc(doc(db, 'projects', projectId));
      const nextProj = firestoreProjects.find((p) => p.id !== projectId);
      if (nextProj) {
        setActiveProjectId(nextProj.id);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleAdminToggleCommentResolved = async (
    commentId: string,
    currentResolved: boolean
  ) => {
    if (!isRealAdmin || demoComments.some((c) => c.id === commentId)) {
      const updated = demoComments.map((c) =>
        c.id === commentId ? { ...c, resolved: !currentResolved } : c
      );
      setDemoComments(updated);
      saveDemoComments(updated);
      return;
    }

    const path = `comments/${commentId}`;
    try {
      await updateDoc(doc(db, 'comments', commentId), {
        resolved: !currentResolved,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleCopyCurrentClientUrl = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?p=${encodeURIComponent(
      activeProjectId
    )}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Fallback ignore
    }
    setHeaderLinkCopied(true);
    window.setTimeout(() => setHeaderLinkCopied(false), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-2 sm:gap-8 px-3 sm:px-6 h-14 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/90">
        {/* Zone 1: Single text element wordmark */}
        <a
          href={`?p=${encodeURIComponent(activeProjectId)}`}
          onClick={(e) => {
            e.preventDefault();
            setActiveScreen('client');
            updateUrlProjectParam(activeProjectId, 'client');
          }}
          className="text-sm sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          ClipReview
        </a>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav className="flex items-center gap-3 sm:gap-6 text-xs sm:text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => {
              setActiveScreen('client');
              updateUrlProjectParam(activeProjectId, 'client');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeScreen === 'client'
                ? 'text-white underline underline-offset-8 decoration-sky-400 decoration-2'
                : 'hover:text-slate-200'
            }`}
          >
            Cliente
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveScreen('admin');
              updateUrlProjectParam(activeProjectId, 'admin');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeScreen === 'admin'
                ? 'text-white underline underline-offset-8 decoration-sky-400 decoration-2'
                : 'hover:text-slate-200'
            }`}
          >
            Admin
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleCopyCurrentClientUrl}
            className="min-h-[38px] px-2.5 sm:px-3.5 py-1.5 text-xs font-medium text-slate-100 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-xl inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {headerLinkCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-sky-400" />
                <span>Copiar enlace</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {activeScreen === 'client' ? (
          loadingProject ? (
            <div className="max-w-4xl mx-auto px-4 py-16 text-center">
              <p className="text-sm text-slate-400">Cargando proyecto de video...</p>
            </div>
          ) : projectNotFound || !activeClientProject ? (
            <div className="max-w-md mx-auto px-4 py-16">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
                <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-white">
                    Proyecto no encontrado
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    El enlace del proyecto no existe o fue eliminado por el administrador.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveProjectId(DEMO_PROJECT_ID);
                    updateUrlProjectParam(DEMO_PROJECT_ID, 'client');
                  }}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs inline-flex items-center justify-center transition-colors cursor-pointer"
                >
                  Abrir proyecto de demostración
                </button>
              </div>
            </div>
          ) : (
            <ClientReviewView
              project={activeClientProject}
              comments={activeClientComments}
              onUpdateStatus={handleClientUpdateStatus}
              onAddComment={handleClientAddComment}
            />
          )
        ) : (
          <AdminDashboardView
            currentUser={currentUser}
            authReady={authReady}
            isDemoAdmin={isDemoAdmin}
            onEnableDemoAdmin={() => setIsDemoAdmin(true)}
            onSignInGoogle={handleSignInGoogle}
            onSignOut={handleSignOut}
            projects={adminProjectsList}
            selectedProjectId={activeProjectId}
            onSelectProject={(id) => setActiveProjectId(id)}
            commentsForSelected={activeClientComments}
            onCreateProject={handleAdminCreateProject}
            onUpdateProject={handleAdminUpdateProject}
            onDeleteProject={handleAdminDeleteProject}
            onToggleCommentResolved={handleAdminToggleCommentResolved}
            onOpenClientPreview={(id) => {
              setActiveProjectId(id);
              setActiveScreen('client');
              updateUrlProjectParam(id, 'client');
            }}
          />
        )}
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
