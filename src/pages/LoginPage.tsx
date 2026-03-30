import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { login, getCurrentSession } from '@/lib/auth-supabase';
import { isLicenseMandatory, isLicenseEnabled } from '@/lib/mode';
import { getLicenseStatusAsync } from '@/lib/license';
import { getStoreId, isValidUUID, setStoreId } from '@/lib/store-id';
import { perfMarkOnce, perfMeasure } from '@/lib/perf';
import { clearRememberedLogin, getRememberedLogin, saveRememberedLogin } from '@/lib/rememberLogin';
import { getSupabaseClient } from '@/lib/supabaseClient';

import './LoginPage.css';


function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2.5 12s3.7-7 9.5-7 9.5 7 9.5 7-3.7 7-9.5 7S2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EyeOffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3 12s3.7-7 9-7 9 7 9 7a18.5 18.5 0 0 1-3.1 3.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 6.2A6.9 6.9 0 0 1 12 6c5.3 0 9 6 9 6s-3.7 6-9 6-9-6-9-6a18.8 18.8 0 0 1 4.4-4.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        opacity="0.35"
      />
      <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function WindowsLoaderIcon() {
  return (
    <span className="windows-loader" aria-hidden="true">
      <span className="windows-loader-dot" />
      <span className="windows-loader-dot" />
      <span className="windows-loader-dot" />
      <span className="windows-loader-dot" />
      <span className="windows-loader-dot" />
    </span>
  );
}

function PlusStoreIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true" {...props}>
      <path d="M4 7.5 6 4h12l2 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 8h14v10.5A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5V8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10.5v6M9 13.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}


