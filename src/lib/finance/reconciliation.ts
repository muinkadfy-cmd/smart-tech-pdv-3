import { logger } from '@/utils/logger';
import { getMovimentacoes } from '@/lib/data';
import { getVendas } from '@/lib/vendas';
import { getOrdens } from '@/lib/ordens';
import { getVendasUsados } from '@/lib/usados';
import { usadosRepo } from '@/lib/repositories';
import { criarLancamentosVenda, criarLancamentosOS, criarLancamentosUsadoVenda } from './lancamentos';

export type FinanceReconcileReport = {
  checkedVendas: number;
  checkedOrdens: number;
  checkedUsados: number;
  missingVendas: number;
  missingOrdens: number;
  missingUsados: number;
  repairedVendas: number;
  repairedOrdens: number;
  repairedUsados: number;
  skippedUsadosSemCadastro: number;
  changed: boolean;
};

let inflight: Promise<FinanceReconcileReport> | null = null;

function isCardPayment(value: unknown): boolean {
  const fp = String(value || '').trim().toLowerCase();
  return fp === 'cartao' || fp === 'debito' || fp === 'credito';
}

function buildReport(): FinanceReconcileReport {
  return {
    checkedVendas: 0,
    checkedOrdens: 0,
    checkedUsados: 0,
    missingVendas: 0,
    missingOrdens: 0,
    missingUsados: 0,
    repairedVendas: 0,
    repairedOrdens: 0,
    repairedUsados: 0,
    skippedUsadosSemCadastro: 0,
    changed: false,
  };
}

function hasVendaMirror(vendaId: string): boolean {
  const movs = getMovimentacoes();
  return movs.some((m) => m.origem_id === vendaId && m.origem_tipo === 'venda' && m.categoria === 'venda' && m.tipo === 'venda');
}

function hasVendaTaxaMirror(vendaId: string): boolean {
  const movs = getMovimentacoes();
  return movs.some((m) => m.origem_id === vendaId && m.origem_tipo === 'venda' && m.categoria === 'taxa_cartao' && m.tipo === 'taxa_cartao');
}

function hasOsMirror(ordemId: string): boolean {
  const movs = getMovimentacoes();
  return movs.some((m) => m.origem_id === ordemId && m.origem_tipo === 'ordem_servico' && m.categoria === 'ordem_servico' && m.tipo === 'servico');
}

function hasOsTaxaMirror(ordemId: string): boolean {
  const movs = getMovimentacoes();
  return movs.some((m) => m.origem_id === ordemId && m.origem_tipo === 'ordem_servico' && m.categoria === 'taxa_cartao' && m.tipo === 'taxa_cartao');
}

function hasUsadoVendaMirror(vendaId: string): boolean {
  const movs = getMovimentacoes();
  return movs.some((m) => m.origem_id === vendaId && m.origem_tipo === 'venda_usado' && m.categoria === 'venda_usado' && m.tipo === 'venda_usado');
}

export async function reconcileFinancialMirrors(reason: string = 'manual'): Promise<FinanceReconcileReport> {
  if (inflight) return inflight;

  inflight = (async () => {
    const report = buildReport();

    try {
      const vendas = getVendas();
      for (const venda of vendas) {
        report.checkedVendas += 1;

        const statusPagamento = String((venda as any).status_pagamento || 'pago').toLowerCase();
        if (statusPagamento !== 'pago') continue;

        const needsEntrada = !hasVendaMirror(venda.id);
        const needsTaxa = isCardPayment((venda as any).formaPagamento) && Number((venda as any).taxa_cartao_valor || 0) > 0 && !hasVendaTaxaMirror(venda.id);
        if (!needsEntrada && !needsTaxa) continue;

        report.missingVendas += 1;
        const ok = await criarLancamentosVenda(venda);
        if (ok) {
          report.repairedVendas += 1;
          report.changed = true;
          logger.warn('[Financeiro] Espelho financeiro de venda reconciliado', { reason, vendaId: venda.id, numero: (venda as any).numero_venda || venda.id.slice(-6) });
        } else {
          logger.error('[Financeiro] Falha ao reconciliar espelho financeiro de venda', { reason, vendaId: venda.id });
        }
      }

      const ordens = getOrdens();
      for (const ordem of ordens) {
        report.checkedOrdens += 1;

        const statusPagamento = String((ordem as any).status_pagamento || 'pendente').toLowerCase();
        if (statusPagamento !== 'pago') continue;

        const needsEntrada = !hasOsMirror(ordem.id);
        const needsTaxa = isCardPayment((ordem as any).formaPagamento) && Number((ordem as any).taxa_cartao_valor || 0) > 0 && !hasOsTaxaMirror(ordem.id);
        if (!needsEntrada && !needsTaxa) continue;

        report.missingOrdens += 1;
        const ok = await criarLancamentosOS(ordem, { revision: Number((ordem as any).finance_rev || 1) || 1, motivo: 'Reconciliation' });
        if (ok) {
          report.repairedOrdens += 1;
          report.changed = true;
          logger.warn('[Financeiro] Espelho financeiro de OS reconciliado', { reason, ordemId: ordem.id, numero: ordem.numero });
        } else {
          logger.error('[Financeiro] Falha ao reconciliar espelho financeiro de OS', { reason, ordemId: ordem.id });
        }
      }

      const usadosById = new Map(usadosRepo.list().map((item) => [item.id, item] as const));
      const vendasUsados = getVendasUsados();
      for (const venda of vendasUsados) {
        report.checkedUsados += 1;

        if (hasUsadoVendaMirror(venda.id)) continue;

        const usado = usadosById.get(venda.usadoId);
        if (!usado) {
          report.skippedUsadosSemCadastro += 1;
          logger.warn('[Financeiro] Venda de usado sem cadastro base para reconciliar', { reason, vendaId: venda.id, usadoId: venda.usadoId });
          continue;
        }

        report.missingUsados += 1;
        const ok = await criarLancamentosUsadoVenda(venda, usado, venda.compradorId || 'Sistema');
        if (ok) {
          report.repairedUsados += 1;
          report.changed = true;
          logger.warn('[Financeiro] Espelho financeiro de venda de usado reconciliado', { reason, vendaId: venda.id, usadoId: venda.usadoId });
        } else {
          logger.error('[Financeiro] Falha ao reconciliar espelho financeiro de venda de usado', { reason, vendaId: venda.id, usadoId: venda.usadoId });
        }
      }

      if (report.changed) {
        try {
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'smart-tech-financeiro-reconciled',
            newValue: Date.now().toString(),
          }));
        } catch {}
      }

      logger.log('[Financeiro] Reconcile de espelhos concluído', { reason, report });
      return report;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
