import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { usadosArquivosRepo } from '@/lib/repositories';
import type { UsadoArquivo, UsadoArquivoKind } from '@/types';
import { generateId } from '@/lib/storage';
import { logger } from '@/utils/logger';
import { isLocalOnly } from '@/lib/mode';
import { getClientId } from '@/lib/tenant';
import { getRuntimeStoreId } from '@/lib/runtime-context';
import { putUsadoFile, getUsadoFileBlob, UsadoFileRecord } from '@/lib/usados-files-store';
import {
  downloadRemoteUsadoFile,
  hasUsadosRemoteStorage,
  uploadRemoteUsadoFile
} from '@/lib/capabilities/usados-upload-remote-adapter';
import { isBrowserOnlineSafe } from '@/lib/capabilities/runtime-remote-adapter';
import { openExternalUrlByPlatform } from '@/lib/capabilities/external-url-adapter';

export const BUCKET_USADOS_PHOTOS = 'usados_aparelho_photos';
export const BUCKET_USADOS_DOCS = 'usados_documentos';

// Bucket virtual para anexos offline
export const LOCAL_USADOS_BUCKET = '__local__';

export function isLocalUsadosBucket(bucket: string): boolean {
  return bucket === LOCAL_USADOS_BUCKET;
}

export function getUsadoStorageLabel(bucket: string): string {
  return isLocalUsadosBucket(bucket) ? 'Somente local/offline' : 'Sincronizado no Supabase';
}

function isLocalBucket(bucket: string): boolean {
  return isLocalUsadosBucket(bucket);
}

function requireSupabase(): void {
  if (!isSupabaseConfigured()) throw new Error('Supabase não configurado.');
  if (!hasUsadosRemoteStorage()) throw new Error('Cliente Supabase indisponível.');
}

function requireStoreId(): string {
  const storeId = getRuntimeStoreId()?.trim() || '';
  if (!storeId) throw new Error('Loja ativa invalida ou ausente.');
  return storeId;
}

