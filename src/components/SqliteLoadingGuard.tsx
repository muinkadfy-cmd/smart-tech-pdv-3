/**
 * SqliteLoadingGuard — P2: Skeleton durante preload do SQLite
 *
 * Evita que a tela apareça vazia enquanto o banco não está carregado.
 * Substituir a renderização direta das páginas principais por este wrapper.
 *
 * Uso:
 *   <SqliteLoadingGuard>
 *     <OrdensPage />
 *   </SqliteLoadingGuard>
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { resetSqliteDatabaseForCurrentStore } from '@/lib/db-recovery';
import { showToast } from '@/components/ui/ToastContainer';
import { isDesktopApp } from '@/lib/platform';

interface Props {
  children: React.ReactNode;
  /** Tempo em ms para trocar de "carregando" para "demorando", sem liberar a UI antes da hora */
  timeout?: number;
}

export function SqliteLoadingGuard({ children, timeout = 2500 }: Props) {
  const globalReady = typeof window !== 'undefined' && (window as any).__smarttechSqliteReady === true;
  const [ready, setReady] = useState(!isDesktopApp() || globalReady); // Web: já pronto
  const [slow, setSlow] = useState(false);
  const [sqliteError, setSqliteError] = useState<string>(() => {
    try { return String((window as any).__smarttechSqliteError || ''); } catch { return ''; }
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (!isDesktopApp()) return;
    if ((window as any).__smarttechSqliteReady === true) {
      setReady(true);
      setSlow(false);
      return;
    }

    const safeTimeout = Number.isFinite(timeout) ? Math.max(0, timeout) : 800;
    const slowTimer = window.setTimeout(() => {
      setSlow(true);
    }, safeTimeout);

    // Escuta evento customizado emitido pelo SqliteLocalStore ao completar preload
    const onReady = (ev?: any) => {
      window.clearTimeout(slowTimer);
      try { (window as any).__smarttechSqliteReady = true; } catch {}
      const err = String(ev?.detail?.error || (window as any).__smarttechSqliteError || '');
      if (err) setSqliteError(err);
      setSlow(false);
      setReady(true);
    };
    const onStoreChanged = () => {
      try {
        (window as any).__smarttechSqliteReady = false;
      } catch {}
      setSqliteError('');
      setSlow(false);
      setReady(false);
    };
    window.addEventListener('smarttech:sqlite-ready', onReady);
    window.addEventListener('smarttech:sqlite-failed', onReady); // falha também libera
    window.addEventListener('smarttech:store-changed', onStoreChanged);

    return () => {
      window.clearTimeout(slowTimer);
      window.removeEventListener('smarttech:sqlite-ready', onReady);
      window.removeEventListener('smarttech:sqlite-failed', onReady);
      window.removeEventListener('smarttech:store-changed', onStoreChanged);
    };
  }, [timeout]);

  if (!ready) {
    return <SqliteSkeleton slow={slow} />;
  }

  // P9: Se o SQLite falhou/corrompeu no Desktop, mostrar painel de recuperação.
  const corrupted = isDesktopApp() && ((): boolean => {
    try { return (window as any).__smarttechDbCorrupted === true; } catch { return false; }
  })();

  if (corrupted) {
    return (
      <DbRecoveryPanel
        error={sqliteError}
        onGoBackup={() => navigate('/backup')}
        onReset={async () => {
          if (!confirm('ATENÇÃO: Resetar o banco APAGA os dados locais desta loja. Use apenas se você vai restaurar um backup.\n\nDeseja continuar?')) return;
          const r = await resetSqliteDatabaseForCurrentStore();
          if (!r.ok) {
            showToast(r.error || 'Falha ao resetar o banco', 'error', 7000);
            return;
          }
          showToast('Banco resetado. Agora restaure um backup.', 'success', 6000);
          navigate('/backup');
        }}
      />
    );
  }

  return <>{children}</>;
}


