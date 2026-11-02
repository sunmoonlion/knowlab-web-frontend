/**
 * Author Method API Client & Registry for Expert Assembly.
 * Connects to /api/web/v1/method-units and /api/web/v1/knowbots/{id}/workdraft/methods/bind.
 */

import { requestJson } from '@/lib/common/api-client'
import type { MethodReference } from '@/contracts/workdraft'

export interface MethodVersionSummary {
  method_id: string
  version: number
  digest: string
  definition: {
    schema: string
    step: {
      id: string
      title: string
      does: string
      why: string
      uses: string[]
      rules: Array<{ id: string; text: string }>
      outputs: Array<{ name: string; type: string }>
      selection?: {
        applies_when: string
        required: boolean
        max_calls: number
      }
    }
    input_schemas: Record<string, Record<string, unknown>>
  }
  provenance: Record<string, unknown>
  created_at: string
}

export interface MethodListingItem {
  method_id: string
  latest_version: number
  created_at: string
  title?: string
  does?: string
}

export interface BindMethodCommand {
  request_id: string
  revision: number
  alias: string
  digest: string
  inputs: Record<string, string>
  required?: boolean
  max_calls?: number
}

// 14 Core Financial & Valuation Methods Catalog (Author Guidance)
export const CORE_14_FINANCIAL_METHODS = [
  {
    id: 'fin_statement_restructure',
    title: '财务三表标准化重构与口径对齐',
    category: 'accounting',
    provenance: '财政部《企业会计准则第30号——财务报表列报》(CAS 30)',
    slot: 'raw_statements',
    outputs: ['standardized_balance_sheet', 'standardized_income_statement', 'reclassification_audit_trail'],
  },
  {
    id: 'accounting_statement_reconciliation',
    title: '报表勾稽平衡与重述校验',
    category: 'accounting',
    provenance: '中国注册会计师审计准则第1501号及三表勾稽平衡公理',
    slot: 'standardized_statements',
    outputs: ['reconciliation_status', 'balance_sheet_balance_diff', 'audit_reconciliations'],
  },
  {
    id: 'dupont_five_way_decomposition',
    title: '杜邦五步分解法',
    category: 'profitability',
    provenance: '经典杜邦分析体系与特许金融分析师(CFA)财务分析框架',
    slot: 'financial_panel',
    outputs: ['roe', 'operating_margin', 'asset_turnover', 'equity_multiplier', 'dupont_table'],
  },
  {
    id: 'solvency_liquidity_stress_check',
    title: '偿债压力与流动性体检',
    category: 'solvency',
    provenance: '信用评级方法论与企业偿债能力分析通用准则',
    slot: 'standardized_bs',
    outputs: ['current_ratio', 'quick_ratio', 'debt_to_assets_ratio', 'stress_test_survival_days'],
  },
  {
    id: 'working_capital_cash_cycle_analysis',
    title: '营运资本周转与现金循环周期',
    category: 'efficiency',
    provenance: '营运资本管理理论与理查兹-劳克林(Richards & Laughlin)现金循环模型',
    slot: 'multi_period_statements',
    outputs: ['dio_inventory_days', 'dso_receivable_days', 'dpo_payable_days', 'ccc_cash_conversion_cycle'],
  },
  {
    id: 'earnings_quality_accrual_audit',
    title: '收益质量分析与应计项排雷',
    category: 'quality',
    provenance: '斯隆(Sloan 1996)应计异象与企业自由现金流估值前置体检规范',
    slot: 'cfs_data',
    outputs: ['ocf_to_net_profit_ratio', 'free_cash_flow', 'accrual_items_total', 'earnings_quality_rating'],
  },
  {
    id: 'historical_cagr_trend_extrapolation',
    title: '复合年均增长率测算与趋势外推',
    category: 'growth',
    provenance: '证券投资分析复合增长率统计标准与趋势回归方法',
    slot: 'time_series',
    outputs: ['revenue_cagr', 'net_profit_cagr', 'ocf_cagr', 'extrapolated_forecast_next_year'],
  },
  {
    id: 'comprehensive_dossier_formatting',
    title: '结构化研究底稿与报告成稿编排',
    category: 'reporting',
    provenance: '中国证券业协会证券投资咨询业务分析报告执业规范',
    slot: 'dossier_components',
    outputs: ['executive_summary', 'full_dossier_markdown', 'components_included_count'],
  },
  {
    id: 'non_recurring_items_purification',
    title: '非经常性损益穿透与扣非还原',
    category: 'quality',
    provenance: '证监会《公开发行证券的公司信息披露解释性公告第1号》',
    slot: 'income_and_nonrec',
    outputs: ['net_profit_parent', 'non_recurring_items_net', 'deducted_net_profit', 'non_recurring_profit_ratio'],
  },
  {
    id: 'segment_volume_price_decomposition',
    title: '分部业务量价拆解',
    category: 'unit_economics',
    provenance: '《企业会计准则第35号——分部报告》及主营业务量价归因模型',
    slot: 'segment_disclosure',
    outputs: ['volume_contribution_amount', 'price_contribution_amount', 'product_mix_upgrade_analysis'],
  },
  {
    id: 'customer_supplier_concentration_scan',
    title: '客户与供应商集中度透视',
    category: 'risk',
    provenance: '证监会《公开发行证券的公司信息披露内容与格式准则第2号》',
    slot: 'counterparty_data',
    outputs: ['top5_customer_share_total', 'top5_supplier_share_total', 'supply_chain_risk_rating'],
  },
  {
    id: 'dcf_intrinsic_valuation',
    title: '企业自由现金流贴现模型 DCF',
    category: 'valuation',
    provenance: 'Aswath Damodaran《投资估价》与CAPM资本资产定价模型',
    slot: 'dcf_inputs',
    outputs: ['wacc_rate', 'enterprise_value_ev', 'equity_intrinsic_value', 'implied_share_price'],
  },
  {
    id: 'relative_multiple_valuation',
    title: '相对估值倍数与历史分位数对标',
    category: 'valuation',
    provenance: '现代投资组合理论相对估值分析规范',
    slot: 'multiple_inputs',
    outputs: ['pe_ttm', 'pb_ratio', 'historical_pe_percentile', 'valuation_watermark_verdict'],
  },
  {
    id: 'competitive_moat_thesis_synthesis',
    title: '竞争壁垒与核心投资假说验证',
    category: 'strategy',
    provenance: '晨星(Morningstar)经济护城河分析评级理论',
    slot: 'moat_inputs',
    outputs: ['moat_grade_rating', 'pricing_power_score', 'roic_wacc_spread', 'moat_synthesis_summary'],
  },
] as const

/**
 * Fetch available method units for authoring.
 */
export async function listMethods(params?: { limit?: number; offset?: number }): Promise<MethodListingItem[]> {
  const limit = params?.limit ?? 50
  const offset = params?.offset ?? 0
  return requestJson<MethodListingItem[]>(`/api/web/v1/method-units?limit=${limit}&offset=${offset}`)
}

/**
 * Fetch immutable definition of a specific method version.
 */
export async function getMethodVersion(methodId: string, version: number): Promise<MethodVersionSummary> {
  return requestJson<MethodVersionSummary>(`/api/web/v1/method-units/${methodId}/versions/${version}`)
}

/**
 * Bind a pinned method version to the expert workdraft step alias.
 */
export async function bindMethod(botId: string, cmd: BindMethodCommand): Promise<void> {
  await requestJson(`/api/web/v1/knowbots/${botId}/workdraft/methods/bind`, {
    method: 'POST',
    body: cmd,
  })
}
