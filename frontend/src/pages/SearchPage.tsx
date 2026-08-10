import { ArrowRight, ExternalLink, History, RefreshCw, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import ScopePicker, { type ScopeSelection } from '../components/ScopePicker'
import { entryTypeLabel, entryTypeOptions, sourceTypeLabels } from '../inbox/labels'
import { ApiError } from '../lib/api'
import { addSearch, clearHistory, readHistory, removeSearch } from '../search/history'
import type { SearchHistoryItem } from '../search/history'
import { highlightText } from '../search/highlight'
import { useSearch, type SearchFilters } from '../search/queries'
import type { SearchEntryHit, SearchResponse, SearchSourceHit } from '../search/types'

const INVALID_FILTER_CODES = new Set([
  'invalid_project',
  'invalid_type',
  'node_requires_project',
  'node_project_mismatch',
])

function SearchHistory({
  items,
  onSelect,
  onRemove,
  onClear,
}: {
  items: SearchHistoryItem[]
  onSelect: (keyword: string) => void
  onRemove: (keyword: string) => void
  onClear: () => void
}) {
  if (items.length === 0) return null
  return (
    <section className="search-history" aria-label="最近搜索">
      <header className="search-history-head">
        <h2>最近搜索</h2>
        <button type="button" className="search-history-clear" onClick={onClear}>
          清空
        </button>
      </header>
      <div className="search-history-chips">
        {items.map((item) => (
          <span key={item.keyword} className="search-history-chip">
            <button
              type="button"
              className="search-history-chip-keyword"
              onClick={() => onSelect(item.keyword)}
            >
              <History size={14} aria-hidden="true" />
              {item.keyword}
            </button>
            <button
              type="button"
              className="search-history-chip-remove"
              onClick={() => onRemove(item.keyword)}
              aria-label={`删除最近搜索：${item.keyword}`}
            >
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
    </section>
  )
}

function EntryCard({
  entry,
  keyword,
  onOpenNode,
  onOpenSource,
}: {
  entry: SearchEntryHit
  keyword: string
  onOpenNode: (entry: SearchEntryHit) => void
  onOpenSource: (sourceId: string) => void
}) {
  const pathLabel = [entry.project_name, ...entry.node_path].join(' / ')
  return (
    <article className="search-result-card">
      <div className="search-result-main">
        <div className="search-result-head">
          <span className="badge">{entryTypeLabel(entry.entry_type)} · Entry</span>
          <h3>{highlightText(entry.title, keyword)}</h3>
        </div>
        <p className="search-snippet">{highlightText(entry.content, keyword)}</p>
        <div className="search-result-path">
          {pathLabel}
          <span>· 来源 {entry.sources.length} 个</span>
        </div>
        {entry.sources.length > 0 && (
          <div className="search-source-chips">
            {entry.sources.map((source) => (
              <button
                key={source.id}
                type="button"
                className="search-source-chip"
                onClick={() => onOpenSource(source.id)}
              >
                {sourceTypeLabels[source.source_type]} · {source.title}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="search-result-actions">
        <button
          type="button"
          className="btn small primary"
          onClick={() => onOpenNode(entry)}
          aria-label={`回到节点：${entry.title}`}
        >
          {entry.node_id ? '回到节点' : '回到项目'}
          <ArrowRight size={13} />
        </button>
      </div>
    </article>
  )
}

function SourceCard({
  source,
  keyword,
  onOpenSource,
}: {
  source: SearchSourceHit
  keyword: string
  onOpenSource: (sourceId: string) => void
}) {
  const snippet = source.content ?? source.link_url ?? '（无正文）'
  return (
    <article className="search-result-card">
      <div className="search-result-main">
        <div className="search-result-head">
          <span className="badge">{sourceTypeLabels[source.source_type]} · Source</span>
          <h3>{highlightText(source.title, keyword)}</h3>
        </div>
        <p className="search-snippet">{highlightText(snippet, keyword)}</p>
        <div className="search-result-path">
          {source.project_name ?? '未分配项目'}
          <span>· 关联 {source.entry_count} 条正式记录</span>
        </div>
      </div>
      <div className="search-result-actions">
        <button
          type="button"
          className="btn small"
          onClick={() => onOpenSource(source.id)}
          aria-label={`打开来源：${source.title}`}
        >
          <ExternalLink size={13} />
          打开来源
        </button>
      </div>
    </article>
  )
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const urlKeyword = searchParams.get('q') ?? ''
  const urlProject = searchParams.get('project') ?? ''
  const urlType = searchParams.get('type') ?? ''
  const urlNode = searchParams.get('node') ?? ''
  const filters: SearchFilters = { project: urlProject, type: urlType, node: urlNode }
  const hasActiveFilters = Boolean(urlProject || urlType || urlNode)
  const [input, setInput] = useState(urlKeyword)
  const [keyword, setKeyword] = useState(urlKeyword)
  const [history, setHistory] = useState<SearchHistoryItem[]>(() =>
    userId ? readHistory(userId) : [],
  )
  const [emptyHint, setEmptyHint] = useState(false)
  const lastWrittenRef = useRef(urlKeyword)
  const composingRef = useRef(false)
  const recordedDataRef = useRef<SearchResponse | null>(null)

  useEffect(() => {
    if (urlKeyword !== lastWrittenRef.current) {
      lastWrittenRef.current = urlKeyword
      setInput(urlKeyword)
      setKeyword(urlKeyword)
    }
  }, [urlKeyword])

  const searchQuery = useSearch(keyword, filters)
  const searchError = searchQuery.error instanceof ApiError ? searchQuery.error : null
  const isFilterError = Boolean(searchError && INVALID_FILTER_CODES.has(searchError.code))
  const hasKeyword = keyword.length > 0
  const entries = searchQuery.data?.entries ?? []
  const sources = searchQuery.data?.sources ?? []
  const noResults = searchQuery.isSuccess && entries.length === 0 && sources.length === 0

  useEffect(() => {
    if (!userId) return
    setHistory(readHistory(userId))
  }, [userId])

  useEffect(() => {
    if (!userId || !keyword) return
    if (searchQuery.status !== 'success' || !searchQuery.data) return
    if (recordedDataRef.current === searchQuery.data) return
    recordedDataRef.current = searchQuery.data
    setHistory(addSearch(userId, keyword))
  }, [userId, keyword, searchQuery.status, searchQuery.data])

  function submitSearch(nextKeyword = input) {
    const trimmed = nextKeyword.trim()
    setEmptyHint(false)
    if (!trimmed) {
      setEmptyHint(true)
      return
    }
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      params.set('q', trimmed)
      return params
    }, { replace: true })
    lastWrittenRef.current = trimmed
    setInput(trimmed)
    setKeyword(trimmed)
  }

  function handleInputChange(value: string) {
    setInput(value)
    setEmptyHint(false)
    if (value.trim().length === 0) {
      lastWrittenRef.current = ''
      setKeyword('')
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev)
        params.delete('q')
        return params
      }, { replace: true })
    }
  }

  function updateFilters(next: SearchFilters) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (next.project !== undefined) {
        if (next.project) {
          params.set('project', next.project)
          params.delete('node')
        } else {
          params.delete('project')
          params.delete('node')
        }
      }
      if (next.type !== undefined) {
        if (next.type) {
          params.set('type', next.type)
        } else {
          params.delete('type')
        }
      }
      if (next.node !== undefined) {
        if (next.node) {
          params.set('node', next.node)
        } else {
          params.delete('node')
        }
      }
      return params
    }, { replace: true })
  }

  function clearFilters() {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      params.delete('project')
      params.delete('type')
      params.delete('node')
      return params
    }, { replace: true })
  }

  function handleScopeChange(scope: ScopeSelection) {
    updateFilters({
      project: scope.project_id ?? '',
      node: scope.node_id ?? '',
    })
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    if (event.nativeEvent.isComposing || composingRef.current) return
    submitSearch()
  }

  function clearKeyword() {
    handleInputChange('')
  }

  return (
    <div className="projects-page search-page">
      <header className="page-toolbar">
        <h1>搜索</h1>
      </header>

      <div className="search-box">
        <Search size={17} aria-hidden="true" />
        <input
          value={input}
          onChange={(event) => handleInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={() => {
            composingRef.current = false
          }}
          placeholder="搜索正式记录和来源内容"
          aria-label="搜索关键词"
        />
        {input && (
          <button
            type="button"
            className="search-clear"
            onClick={clearKeyword}
            aria-label="清除关键词"
          >
            <X size={15} />
          </button>
        )}
        <button
          type="button"
          className="btn primary search-submit"
          onClick={() => submitSearch()}
        >
          搜索
        </button>
      </div>

      <div className="search-filters">
        <ScopePicker
          value={{ project_id: urlProject || null, node_id: urlNode || null }}
          onChange={handleScopeChange}
          placeholder="全部项目"
          allowClear
          panelAriaLabel="选择范围"
        />
        <label className="search-filter">
          <span>类型</span>
          <select
            value={urlType}
            onChange={(event) => updateFilters({ type: event.target.value })}
            aria-label="筛选类型"
          >
            <option value="">全部类型</option>
            {entryTypeOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {hasActiveFilters && (
          <button type="button" className="search-filter-clear secondary-button" onClick={clearFilters}>
            清除筛选
          </button>
        )}
      </div>

      {emptyHint && (
        <div className="state-panel search-empty-hint" role="alert">
          请输入搜索关键词
        </div>
      )}

      {!hasKeyword && input.trim() === '' && history.length > 0 && (
        <SearchHistory
          items={history}
          onSelect={(itemKeyword) => submitSearch(itemKeyword)}
          onRemove={(itemKeyword) => setHistory(removeSearch(userId, itemKeyword))}
          onClear={() => setHistory(clearHistory(userId))}
        />
      )}

      {!hasKeyword && input.trim() === '' && history.length === 0 && (
        <div className="state-panel search-guidance" role="status">
          <Search size={22} />
          <strong>输入关键词开始搜索</strong>
          <span>输入关键词后点击“搜索”或按回车开始搜索。可先用范围（全部项目 / 某项目 / 某节点）和类型筛选缩小范围；搜索范围包含全部项目中的正式记录，以及原始文字、链接和图片识别内容。</span>
        </div>
      )}

      {!hasKeyword && input.trim() !== '' && (
        <div className="state-panel search-idle-hint" role="status">
          按回车或点击“搜索”开始搜索
        </div>
      )}

      {hasKeyword && searchQuery.isPending && (
        <div className="state-panel" role="status">
          <span className="spin state-spinner" />
          正在搜索“{keyword}”
        </div>
      )}

      {hasKeyword && searchQuery.isError && (
        <div className="state-panel state-error" role="alert">
          <strong>搜索失败</strong>
          <span>
            {isFilterError
              ? `${searchError?.message ?? '筛选参数无效'} 可尝试清除筛选后重试。`
              : `已保留关键词“${keyword}”，请检查连接后重试。`}
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void searchQuery.refetch()}
          >
            <RefreshCw size={16} />重试
          </button>
        </div>
      )}

      {hasKeyword && noResults && (
        <div className="state-panel search-no-results" role="status">
          <strong>没有找到“{keyword}”</strong>
          <span>
            {hasActiveFilters ? '换个关键词试试，或清除筛选后重试。' : '换个关键词试试，或清除后重新输入。'}
          </span>
          <button type="button" className="secondary-button" onClick={clearKeyword}>
            清除并重新输入
          </button>
        </div>
      )}

      {hasKeyword && searchQuery.isSuccess && !noResults && (
        <div className="search-results">
          {entries.length > 0 && (
            <section className="search-section">
              <header>
                <h2>正式记录</h2>
                <span>{entries.length} 条</span>
              </header>
              <div className="search-result-list">
                {entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    keyword={keyword}
                    onOpenNode={(item) => navigate(item.node_id
                      ? `/projects/${item.project_id}/nodes/${item.node_id}`
                      : `/projects/${item.project_id}`)}
                    onOpenSource={(sourceId) => navigate(`/inbox/${sourceId}`)}
                  />
                ))}
              </div>
            </section>
          )}
          {sources.length > 0 && (
            <section className="search-section">
              <header>
                <h2>来源命中</h2>
                <span>{sources.length} 条</span>
              </header>
              <div className="search-result-list">
                {sources.map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    keyword={keyword}
                    onOpenSource={(sourceId) => navigate(`/inbox/${sourceId}`)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