function DbRecoveryPanel({
  error,
  onGoBackup,
  onReset,
}: {
  error: string;
  onGoBackup: () => void;
  onReset: () => void;
}) {
  return (
    <div style={{
      padding: '28px 22px',
      maxWidth: 920,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <div style={{
        border: '1px solid rgba(239,68,68,0.35)',
        background: 'rgba(239,68,68,0.08)',
        borderRadius: 12,
        padding: 16,
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
          ⚠️ Banco de dados com problema
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--text-secondary, #334155)' }}>
          O sistema detectou falha ao abrir o SQLite desta loja (pode ser corrupção ou travamento). Para evitar perda de dados,
          o app entrou em <b>modo recuperação</b>.
        </div>
        {error ? (
          <div style={{
            marginTop: 10,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            color: '#7f1d1d',
          }}>
            {error}
          </div>
        ) : null}
      </div>

      <div style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <button
          onClick={onGoBackup}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid rgba(0,0,0,0.12)',
            background: 'white',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Abrir Backup / Restaurar
        </button>
        <button
          onClick={onReset}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid rgba(239,68,68,0.35)',
            background: 'rgba(239,68,68,0.10)',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Resetar banco (emergência)
        </button>
        <div style={{ fontSize: 12, color: 'var(--text-secondary, #475569)' }}>
          Dica: se você tiver um backup recente, clique em <b>Abrir Backup / Restaurar</b>.
        </div>
      </div>

      <div style={{
        borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.08)',
        padding: 16,
        background: 'rgba(0,0,0,0.03)',
        fontSize: 13,
        lineHeight: 1.45,
      }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Checklist rápido</div>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Vá em <b>Backup</b> e tente <b>Restaurar</b> um arquivo .zip / .json.gz.</li>
          <li>Se não abrir ou continuar falhando, use <b>Resetar banco</b> e depois restaure o backup.</li>
          <li>Se não tiver backup, exporte o <b>Pacote de Suporte</b> e envie para o suporte.</li>
        </ol>
      </div>
    </div>
  );
}

function SqliteSkeleton({ slow }: { slow: boolean }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      padding: '32px 24px',
      animation: 'fadeIn 0.2s ease',
    }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <SkeletonBlock width={180} height={28} radius={6} />
        <SkeletonBlock width={80} height={28} radius={16} />
        <div style={{ flex: 1 }} />
        <SkeletonBlock width={120} height={36} radius={8} />
      </div>

      {/* Toolbar skeleton */}
      <div style={{ display: 'flex', gap: 10 }}>
        <SkeletonBlock width="100%" height={38} radius={8} />
        <SkeletonBlock width={100} height={38} radius={8} />
        <SkeletonBlock width={100} height={38} radius={8} />
      </div>

      {/* Row skeletons */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          padding: '12px 16px',
          borderRadius: 8,
          background: 'var(--bg-secondary, rgba(0,0,0,0.04))',
          opacity: 1 - i * 0.12,
        }}>
          <SkeletonBlock width={36} height={36} radius={18} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SkeletonBlock width={`${60 + (i % 3) * 15}%`} height={14} radius={4} />
            <SkeletonBlock width={`${30 + (i % 2) * 20}%`} height={12} radius={4} />
          </div>
          <SkeletonBlock width={72} height={24} radius={12} />
          <SkeletonBlock width={32} height={32} radius={6} />
        </div>
      ))}

      {/* Loading indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 8,
        color: 'var(--text-secondary, #64748b)',
        fontSize: 13,
      }}>
        <SpinnerIcon />
        {slow ? 'Demorando para carregar dados...' : 'Carregando dados...'}
      </div>

      {slow ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          color: 'var(--text-secondary, #64748b)',
          fontSize: 12,
          flexWrap: 'wrap',
        }}>
          <span>Se ficar parado por muito tempo, tente recarregar.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '6px 10px',
              borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.12)',
              background: 'white',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Recarregar
          </button>
        </div>
      ) : null}

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); } to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

interface SkeletonBlockProps {
  width: number | string;
  height: number;
  radius?: number;
}

function SkeletonBlock({ width, height, radius = 4 }: SkeletonBlockProps) {
  return (
    <div style={{
      width,
      height,
      borderRadius: radius,
      background: 'linear-gradient(90deg, var(--skeleton-base, #e2e8f0) 25%, var(--skeleton-shine, #f1f5f9) 50%, var(--skeleton-base, #e2e8f0) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
      flexShrink: 0,
    }} />
  );
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}
