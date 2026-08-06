import { ArrowRight, ExternalLink, History, RefreshCw, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { entryTypeLabel, sourceTypeLabels } from '../inbox/labels'
import { addSearch, clearHistory, readHistory, removeSearch } from '../search/history'
import type { SearchHistoryItem } from '../search/history'
import { highlightText } from '../search/highlight'
import { useSearch } from '../search/queries'
import type { SearchEntryHit, SearchResponse, SearchSourceHit } from '../search/types'

const DEBOUNCE_MS = 300

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
      <ul className="search-history-list">
        {items.map((item) => (
          <li key={item.keyword} className="search-history-item">
            <button
              type="button"
              className="search-history-keyword"
              onClick={() => onSelect(item.keyword)}
            >
              <History size={14} aria-hidden="true" />
              {item.keyword}
            </button>
            <button
              type="button"
              className="search-history-remove"
              onClick={() => onRemove(item.keyword)}
              aria-label={`删除最近搜索：${item.keyword}`}
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
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
  const [input, setInput] = useState(urlKeyword)
  const [keyword, setKeyword] = useState(urlKeyword)
  const [history, setHistory] = useState<SearchHistoryItem[]>(() =>
    userId ? readHistory(userId) : [],
  )
  const lastWrittenRef = useRef(urlKeyword)
  const recordedDataRef = useRef<SearchResponse | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = input.trim()
      setKeyword(next)
      lastWrittenRef.current = next
      setSearchParams(next ? { q: next } : {}, { replace: true })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input, setSearchParams])

  useEffect(() => {
    if (urlKeyword !== lastWrittenRef.current) {
      lastWrittenRef.current = urlKeyword
      setInput(urlKeyword)
      setKeyword(urlKeyword)
    }
  }, [urlKeyword])

  const searchQuery = useSearch(keyword)
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

  function clearKeyword() {
    setInput('')
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
          onChange={(event) => setInput(event.target.value)}
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
      </div>

      {!hasKeyword && history.length > 0 && (
        <SearchHistory
          items={history}
          onSelect={(itemKeyword) => setInput(itemKeyword)}
          onRemove={(itemKeyword) => setHistory(removeSearch(userId, itemKeyword))}
          onClear={() => setHistory(clearHistory(userId))}
        />
      )}

      {!hasKeyword && history.length === 0 && (
        <div className="state-panel search-guidance" role="status">
          <Search size={22} />
          <strong>输入关键词开始搜索</strong>
          <span>搜索范围包含全部项目中的正式记录，以及原始文字、链接和图片识别内容。</span>
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
          <span>已保留关键词“{keyword}”，请检查连接后重试。</span>
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
          <span>换个关键词试试，或清除后重新输入。</span>
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
