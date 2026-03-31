import { getMovimentacoes } from '@/lib/data';
import { getOrdens } from '@/lib/ordens';
import { usadosRepo } from '@/lib/repositories';
import { getVendas } from '@/lib/vendas';
import { getVendasUsados } from '@/lib/usados';
import { logger } from '@/utils/logger';
import { reconcileFinancialMirrors, type FinanceReconcileReport } from './reconciliation';

type AuditIds = {
  missingVendaIds: string[];
  missingOrdemIds: string[];
  missingUsadoIds: string[];
  orphanVendaMovementIds: string[];
  orphanOrdemMovementIds: string[];
  orphanUsadoMovementIds: string[];
};

export type FinancialIntegrityAuditReport = {
  checkedAt: string;
  paidVendasChecked: number;
  paidOrdensChecked: number;
  usedSalesChecked: number;
  totalRelevantMovements: number;
  missingVendaMirrors: number;
  missingOrdemMirrors: number;
  missingUsadoMirrors: number;
  orphanVendaMovements: number;
  orphanOrdemMovements: number;
  orphanUsadoMovements: number;
  panelFinanceFluxConsistent: boolean;
  ids: AuditIds;
};

export type FinancialIntegrityRepairResult = {
  reconcile: FinanceReconcileReport;
  report: FinancialIntegrityAuditReport;
};

function isCardPayment(value: unknown): boolean {
  const fp = String(value || '').trim().toLowerCase();
  return fp === 'cartao' || fp === 'debito' || fp === 'credito';
}

function hasVendaMirror(vendaId: string): boolean {
  const movs = getMovimentacoes();
  return movs.some((m) => m.origem_id === vendaId && m.origem_tipo === 'venda' && m.categoria === 'venda' && m.tipo === 'venda');
}

function hasVendaTaxaMirror(vendaId: string): boolean {
  const movs = getMovimentacoes();
  return movs.some((m) => m.origem_id === vendaId && m.origem_tipo === 'venda' && m.categoria === 'taxa_cartao' && m.tipo === 'taxa_cartao');
}

function hasOrdemMirror(ordemId: string): boolean {
  const movs = getMovimentacoes();
  return movs.some((m) => m.origem_id === ordemId && m.origem_tipo === 'ordem_servico' && m.categoria === 'ordem_servico' && m.tipo === 'servico');
}

function hasOrdemTaxaMirror(ordemId: string): boolean {
  const movs = getMovimentacoes();
  return movs.some((m) => m.origem_id === ordemId && m.origem_tipo === 'ordem_servico' && m.categoria === 'taxa_cartao' && m.tipo === 'taxa_cartao');
}

function hasUsadoMirror(vendaId: string): boolean {
  const movs = getMovimentacoes();
  return movs.some((m) => m.origem_id === vendaId && m.origem_tipo === 'venda_usado' && m.categoria === 'venda_usado' && m.tipo === 'venda_usado');
}

export async function runFinancialIntegrityAudit(): Promise<FinancialIntegrityAuditReport> {
  const movs = getMovimentacoes();
  const vendas = getVendas();
  const ordens = getOrdens();
  const usadosVendas = getVendasUsados();
  const usadosById = new Set(usadosRepo.list().map((item) => item.id));
  const vendaIds = new Set(vendas.map((item) => item.id));
  const ordemIds = new Set(ordens.map((item) => item.id));
  const usadoVendaIds = new Set(usadosVendas.map((item) => item.id));

  const ids: AuditIds = {
    missingVendaIds: [],
    missingOrdemIds: [],
    missingUsadoIds: [],
    orphanVendaMovementIds: [],
    orphanOrdemMovementIds: [],
    orphanUsadoMovementIds: [],
  };

  let paidVendasChecked = 0;
  let paidOrdensChecked = 0;
  let usedSalesChecked = 0;

  for (const venda of vendas) {
    const statusPagamento = String((venda as any).status_pagamento || 'pago').toLowerCase();
    if (statusPagamento !== 'pago') continue;
    paidVendasChecked += 1;

    const needsEntrada = !hasVendaMirror(venda.id);
    const needsTaxa = isCardPayment((venda as any).formaPagamento) && Number((venda as any).taxa_cartao_valor || 0) > 0 && !hasVendaTaxaMirror(venda.id);
    if (needsEntrada || needsTaxa) {
      ids.missingVendaIds.push(venda.id);
    }
  }

  for (const ordem of ordens) {
    const statusPagamento = String((ordem as any).status_pagamento || 'pendente').toLowerCase();
    if (statusPagamento !== 'pago') continue;
    paidOrdensChecked += 1;

    const needsEntrada = !hasOrdemMirror(ordem.id);
    const needsTaxa = isCardPayment((ordem as any).formaPagamento) && Number((ordem as any).taxa_cartao_valor || 0) > 0 && !hasOrdemTaxaMirror(ordem.id);
    if (needsEntrada || needsTaxa) {
      ids.missingOrdemIds.push(ordem.id);
    }
  }

  for (const venda of usadosVendas) {
    usedSalesChecked += 1;
    if (!usadosById.has(venda.usadoId) || hasUsadoMirror(venda.id)) continue;
    ids.missingUsadoIds.push(venda.id);
  }

  for (const mov of movs) {
    if (mov.origem_tipo === 'venda' && mov.origem_id && !vendaIds.has(mov.origem_id)) {
      ids.orphanVendaMovementIds.push(mov.id);
    }
    if (mov.origem_tipo === 'ordem_servico' && mov.origem_id && !ordemIds.has(mov.origem_id)) {
      ids.orphanOrdemMovementIds.push(mov.id);
    }
    if (mov.origem_tipo === 'venda_usado' && mov.origem_id && !usadoVendaIds.has(mov.origem_id)) {
      ids.orphanUsadoMovementIds.push(mov.id);
    }
  }

  const report: FinancialIntegrityAuditReport = {
    checkedAt: new Date().toISOString(),
    paidVendasChecked,
    paidOrdensChecked,
    usedSalesChecked,
    totalRelevantMovements: movs.filter((mov) => ['venda', 'venda_usado', 'servico', 'taxa_cartao'].includes(String(mov.tipo))).length,
    missingVendaMirrors: ids.missingVendaIds.length,
    missingOrdemMirrors: ids.missingOrdemIds.length,
    missingUsadoMirrors: ids.missingUsadoIds.length,
    orphanVendaMovements: ids.orphanVendaMovementIds.length,
    orphanOrdemMovements: ids.orphanOrdemMovementIds.length,
    orphanUsadoMovements: ids.orphanUsadoMovementIds.length,
    panelFinanceFluxConsistent:
      ids.missingVendaIds.length === 0 &&
      ids.missingOrdemIds.length === 0 &&
      ids.missingUsadoIds.length === 0 &&
      ids.orphanVendaMovementIds.length === 0 &&
      ids.orphanOrdemMovementIds.length === 0 &&
      ids.orphanUsadoMovementIds.length === 0,
    ids,
  };

  logger.log('[Financeiro] Auditoria de integridade concluída', report);
  return report;
}

export async function repairFinancialIntegrity(reason: string = 'manual-audit'): Promise<FinancialIntegrityRepairResult> {
  const reconcile = await reconcileFinancialMirrors(reason);
  const report = await runFinancialIntegrityAudit();
  return { reconcile, report };
}