export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation() as any;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [storeInput, setStoreInput] = useState('');
  const [rememberLogin, setRememberLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const store = getStoreId();
  const storeId = store.storeId;

  useEffect(() => {
    // se já tem sessão, ir direto pro painel
    const s = getCurrentSession();
    if (s) {
      navigate('/painel', { replace: true });
    }
  }, [navigate]);

  // 💾 Lembrar login/senha (opcional): só preenche se existir salvo
  useEffect(() => {
    const remembered = getRememberedLogin();
    if (!remembered) return;
    const isLegacyDefaultAdmin = String(remembered.username || '').trim().toLowerCase() === 'admin';
    if (isLegacyDefaultAdmin) {
      clearRememberedLogin();
      return;
    }
    setUsername(remembered.username);
    if (remembered.password) {
      setPassword(remembered.password);
    }
    if (remembered.storeId) {
      setStoreInput(remembered.storeId);
    }
    setRememberLogin(true);
  }, []);

  useEffect(() => {
    if (storeId) {
      setStoreInput((current) => current || storeId);
    }
  }, [storeId]);

  useEffect(() => {
    const prefill = location?.state?.prefill as { username?: string; password?: string; storeId?: string } | undefined;
    if (!prefill) return;
    if (prefill.username) setUsername(prefill.username);
    if (prefill.password) setPassword(prefill.password);
    if (prefill.storeId) setStoreInput(prefill.storeId);
  }, [location]);


  useEffect(() => {
    // 🔐 Build de venda (Desktop/PROD): se licença for obrigatória/ativa e não estiver válida, mandar para ativação.
    const run = async () => {
      const required = isLicenseMandatory() || isLicenseEnabled();
      if (!required) return;
      const st = await getLicenseStatusAsync();
      if (st.status !== 'active' && st.status !== 'trial') {
        const from = location?.state?.from || '/painel';
        navigate('/comprar', { replace: true, state: { from } });
      }
    };
    run().catch(() => undefined);
  }, [navigate, location]);

  // Login não usa Topbar: aplica tema salvo para manter consistência
  useEffect(() => {
    try {
      const saved = localStorage.getItem('smart-tech-theme');
      const mode = saved === 'light' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', mode);
    } catch {
      // ignore
    }
  }, []);

  // ✅ Métricas (PC fraco): App start → Login visível/interativo
  useEffect(() => {
    try {
      // "visível" após 1 frame da montagem
      requestAnimationFrame(() => {
        perfMarkOnce('login_visible');
        perfMeasure('app_start→login_visible', 'app_start', 'login_visible');

        // "interativo" após 2 frames (layout/estilos aplicados)
        requestAnimationFrame(() => {
          perfMarkOnce('login_interactive');
          perfMeasure('app_start→login_interactive', 'app_start', 'login_interactive');
        });
      });
    } catch {
      // ignore
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError('');
    setOkMsg('');
    setLoading(true);

    try {
      const normalizedStoreId = storeInput.trim();
      if (!isValidUUID(normalizedStoreId)) {
        setError('Informe um store_id valido para entrar na loja correta.');
        return;
      }

      const res = await login(username, password, normalizedStoreId);

      if (!res.success) {
        setError(res.error || 'Erro ao entrar.');
        return;
      }

      setStoreId(normalizedStoreId, { force: true, reason: 'login-page-submit' });

      // 💾 Persistir (opcional) somente após login com sucesso
      if (rememberLogin) {
        saveRememberedLogin(username, password, true, normalizedStoreId);
      } else {
        clearRememberedLogin();
      }

      const from = location?.state?.from;
      navigate(from || '/painel', { replace: true });
    } finally {
      setLoading(false);
    }
  }

  const handleForgotPassword = async () => {
    const email = username.trim();
    setError('');
    setOkMsg('');

    if (!email || !email.includes('@')) {
      setError('Informe o e-mail da conta para receber o link de redefinição.');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setError('Recuperação por e-mail indisponível sem Supabase configurado.');
      return;
    }

    try {
      const redirectTo = `${window.location.origin}/reset-senha`;
      const { error: resetError } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) {
        setError(resetError.message || 'Não foi possível enviar o link de redefinição.');
        return;
      }
      setOkMsg('Enviamos um link de redefinição para o seu e-mail. Abra o link para criar uma nova senha.');
    } catch (err: any) {
      setError(err?.message || 'Erro ao solicitar redefinição de senha.');
    }
  };

    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-card" role="region" aria-label="Login Smart Tech PDV">
            <div className="login-header">
              <img
                className="login-brand-logo"
                src="/icons/icon-192.png"
                alt="Smart Tech"
                loading="eager"
                decoding="async"
              />
              <div className="login-kicker">PDV</div>
              <h1 className="login-title">Smart Tech</h1>
              <p className="login-subtitle">Entre com e-mail, senha e store_id da loja.</p>
              <button
                type="button"
                className="login-top-create"
                onClick={() => navigate('/cadastro')}
                disabled={loading}
              >
                <PlusStoreIcon />
                <span>Criar conta da loja</span>
              </button>
            </div>

            {error ? <div className="login-alert" role="alert">{error}</div> : null}
            {okMsg ? <div className="login-alert login-alert-ok" role="status">{okMsg}</div> : null}

            <form onSubmit={handleLogin} className="login-form">
              <div className="login-field">
                <label htmlFor="login-usuario">E-mail ou usuário</label>
                <input
                  id="login-usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="contato@minhaloja.com"
                  autoComplete="username"
                  inputMode="text"
                />
              </div>

              <div className="login-field">
                <label htmlFor="login-store-id">Store ID da loja</label>
                <input
                  id="login-store-id"
                  value={storeInput}
                  onChange={(e) => setStoreInput(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              <div className="login-field">
                <label htmlFor="login-senha">Senha</label>
                <div className="password-wrap">
                  <input
                    id="login-senha"
                    className="password-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    disabled={loading}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <label className="login-remember-row">
                <input
                  type="checkbox"
                  checked={rememberLogin}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setRememberLogin(v);
                    if (!v) clearRememberedLogin();
                  }}
                  disabled={loading}
                />
                <span className="login-remember-copy">
                  <strong>Salvar acesso neste dispositivo</strong>
                  <small>Preenche usuário e senha automaticamente no próximo login.</small>
                </span>
              </label>

              <button
                type="submit"
                className={`btn-primary ${loading ? 'btn-primary-loading' : ''}`}
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? (
                  <span className="btn-primary-content">
                    <WindowsLoaderIcon />
                    <span>Entrando…</span>
                  </span>
                ) : (
                  <span className="btn-primary-content">
                    <span>Entrar</span>
                  </span>
                )}
              </button>

              <button
                type="button"
                className="login-forgot"
                onClick={() => void handleForgotPassword()}
                disabled={loading}
              >
                Esqueci minha senha
              </button>

            </form>
          </div>

          <div className="login-meta" aria-label="Informações do aplicativo">
            <div className="login-meta-line">Smart Tech • Rolândia</div>
            <div className="login-meta-sub">Sistema Offline-First (PWA)</div>
          </div>
        </div>
      </div>
    );
}
