/**
 * Sistema de Lembrar Login (usuário + opção de salvar senha)
 * - Guarda o usuário para preencher o campo.
 * - Opcionalmente guarda a senha (ofuscada em base64) SOMENTE se o usuário marcar.
 * ⚠️ Observação: base64 é ofuscação (não é criptografia forte). Use apenas em dispositivo confiável.
 */

import { safeGet } from './storage';


const REMEMBER_LOGIN_KEY = 'smart-tech-remember-login';
const REMEMBER_EMAIL_KEY = 'smart-tech-remember-email';
const REMEMBER_PASSWORD_KEY = 'smart-tech-remember-password';
const REMEMBER_STORE_ID_KEY = 'smart-tech-remember-store-id';

function saveGlobal(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`[RememberLogin] Erro ao salvar ${key}:`, error);
    return false;
  }
}

function getGlobal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`[RememberLogin] Erro ao ler ${key}:`, error);
    return null;
  }
}

function removeGlobal(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`[RememberLogin] Erro ao remover ${key}:`, error);
  }
}

function b64EncodeUtf8(value: string): string {
  try {
    // btoa só aceita latin1; converte UTF-8 -> latin1 compat
    return btoa(unescape(encodeURIComponent(value)));
  } catch {
    try {
      return btoa(value);
    } catch {
      return '';
    }
  }
}

function b64DecodeUtf8(value: string): string {
  try {
    return decodeURIComponent(escape(atob(value)));
  } catch {
    try {
      return atob(value);
    } catch {
      return '';
    }
  }
}

/**
 * Salva credenciais.
 * - Se remember=false, limpa tudo.
 * - Se remember=true, salva username e (se password informado) salva password ofuscada.
 */
export function saveRememberedLogin(username: string, password: string, remember: boolean, storeId?: string): boolean {
  if (!remember) {
    clearRememberedLogin();
    return true;
  }

  try {
    const usernameSaved = saveGlobal(REMEMBER_EMAIL_KEY, username);
    const rememberSaved = saveGlobal(REMEMBER_LOGIN_KEY, 'true');

    let passwordSaved = true;
    let storeSaved = true;
    if (password) {
      passwordSaved = saveGlobal(REMEMBER_PASSWORD_KEY, b64EncodeUtf8(password));
    } else {
      // Se marcou lembrar, mas não quer salvar senha (ou está vazia), remove
      removeGlobal(REMEMBER_PASSWORD_KEY);
    }

    if (storeId) {
      storeSaved = saveGlobal(REMEMBER_STORE_ID_KEY, storeId);
    } else {
      removeGlobal(REMEMBER_STORE_ID_KEY);
    }

    return usernameSaved && rememberSaved && passwordSaved && storeSaved;
  } catch (error) {
    console.error('[RememberLogin] Erro ao salvar:', error);
    return false;
  }
}

/**
 * Obtém credenciais lembradas.
 * - Password pode vir vazio se não foi salvo.
 */
export function getRememberedLogin(): { username: string; password?: string; storeId?: string } | null {
  // 1) Checar flag global (forma antiga / recomendada)
  let rememberFlag = getGlobal(REMEMBER_LOGIN_KEY);

  // 2) Fallback: algumas instalações migraram esse flag para o storage prefixado (smarttech:${storeId}:remember-login)
  if (!rememberFlag) {
    const migrated = safeGet<boolean>('remember-login', null);
    if (migrated.success && migrated.data === true) {
      rememberFlag = 'true';
      // Restaurar chave global para as próximas execuções
      saveGlobal(REMEMBER_LOGIN_KEY, 'true');
    }
  }

  if (rememberFlag !== 'true') {
    return null;
  }

  // Username (global)
  let username = getGlobal(REMEMBER_EMAIL_KEY);

  // Fallback: se username tiver sido migrado (raro), buscar no prefixado também
  if (!username) {
    const migratedUser = safeGet<string>('remember-email', null);
    if (migratedUser.success && typeof migratedUser.data === 'string' && migratedUser.data.trim()) {
      username = migratedUser.data.trim();
      saveGlobal(REMEMBER_EMAIL_KEY, username);
    }
  }

  if (!username) {
    return null;
  }

  // Password (global, base64)
  let passwordB64 = getGlobal(REMEMBER_PASSWORD_KEY);

  // Fallback: se algum build antigo salvou no prefixado (ou se foi migrado manualmente)
  if (!passwordB64) {
    const migratedPass = safeGet<string>('remember-password', null);
    if (migratedPass.success && typeof migratedPass.data === 'string' && migratedPass.data) {
      passwordB64 = migratedPass.data;
      saveGlobal(REMEMBER_PASSWORD_KEY, passwordB64);
    }
  }

  const password = passwordB64 ? b64DecodeUtf8(passwordB64) : undefined;

  const storeId = getGlobal(REMEMBER_STORE_ID_KEY) || undefined;

  if (password) {
    return { username, password, storeId };
  }

  return { username, storeId };
}

export function clearRememberedLogin(): void {
  try {
    removeGlobal(REMEMBER_EMAIL_KEY);
    removeGlobal(REMEMBER_PASSWORD_KEY);
    removeGlobal(REMEMBER_LOGIN_KEY);
    removeGlobal(REMEMBER_STORE_ID_KEY);
  } catch (error) {
    console.error('[RememberLogin] Erro ao limpar:', error);
  }
}

export function hasRememberedLogin(): boolean {
  const flag = getGlobal(REMEMBER_LOGIN_KEY);
  if (flag === 'true') return true;

  const migrated = safeGet<boolean>('remember-login', null);
  return !!(migrated.success && migrated.data === true);
}