function sanitizeFilename(name: string): string {
  if (!name || name.trim().length === 0) {
    return 'arquivo';
  }
  
  return name
    .normalize('NFD') // Decompor caracteres Unicode (á → a + ´)
    .replace(/[\u0300-\u036f]/g, '') // Remover diacríticos (acentos)
    .replace(/[/\\?%*:|"<>]/g, '-') // Remover caracteres inválidos
    .replace(/\s+/g, '_') // Espaços → underscore
    .replace(/[^\w\-_.]/g, '') // Remover qualquer outro char especial
    .replace(/_{2,}/g, '_') // Múltiplos underscores → 1
    .replace(/^[._-]+/, '') // Remover prefixo inválido
    .replace(/[._-]+$/, '') // Remover sufixo inválido
    .slice(0, 120) // Limitar tamanho
    .toLowerCase() // Padronizar em minúsculas
    || 'arquivo'; // Fallback se tudo for removido
}

async function uploadToBucket(params: {
  usadoId: string;
  kind: UsadoArquivoKind;
  file: File;
}): Promise<UsadoArquivo> {
  // ✅ Modo LOCAL ONLY: salvar sempre no IndexedDB
  if (isLocalOnly() || !isSupabaseConfigured() || !isBrowserOnlineSafe()) {
    const now = new Date().toISOString();
    const localFileId = generateId();
    const storeId = getRuntimeStoreId() || undefined;

    const record: UsadoFileRecord = {
      id: localFileId,
      clientId: getClientId(),
      storeId,
      usadoId: params.usadoId,
      kind: params.kind,
      originalName: params.file.name || undefined,
      mimeType: params.file.type || undefined,
      sizeBytes: params.file.size || undefined,
      created_at: now,
      blob: params.file
    };

    await putUsadoFile(record);

    // Persistir metadados na tabela local (usados_arquivos)
    const row: UsadoArquivo = {
      id: generateId(),
      usadoId: params.usadoId,
      kind: params.kind,
      bucket: LOCAL_USADOS_BUCKET,
      path: localFileId,
      mimeType: params.file.type || undefined,
      originalName: params.file.name || undefined,
      sizeBytes: params.file.size || undefined,
      created_at: now,
      storeId: storeId as any
    };

    const saved = await usadosArquivosRepo.upsert(row);
    if (!saved) throw new Error('Falha ao salvar metadados do arquivo (offline)');
    return saved;
  }

  // ✅ Online (fallback legado): Supabase Storage
  requireSupabase();
  const storeId = requireStoreId();

  const bucket = params.kind === 'photo' ? BUCKET_USADOS_PHOTOS : BUCKET_USADOS_DOCS;
  
  // Sanitizar nome do arquivo
  const originalName = params.file.name || `${params.kind}.bin`;
  const sanitizedName = sanitizeFilename(originalName);
  
  // Extrair extensão do arquivo original
  const extension = originalName.includes('.') 
    ? originalName.split('.').pop()?.toLowerCase() 
    : (params.kind === 'photo' ? 'jpg' : 'pdf');
  
  // Garantir que o nome tenha extensão
  const fileName = sanitizedName.includes('.') 
    ? sanitizedName 
    : `${sanitizedName}.${extension}`;
  
  // Montar path padronizado: storeId/usadoId/timestamp-filename
  const path = `${storeId}/${params.usadoId}/${Date.now()}-${fileName}`;

  // Log para debug
  if (import.meta.env.DEV) {
    logger.log('[UsadosUploads] Upload:', {
      original: originalName,
      sanitized: fileName,
      path,
      size: params.file.size,
      type: params.file.type
    });
  }

  const { error } = await uploadRemoteUsadoFile(bucket, path, params.file);

  if (error) {
    logger.error('[UsadosUploads] Erro upload:', {
      error: error.message,
      original: originalName,
      path,
      bucket
    });
    throw new Error(error.message || 'Erro ao fazer upload');
  }

  const currentStoreId = getRuntimeStoreId();
  const row: UsadoArquivo = {
    id: generateId(),
    usadoId: params.usadoId,
    kind: params.kind,
    bucket,
    path,
    mimeType: params.file.type || undefined,
    originalName: params.file.name || undefined,
    sizeBytes: params.file.size || undefined,
    created_at: new Date().toISOString(),
    storeId: currentStoreId as any
  };

  const saved = await usadosArquivosRepo.upsert(row);
  if (!saved) throw new Error('Falha ao salvar metadados do arquivo');
  return saved;
}

export async function uploadPhoto(usadoId: string, file: File): Promise<UsadoArquivo> {
  return uploadToBucket({ usadoId, file, kind: 'photo' });
}

export async function uploadDocument(usadoId: string, file: File): Promise<UsadoArquivo> {
  return uploadToBucket({ usadoId, file, kind: 'document' });
}

export async function downloadFile(bucket: string, path: string): Promise<Blob> {
  if (isLocalBucket(bucket)) {
    const blob = await getUsadoFileBlob(path);
    if (!blob) throw new Error('Arquivo não encontrado no armazenamento offline (IndexedDB).');
    return blob;
  }

  if (!isBrowserOnlineSafe()) throw new Error('Sem internet. Download do arquivo remoto exige conexão.');
  requireSupabase();
  const { data, error } = await downloadRemoteUsadoFile(bucket, path);
  if (error || !data) throw new Error(error?.message || 'Erro ao baixar arquivo');
  return data;
}

export async function openFileInNewTab(bucket: string, path: string): Promise<void> {
  const blob = await downloadFile(bucket, path);
  const url = URL.createObjectURL(blob);

  // Abrir em nova aba. Em alguns celulares isso vira "download" automaticamente.
  await openExternalUrlByPlatform(url);

  // Liberar URL depois de um tempo (evita vazamento de memória)
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function saveFileToDevice(
  bucket: string,
  path: string,
  fileName?: string
): Promise<void> {
  const blob = await downloadFile(bucket, path);
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || path.split('/').pop() || 'arquivo';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
