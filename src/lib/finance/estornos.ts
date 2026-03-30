/**
 * Estornos Financeiros (Espelho)
 * - Cria lançamentos inversos com origem_tipo='estorno'
 * - Idempotente por movimentação de origem (Ref:mov:<id>)
 *
 * Objetivo: evitar divergência financeira quando apagar/voltar status de Venda/OS/Cobrança etc.
 */

import type { Movimentacao, TipoMovimentacao } from '@/types';
import { createMovimentacao, getMovimentacoes } from '@/lib/data';
import { logger } from '@/utils/logger';

const TIPOS_ENTRADA: TipoMovimentacao[] = ['venda', 'venda_usado', 'servico', 'entrada', 'cobranca', 'encomenda'];
const TIPOS_SAIDA: TipoMovimentacao[] = ['saida', 'gasto', 'taxa_cartao', 'compra_usado', 'compra_estoque', 'devolucao'];

function isEntrada(m: Movimentacao): boolean {
  return TIPOS_ENTRADA.includes(m.tipo as any);
}

function isSaida(m: Movimentacao): boolean {
  return TIPOS_SAIDA.includes(m.tipo as any);
}

function reverseTipo(m: Movimentacao): TipoMovimentacao {
  // Para estorno, usamos apenas 'entrada' e 'saida' (caixa real)
  if (isEntrada(m)) return 'saida';
  if (isSaida(m)) return 'entrada';

  // Fallback seguro
  if ((m.tipo as any) === 'entrada') return 'saida';
  return 'entrada';
}

function categoriaEstorno(origemTipo: string, m: Movimentacao): string {
  const cat = String(m.categoria || '').toLowerCase();

  if ((m.tipo as any) === 'taxa_cartao' || cat.includes('taxa')) return 'ESTORNO_TAXA_CARTAO';

  const origem = String(origemTipo || m.origem_tipo || 'DOC').toUpperCase();
  if (origem === 'ORDEM_SERVICO') return 'ESTORNO_OS';
  if (origem === 'VENDA') return 'ESTORNO_VENDA';
  if (origem === 'COBRANCA') return 'ESTORNO_COBRANCA';
  if (origem === 'DEVOLUCAO') return 'CANCELA_DEVOLUCAO';
  if (origem === 'MANUAL') return 'ESTORNO_MANUAL';

  return `ESTORNO_${origem}`;
}

function hasEstornoForMovId(movs: Movimentacao[], movId: string): boolean {
  const ref = `Ref:mov:${movId}`;
  return movs.some(m => m.origem_tipo === 'estorno' && String(m.descricao || '').includes(ref));
}

export async function criarEstornosEspelhoPorOrigem(
  origemTipo: NonNullable<Movimentacao['origem_tipo']>,
  origemId: string,
  responsavel: string,
  motivo?: string
): Promise<{ created: number; skipped: number; sourceCount: number; }> {
  const all = getMovimentacoes();
  const fontes = all.filter(m => m.origem_tipo === origemTipo && m.origem_id === origemId);

  let created = 0;
  let skipped = 0;

  for (const fonte of fontes) {
    if (!fonte?.id) continue;

    // Pula se já existe estorno para esse lançamento
    if (hasEstornoForMovId(all, fonte.id)) {
      skipped++;
      continue;
    }

    const valor = Math.abs(Number(fonte.valor || 0));
    if (!Number.isFinite(valor) || valor <= 0) continue;

    const tipo = reverseTipo(fonte);
    const categoria = categoriaEstorno(origemTipo, fonte);

    const base = motivo?.trim() || `Reversão de ${String(origemTipo)} (${origemId.slice(-6)})`;
    const descricao = `🔄 Estorno - ${base} (Ref:mov:${fonte.id})`;

    try {
      await createMovimentacao(tipo, valor, responsavel || 'Sistema', descricao, {
        origem_tipo: 'estorno',
        origem_id: origemId,
        categoria,
        forma_pagamento: fonte.forma_pagamento
      });
      created++;
    } catch (e) {
      logger.error('[Financeiro] Falha ao criar estorno espelho:', e);
    }
  }

  logger.log(`[Financeiro] Estornos espelho (${origemTipo}:${origemId}) fontes=${fontes.length} criados=${created} pulados=${skipped}`);
  return { created, skipped, sourceCount: fontes.length };
}

export async function criarEstornoFallback(
  origemId: string,
  responsavel: string,
  tipo: TipoMovimentacao,
  valor: number,
  categoria: string,
  descricao: string
): Promise<void> {
  const v = Math.abs(Number(valor || 0));
  if (!Number.isFinite(v) || v <= 0) return;

  // evita duplicar fallback
  const all = getMovimentacoes();
  const key = `Ref:fallback:${categoria}:${origemId}`;
  if (all.some(m => m.origem_tipo === 'estorno' && String(m.descricao || '').includes(key))) return;

  await createMovimentacao(tipo, v, responsavel || 'Sistema', `${descricao} (${key})`, {
    origem_tipo: 'estorno',
    origem_id: origemId,
    categoria
  });
}
