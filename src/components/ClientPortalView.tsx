import React from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Film,
  Image as ImageIcon,
} from 'lucide-react';
import { Cliente } from '../types';
import { formatPrice, getStatusVisuals } from '../utils/video';

interface ClientPortalViewProps {
  cliente: Cliente;
  firestoreError?: string | null;
}

export const ClientPortalView: React.FC<ClientPortalViewProps> = ({
  cliente,
  firestoreError,
}) => {
  const visibleProjects = cliente.visibleProjects || [];

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      {firestoreError && (
        <div
          className="mb-6 bg-[#111111] border border-white rounded-xl p-4 text-xs text-white flex items-start gap-2.5"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{firestoreError}</span>
        </div>
      )}

      <header className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-5 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-xs text-neutral-400">Proyectos del cliente</p>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-0.5">
              {cliente.name}
            </h1>
          </div>
          <span className="font-mono tabular-nums text-xs text-neutral-400">
            {visibleProjects.length}{' '}
            {visibleProjects.length === 1 ? 'proyecto' : 'proyectos'}
          </span>
        </div>
      </header>

      {visibleProjects.length === 0 ? (
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-10 text-center space-y-2">
          <Film className="w-7 h-7 text-neutral-500 mx-auto" />
          <p className="text-sm font-medium text-neutral-300">
            No hay proyectos disponibles en este momento
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visibleProjects.map((item) => {
            const st = getStatusVisuals(item.status);
            const isImages = item.projectType === 'images';
            return (
              <a
                key={item.id}
                href={`/ver/${encodeURIComponent(item.id)}`}
                data-testid={`client-portal-card-${item.id}`}
                className="bg-[#111111] border border-[#2A2A2A] hover:border-white rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all group"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#0A0A0A] border border-[#2A2A2A] text-neutral-300 shrink-0"
                        title={isImages ? 'Proyecto de imágenes' : 'Proyecto de video'}
                      >
                        {isImages ? (
                          <ImageIcon className="w-3.5 h-3.5" />
                        ) : (
                          <Film className="w-3.5 h-3.5" />
                        )}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg ${st.badgeClass}`}
                      >
                        {(item.status === 'Aprobado' ||
                          item.status === 'Entregado') && (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        )}
                        {item.status === 'Cambios solicitados' && (
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        )}
                        {item.status === 'En revisión' && (
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{item.status}</span>
                      </span>
                    </div>

                    {item.showPrice && typeof item.price === 'number' && (
                      <span className="font-mono tabular-nums text-sm font-semibold text-white shrink-0">
                        {formatPrice(item.price, item.currency)}
                      </span>
                    )}
                  </div>

                  <h2 className="text-base font-bold text-white break-words">
                    {item.title}
                  </h2>
                </div>

                <div className="pt-3 border-t border-[#2A2A2A] flex items-center justify-end">
                  <span className="min-h-[38px] px-4 py-1.5 rounded-xl bg-white group-hover:bg-neutral-200 text-black text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">
                    <span>Ver</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};
