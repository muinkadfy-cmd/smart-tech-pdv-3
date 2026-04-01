import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUpdates } from '@/contexts/UpdateContext';
import { BUILD_BASE_VERSION } from '@/config/buildInfo';
import './UpdateBanner.css';

const SESSION_KEY = 'smart-tech:update-banner-dismissed';

function getToken(manifestVersion: string, manifestId: string, manifestDate: string) {
  return `${manifestVersion || ''}::${manifestId || manifestDate || 'na'}`;
}

function isDismissed(token: string) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.token === token && typeof parsed?.until === 'number' && parsed.until > Date.now();
  } catch {
    return false;
  }
}

function dismiss(token: string) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, until: Date.now() + 2 * 60 * 60 * 1000 }));
  } catch {
    // ignore
  }
}

function getBaseVersion(version: string) {
  const raw = String(version || '').trim();
  if (!raw) return '';
  return raw.split('.').slice(0, 3).join('.');
}

export default function UpdateBanner() {
  const navigate = useNavigate();
  const { manifest, updateAvailable, pwaNeedRefresh, reloadApp, dismissPrompt } = useUpdates();

  const meta = useMemo(() => {
    const version = String(manifest?.version || '').trim();
    const id = String((manifest as any)?.commit || (manifest as any)?.build || '').trim();
    const date = String((manifest as any)?.date || '').trim();
    const currentBase = BUILD_BASE_VERSION || '';
    const serverBase = getBaseVersion(version);
    const isNewVersion = Boolean(serverBase && currentBase && serverBase !== currentBase);
    return { version, id, date, token: getToken(version, id, date), isNewVersion };
  }, [manifest]);

  const shouldShow = (updateAvailable || pwaNeedRefresh) && !isDismissed(meta.token);
  if (!shouldShow) return null;

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-banner__text">
        <div className="update-banner__headline">
          <strong>{meta.isNewVersion ? 'Nova versão disponível' : 'Novo build disponível'}</strong>
          <span className="update-banner__badge">Ação recomendada</span>
        </div>

        <span className="update-banner__summary">
          {meta.version ? `${meta.isNewVersion ? 'Versão' : 'Build de manutenção'} ${meta.version}` : 'Atualização do app pronta para instalar'}
          {pwaNeedRefresh ? ' • pronta para aplicar' : ''}
        </span>

      </div>

      <div className="update-banner__actions">
        <button
          type="button"
          className="update-banner__btn secondary"
          onClick={() => navigate('/backup')}
        >
          Fazer backup
        </button>

        <button
          type="button"
          className="update-banner__btn"
          onClick={() => void reloadApp()}
        >
          Atualizar agora
        </button>

        <button
          type="button"
          className="update-banner__btn secondary"
          onClick={() => {
            dismiss(meta.token);
            dismissPrompt();
          }}
        >
          Depois
        </button>

        <button
          type="button"
          className="update-banner__link"
          onClick={() => navigate('/atualizacoes')}
        >
          Detalhes
        </button>
      </div>
    </div>
  );
}
