import { FileText, Image, Link2, Plus, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { processingStateLabels, sourceTypeLabels } from '../inbox/labels'
import {
  useCreateSource,
  useCreateImageSource,
  useInboxSources,
  useRetrySource,
} from '../inbox/queries'
import type { ProcessingState, SourceItem, SourceType } from '../inbox/types'
import { mutationMessage } from '../projects/errors'
import { useProjects } from '../projects/queries'

type Mode = SourceType | 'image'
type FilterState = 'all' | ProcessingState

const stateChips: Array<{ value: FilterState, label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending_confirm', label: '待确认' },
  { value: 'processing', label: '处理中' },
  { value: 'failed', label: '失败' },
  { value: 'done', label: '已处理' },
]

function statusClass(state: SourceItem['processing_state']) {
  return `status-pill status-${state}`
}

function SourceActions({
  source,
  onOpen,
}: {
  source: SourceItem
  onOpen: () => void
}) {
  const retryMutation = useRetrySource(source.id)
  if (source.processing_state === 'pending_confirm') {
    return (
      <button type="button" className="btn small primary" onClick={onOpen}>确认</button>
    )
  }
  if (source.processing_state === 'failed') {
    return (
      <button
        type="button"
        className="btn small"
        onClick={(event) => {
          event.stopPropagation()
          void retryMutation.mutateAsync()
        }}
        disabled={retryMutation.isPending}
      >
        {retryMutation.isPending ? '重试中…' : '重试'}
      </button>
    )
  }
  return (
    <button type="button" className="btn small" onClick={onOpen}>
      {source.processing_state === 'processing' ? '查看状态' : '查看'}
    </button>
  )
}

export default function InboxPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectProject = searchParams.get('project') ?? undefined

  const [mode, setMode] = useState<Mode>('text')
  const [content, setContent] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [imageNote, setImageNote] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [projectId, setProjectId] = useState<string>(preselectProject ?? '')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [filterState, setFilterState] = useState<FilterState>('all')
  const [filterType, setFilterType] = useState<'all' | SourceType>('all')
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')

  const projectsQuery = useProjects()
  const sourcesQuery = useInboxSources({
    state: filterState === 'all' ? undefined : filterState,
    source_type: filterType === 'all' ? undefined : filterType,
    q: appliedKeyword || undefined,
  })
  const createMutation = useCreateSource()
  const createImageMutation = useCreateImageSource()

  function switchMode(next: Mode) {
    setMode(next)
    setSubmitError(null)
    setImageNote('')
    setPreviewUrl(null)
  }

  async function handleImageSelected(file: File | undefined) {
    if (!file) return
    setSubmitError(null)
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)
    try {
      const source = await createImageMutation.mutateAsync({
        file,
        project_id: projectId || undefined,
        note: imageNote || undefined,
      })
      URL.revokeObjectURL(localUrl)
      setPreviewUrl(null)
      setImageNote('')
      navigate(`/inbox/${source.id}`)
    } catch (error) {
      URL.revokeObjectURL(localUrl)
      setPreviewUrl(null)
      setSubmitError(mutationMessage(error, '图片上传失败，请重试'))
    }
  }

  async function submitCapture(event: React.FormEvent) {
    event.preventDefault()
    if (mode === 'image') return
    setSubmitError(null)
    try {
      const sourceType: SourceType = mode
      const source = await createMutation.mutateAsync({
        source_type: sourceType,
        content,
        link_url: mode === 'link' ? linkUrl : undefined,
        project_id: projectId || undefined,
      })
      setContent('')
      setLinkUrl('')
      navigate(`/inbox/${source.id}`)
    } catch (error) {
      setSubmitError(mutationMessage(error, '采集失败，请检查输入后重试'))
    }
  }

  const sources = sourcesQuery.data ?? []
  const anyProcessing = sources.some((item) => item.processing_state === 'processing')

  return (
    <div className="projects-page inbox-page">
      <header className="page-toolbar">
        <div>
          <h1>采集箱</h1>
          <p>快速收集文字和链接，稍后统一整理。生成正式记录前必须确认项目。</p>
        </div>
      </header>

      <section className="capture-panel">
        <div className="capture-modes" role="tablist" aria-label="采集类型">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'text'}
            className={`capture-mode${mode === 'text' ? ' active' : ''}`}
            onClick={() => switchMode('text')}
          >
            <FileText size={15} />文字
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'link'}
            className={`capture-mode${mode === 'link' ? ' active' : ''}`}
            onClick={() => switchMode('link')}
          >
            <Link2 size={15} />链接
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'image'}
            className={`capture-mode${mode === 'image' ? ' active' : ''}`}
            onClick={() => switchMode('image')}
          >
            <Image size={15} />图片
          </button>
        </div>

        <form className="capture-form" onSubmit={submitCapture}>
          {mode === 'text' && (
            <div className="form-field">
              <span>文字内容</span>
              <textarea
                rows={4}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="粘贴或输入文字，例如：零嵌冰箱要看底部散热…"
              />
            </div>
          )}
          {mode === 'link' && (
            <>
              <div className="form-field">
                <span>网页链接</span>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  placeholder="https://example.com/product/123"
                />
              </div>
              <div className="form-field">
                <span>补充说明（必填）</span>
                <textarea
                  rows={3}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="一句话说明这条链接为什么值得记录，例如：洗烘套装商品参数页"
                />
                <small className="field-hint">本阶段不会抓取网页正文，说明会作为可提取内容。</small>
              </div>
            </>
          )}
          {mode === 'image' && (
            <>
              <div className="form-field">
                <span>图片（JPG / PNG / WebP，不超过 10MB）</span>
                <div className="image-upload-actions">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="visually-hidden"
                    onChange={(event) => void handleImageSelected(event.target.files?.[0])}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="visually-hidden"
                    onChange={(event) => void handleImageSelected(event.target.files?.[0])}
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    选择文件
                  </button>
                  <button
                    type="button"
                    className="secondary-button mobile-capture-entry"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    拍照
                  </button>
                  <button
                    type="button"
                    className="secondary-button mobile-capture-entry"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    从相册选择
                  </button>
                </div>
                {previewUrl && (
                  <img
                    className="image-preview"
                    src={previewUrl}
                    alt="待上传图片预览"
                  />
                )}
                {createImageMutation.isPending && (
                  <small className="field-hint" role="status">图片上传中…</small>
                )}
              </div>
              <div className="form-field">
                <span>补充说明（可选，将作为标题）</span>
                <textarea
                  rows={2}
                  value={imageNote}
                  onChange={(event) => setImageNote(event.target.value)}
                  placeholder="例如：晶蕾洗碗机烘干设置截图"
                />
              </div>
            </>
          )}
          <div className="form-field">
            <span>所属项目（可选）</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">暂不选择，保存到未分配</option>
              {(projectsQuery.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
          {submitError && <div className="inline-error" role="alert">{submitError}</div>}
          {mode !== 'image' && (
            <button
              type="submit"
              className="primary-button toolbar-button"
              disabled={createMutation.isPending}
            >
              <Plus size={16} />
              {createMutation.isPending ? '保存中…' : '保存原始来源'}
            </button>
          )}
        </form>
      </section>

      <section className="inbox-queue" aria-label="已采集资料">
        <div className="inbox-filter-row">
          <div className="filter-chips" role="group" aria-label="按状态筛选">
            {stateChips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                className={`chip${filterState === chip.value ? ' active' : ''}`}
                onClick={() => setFilterState(chip.value)}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="filter-tools">
            <select
              aria-label="按类型筛选"
              value={filterType}
              onChange={(event) => setFilterType(event.target.value as 'all' | SourceType)}
            >
              <option value="all">全部来源</option>
              <option value="text">文字</option>
              <option value="link">链接</option>
            </select>
            <form
              className="queue-search"
              onSubmit={(event) => {
                event.preventDefault()
                setAppliedKeyword(keyword)
              }}
            >
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索标题或原文"
              />
              <button type="submit" className="secondary-button">搜索</button>
            </form>
          </div>
        </div>

        {sourcesQuery.isPending && (
          <div className="state-panel" role="status"><span className="spin state-spinner" />正在加载采集箱</div>
        )}
        {sourcesQuery.isError && (
          <div className="state-panel state-error" role="alert">
            <strong>采集箱加载失败</strong>
            <span>当前状态不代表没有资料，请重试。</span>
            <button type="button" className="secondary-button" onClick={() => void sourcesQuery.refetch()}>
              <RefreshCw size={16} />重试
            </button>
          </div>
        )}
        {sourcesQuery.isSuccess && sources.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon"><FileText size={26} /></div>
            <h2>暂无采集项</h2>
            <p>先用上方表单保存文字或链接，AI 处理后会进入待确认队列。</p>
          </div>
        )}
        {sourcesQuery.isSuccess && sources.length > 0 && (
          <>
            {anyProcessing && (
              <p className="queue-live-hint" role="status">
                有资料正在处理中，列表会自动刷新。
              </p>
            )}
            <div className="desktop-projects">
              <div className="project-table-wrap">
                <table className="project-table source-table">
                  <thead>
                    <tr><th>原始来源</th><th>所属项目</th><th>处理状态</th><th>候选</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {sources.map((source) => (
                      <tr key={source.id} onClick={() => navigate(`/inbox/${source.id}`)}>
                        <td>
                          <strong>{source.title}</strong>
                          <span>{sourceTypeLabels[source.source_type]} · {new Date(source.created_at).toLocaleString('zh-CN')}</span>
                        </td>
                        <td>{source.project_name ?? '未分配'}</td>
                        <td><span className={statusClass(source.processing_state)}>{processingStateLabels[source.processing_state]}</span></td>
                        <td>
                          {source.candidates.pending_confirm + source.candidates.accepted + source.candidates.rejected > 0
                            ? `${source.candidates.pending_confirm} 待确认 · ${source.candidates.accepted} 接受 · ${source.candidates.rejected} 拒绝`
                            : '—'}
                        </td>
                        <td><SourceActions source={source} onOpen={() => navigate(`/inbox/${source.id}`)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mobile-projects">
              {sources.map((source) => (
                <article key={source.id} className="project-card" onClick={() => navigate(`/inbox/${source.id}`)}>
                  <div className="project-card-head">
                    <h2>{source.title}</h2>
                    <SourceActions source={source} onOpen={() => navigate(`/inbox/${source.id}`)} />
                  </div>
                  <p>{sourceTypeLabels[source.source_type]} · {new Date(source.created_at).toLocaleString('zh-CN')}</p>
                  <div className="project-card-meta">
                    <span className={statusClass(source.processing_state)}>{processingStateLabels[source.processing_state]}</span>
                    <span>{source.project_name ?? '未分配'}</span>
                    {source.candidates.pending_confirm + source.candidates.accepted + source.candidates.rejected > 0 && (
                      <span>{source.candidates.pending_confirm} 待确认 · {source.candidates.accepted} 接受 · {source.candidates.rejected} 拒绝</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
