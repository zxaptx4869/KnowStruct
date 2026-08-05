import type { EntryType, ProcessingState, SourceItem, SourceType } from './types'

export const processingStateLabels: Record<ProcessingState, string> = {
  processing: '处理中',
  failed: '处理失败',
  pending_confirm: '待确认',
  done: '已处理',
}

export const sourceTypeLabels: Record<SourceType, string> = {
  text: '文字',
  link: '链接',
  image: '图片',
}

export function processingDetailLabel(
  item: Pick<SourceItem, 'processing_state' | 'task'>,
): string {
  if (item.processing_state !== 'processing') {
    return processingStateLabels[item.processing_state]
  }
  if (!item.task) return '处理中'
  if (item.task.status === 'pending') return '待处理'
  if (item.task.stage === 'ocr') return '图片识别中'
  return 'AI 提取中'
}

export const entryTypeLabels: Record<EntryType, string> = {
  experience: '经验',
  parameter: '参数',
  pitfall: '避坑',
  product: '商品',
  price: '价格',
  decision: '决策',
  todo: '待办',
  question: '疑问',
}

export const entryTypeOptions = Object.entries(entryTypeLabels) as Array<[EntryType, string]>

export function entryTypeLabel(value: string) {
  return entryTypeLabels[value as EntryType] ?? value
}

export function isProcessingState(state: ProcessingState | undefined) {
  return state === 'processing'
}
