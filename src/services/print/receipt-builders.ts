import type { Cliente, OrdemServico, Recibo, Venda } from '@/types';
import { getClientes } from '@/lib/clientes';
import { fetchCompany } from '@/lib/company-service';
import { formatVendaId } from '@/lib/format-display-id';
import { getOrdemPorId } from '@/lib/ordens';
import { getRecibos } from '@/lib/recibos';
import { getVendaPorId } from '@/lib/vendas';
import type { EmpresaInfo, PrintData } from '@/lib/print-template';

export type PrintableReceiptType = 'sale' | 'receipt' | 'service-order';

export interface ThermalReceiptLineItem {
  label: string;
  quantity?: number;
  unitPrice?: number;
  total: number;
  note?: string;
}

export interface ThermalReceiptModel {
  type: PrintableReceiptType;
  title: string;
  documentNumber: string;
  dateLabel: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  company: EmpresaInfo;
  items: ThermalReceiptLineItem[];
  subtotal?: number;
  discount?: number;
  total: number;
  paymentLabel?: string;
  installmentsLabel?: string;
  notes?: string[];
  footerMessage: string;
}

export interface ResolvedReceiptPrintData {
  printData: PrintData;
  thermalModel: ThermalReceiptModel;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));
}

function formatDateLabel(date?: string): string {
  const target = date ? new Date(date) : new Date();
  return target.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getClienteById(clienteId?: string | null): Cliente | undefined {
  if (!clienteId) return undefined;
  return (getClientes() ?? []).find((cliente) => cliente.id === clienteId);
}

function getClienteEndereco(cliente?: Cliente, snapshot?: string): string | undefined {
  if (snapshot?.trim()) return snapshot.trim();
  if (!cliente) return undefined;
  const parts = [cliente.endereco, cliente.cidade, cliente.estado].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

async function resolveCompanyInfo(): Promise<EmpresaInfo> {
  const result = await fetchCompany().catch(() => ({ success: false as const }));
  const company = result.success ? result.company : null;
  return {
    nome: company?.nome_fantasia || 'Smart Tech',
    cnpj: company?.cnpj || undefined,
    telefone: company?.telefone || undefined,
    endereco: company?.endereco || undefined,
    cidade: company?.cidade || undefined,
    estado: company?.estado || undefined,
    logo_url: company?.logo_url || undefined,
    slogan: company?.mensagem_rodape || 'Obrigado pela preferencia. Volte sempre.',
  };
}

export async function buildSaleReceiptById(id: string): Promise<ResolvedReceiptPrintData | null> {
  const venda = getVendaPorId(id);
  if (!venda) return null;

  const cliente = getClienteById(venda.clienteId);
  const enderecoCliente = [
    venda.clienteEndereco ?? cliente?.endereco,
    venda.clienteCidade ?? cliente?.cidade,
    venda.clienteEstado ?? cliente?.estado,
  ].filter(Boolean).join(', ') || undefined;

  const itens = venda.itens.map((item) => {
    const noteParts = [
      item.manual_modelo ? `Modelo: ${String(item.manual_modelo).trim()}` : '',
      item.manual_cor ? `Cor: ${String(item.manual_cor).trim()}` : '',
      item.manual_imei ? `IMEI: ${String(item.manual_imei).trim()}` : '',
      item.manual_descricao ? String(item.manual_descricao).trim() : '',
    ].filter(Boolean);

    return {
      nome: item.produtoNome,
      quantidade: item.quantidade,
      preco: item.precoUnitario,
      descricao: noteParts.length ? noteParts.join(' | ') : undefined,
    };
  });

  const total = Number((venda as any).total_liquido ?? (venda as any).totalLiquido ?? (venda as any).total_final ?? venda.total ?? 0);
  const subtotal = Number((venda as any).total_bruto ?? venda.total ?? total);
  const discount = Number((venda as any).desconto ?? 0);

  let installmentsLabel = '';
  if ((venda.formaPagamento === 'credito' || venda.formaPagamento === 'cartao') && total > 0) {
    const numParcelas = venda.parcelas || 1;
    if (numParcelas > 1) {
      installmentsLabel = `${numParcelas}x de ${formatCurrency(total / numParcelas)}`;
    }
  }

  const company = await resolveCompanyInfo();
  const numero = venda.numero_venda ? `V-${venda.numero_venda}` : formatVendaId(venda.id);

  return {
    printData: {
      tipo: 'venda',
      numero,
      clienteNome: venda.clienteNome,
      clienteTelefone: venda.clienteTelefone ?? cliente?.telefone,
      clienteEndereco: enderecoCliente,
      data: venda.data,
      itens,
      valorTotal: total,
      valorBruto: subtotal,
      desconto: discount,
      formaPagamento: venda.formaPagamento,
      parcelas: installmentsLabel,
      cpfCnpj: (cliente as any)?.cpfCnpj ?? cliente?.cpf,
      garantia: venda.warranty_months ? `${venda.warranty_months} ${venda.warranty_months === 1 ? 'mês' : 'meses'}` : undefined,
      termosGarantia: venda.warranty_terms?.trim() || undefined,
      observacoes: venda.observacoes || undefined,
    },
    thermalModel: {
      type: 'sale',
      title: 'Comprovante de venda',
      documentNumber: numero,
      dateLabel: formatDateLabel(venda.data),
      customerName: venda.clienteNome || undefined,
      customerPhone: venda.clienteTelefone ?? cliente?.telefone,
      customerAddress: enderecoCliente,
      company,
      items: itens.map((item) => ({
        label: item.nome,
        quantity: item.quantidade,
        unitPrice: item.preco,
        total: item.preco * item.quantidade,
        note: item.descricao,
      })),
      subtotal,
      discount: discount > 0 ? discount : undefined,
      total,
      paymentLabel: venda.formaPagamento ? String(venda.formaPagamento).toUpperCase() : undefined,
      installmentsLabel: installmentsLabel || undefined,
      notes: [venda.observacoes, venda.warranty_terms].filter(Boolean) as string[],
      footerMessage: company.slogan || 'Obrigado pela preferencia. Volte sempre.',
    },
  };
}

export async function buildReceiptById(id: string): Promise<ResolvedReceiptPrintData | null> {
  const recibo = (getRecibos() ?? []).find((item) => item.id === id);
  if (!recibo) return null;

  const cliente = getClienteById(recibo.clienteId);
  const enderecoCliente = getClienteEndereco(cliente);
  const company = await resolveCompanyInfo();

  return {
    printData: {
      tipo: 'recibo',
      numero: recibo.numero,
      clienteNome: recibo.clienteNome,
      clienteTelefone: cliente?.telefone || recibo.clienteTelefone,
      clienteEndereco: enderecoCliente,
      data: recibo.data,
      descricao: recibo.descricao,
      tipoRecibo: recibo.tipo,
      valorTotal: recibo.valor,
      formaPagamento: recibo.formaPagamento,
      observacoes: recibo.observacoes,
    },
    thermalModel: {
      type: 'receipt',
      title: 'Recibo simples',
      documentNumber: recibo.numero,
      dateLabel: formatDateLabel(recibo.data),
      customerName: recibo.clienteNome,
      customerPhone: cliente?.telefone || recibo.clienteTelefone,
      customerAddress: enderecoCliente,
      company,
      items: [{
        label: recibo.descricao,
        total: recibo.valor,
      }],
      total: recibo.valor,
      paymentLabel: recibo.formaPagamento ? String(recibo.formaPagamento).toUpperCase() : undefined,
      notes: [recibo.observacoes].filter(Boolean) as string[],
      footerMessage: company.slogan || 'Obrigado pela preferencia. Volte sempre.',
    },
  };
}

export async function buildServiceOrderReceiptById(id: string): Promise<ResolvedReceiptPrintData | null> {
  const ordem = getOrdemPorId(id);
  if (!ordem) return null;

  const cliente = getClienteById(ordem.clienteId);
  const enderecoCliente = getClienteEndereco(cliente);
  const total = Number(ordem.total_bruto || ordem.valorTotal || ((ordem.valorServico || 0) + (ordem.valorPecas || 0)));
  const company = await resolveCompanyInfo();
  const garantia = ordem.warranty_months ? `${ordem.warranty_months} ${ordem.warranty_months === 1 ? 'mês' : 'meses'}` : undefined;

  const items: ThermalReceiptLineItem[] = [];
  if ((ordem.valorServico || 0) > 0) {
    items.push({ label: 'Serviço técnico', total: Number(ordem.valorServico || 0) });
  }
  if ((ordem.valorPecas || 0) > 0) {
    items.push({ label: 'Peças', total: Number(ordem.valorPecas || 0) });
  }
  if (items.length === 0) {
    items.push({ label: ordem.equipamento || 'Ordem de serviço', total });
  }

  return {
    printData: {
      tipo: 'ordem-servico',
      numero: ordem.numero,
      clienteNome: ordem.clienteNome,
      clienteTelefone: ordem.clienteTelefone || cliente?.telefone,
      clienteEndereco: enderecoCliente,
      data: ordem.dataAbertura,
      equipamento: ordem.equipamento,
      marca: ordem.marca,
      modelo: ordem.modelo,
      cor: ordem.cor,
      garantia,
      defeito: ordem.defeito,
      reparo: ordem.laudoTecnico || undefined,
      situacao: ordem.situacao,
      tecnico: ordem.tecnico,
      dataConclusao: ordem.dataConclusao,
      valorServico: ordem.valorServico,
      valorPecas: ordem.valorPecas,
      valorTotal: total,
      valorBruto: total,
      formaPagamento: ordem.formaPagamento,
      parcelas: ordem.parcelas ? `${ordem.parcelas}x` : undefined,
      observacoes: ordem.observacoes,
      termosGarantia: ordem.warranty_terms_snapshot || undefined,
      acessorios: ordem.acessorios || [],
      laudoTecnico: ordem.laudoTecnico || undefined,
    },
    thermalModel: {
      type: 'service-order',
      title: 'Ordem de serviço',
      documentNumber: ordem.numero,
      dateLabel: formatDateLabel(ordem.dataAbertura),
      customerName: ordem.clienteNome,
      customerPhone: ordem.clienteTelefone || cliente?.telefone,
      customerAddress: enderecoCliente,
      company,
      items,
      total,
      paymentLabel: ordem.formaPagamento ? String(ordem.formaPagamento).toUpperCase() : undefined,
      notes: [ordem.defeito, ordem.laudoTecnico, ordem.observacoes, ordem.warranty_terms_snapshot].filter(Boolean) as string[],
      footerMessage: company.slogan || 'Obrigado pela preferencia. Volte sempre.',
    },
  };
}

export async function resolveReceiptPrintData(type: PrintableReceiptType, id: string): Promise<ResolvedReceiptPrintData | null> {
  if (type === 'sale') return buildSaleReceiptById(id);
  if (type === 'receipt') return buildReceiptById(id);
  if (type === 'service-order') return buildServiceOrderReceiptById(id);
  return null;
}

