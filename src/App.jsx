import { useCallback, useMemo, useState } from 'react'
import { AlertCircle, BarChart3, Loader2, Map, Settings, Store, Table2 } from 'lucide-react'
import FilterBar from './components/FilterBar'
import AnalysisPanel from './components/AnalysisPanel'
import AiBriefing from './components/AiBriefing'
import StoreMap from './components/StoreMap'
import CompareTab from './components/CompareTab'
import StoreTable from './components/StoreTable'
import SettingsModal from './components/SettingsModal'
import { useDataset, useRegionData } from './hooks/useDataset'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useModelGuard } from './hooks/useModelGuard'
import { DEFAULT_MODEL } from './lib/llm'
import { analyze, byDong, categoryLabel, findOpportunities, topCategories } from './lib/stats'

const TABS = [
  { id: 'analysis', label: '상권 분석', icon: BarChart3 },
  { id: 'map', label: '지도', icon: Map },
  { id: 'compare', label: '지역 비교', icon: Store },
  { id: 'list', label: '점포 목록', icon: Table2 },
]

const EMPTY_SELECTION = { sidoId: '', sigunguId: '', dong: '', l1: '', l2: '', l3: '' }

export default function App() {
  const dataset = useDataset()
  const { index, error } = dataset

  const [selection, setSelection] = useState(EMPTY_SELECTION)
  const [tab, setTab] = useState('analysis')
  const [settingsOpen, setSettingsOpen] = useState(false)
  // .env 에 VITE_ 키를 넣어두면 초기값으로 쓰고, 이후에는 브라우저 저장값이 우선한다
  const [settings, setStoredSettings] = useLocalStorage('gg-commercial-settings', {
    groqKey: import.meta.env.VITE_GROQ_API_KEY ?? '',
    kakaoKey: import.meta.env.VITE_KAKAO_JS_KEY ?? '',
    model: DEFAULT_MODEL,
  })
  // 예전에 저장된 다른 제공자의 모델 이름(gemini-*)이 남아 있으면 기본값으로 되돌린다.
  // 그 외에는 건드리지 않는다 — 모델 목록은 설정 모달이 계정에서 직접 받아오기 때문이다.
  const settingsOrDefault = !settings.model || /^gemini/.test(settings.model)
    ? { ...settings, model: DEFAULT_MODEL }
    : settings

  // 계정에서 쓸 수 없는 모델이 저장돼 있으면 시작할 때 자동으로 교체한다
  const fixModel = useCallback(
    (model) => setStoredSettings((prev) => ({ ...prev, model })),
    [setStoredSettings],
  )
  useModelGuard(settingsOrDefault, fixModel)

  const region = useRegionData(dataset, selection.sidoId, selection.sigunguId)

  const sido = index?.sido.find((s) => s.id === selection.sidoId)
  const sigungu = sido?.sigungu.find((g) => g.id === selection.sigunguId)

  const analysis = useMemo(() => {
    if (!region.stores || !region.summary) return null

    const result = analyze(region.stores, selection, region.summary, selection.sigunguId)
    const { opportunities, saturated } = findOpportunities(region.summary, selection.sigunguId)

    return {
      result,
      opportunities,
      saturated,
      topL3: topCategories(result.selected, 'l3', 8),
      dongRows: byDong(result.selected),
    }
  }, [region.stores, region.summary, selection])

  const catLabel = categoryLabel(selection)
  const regionLabel = sigungu ? `${sido.name} ${sigungu.name}${selection.dong ? ` ${selection.dong}` : ''}` : ''

  const aiContext = analysis && {
    sido: sido.name,
    sigungu: sigungu.name,
    sigunguId: selection.sigunguId,
    dong: selection.dong,
    categoryLabel: catLabel,
    ...analysis.result,
    topCategories: analysis.topL3,
    opportunities: analysis.opportunities,
    saturated: analysis.saturated,
  }

  if (error) {
    return (
      <Centered>
        <AlertCircle className="text-red-500" />
        <p className="font-semibold text-slate-900">데이터를 불러오지 못했습니다</p>
        <p className="max-w-md text-sm text-slate-500">{error}</p>
        <code className="rounded-lg bg-slate-100 px-3 py-2 text-xs">node scripts/make-sample-data.mjs</code>
      </Centered>
    )
  }

  if (!index) {
    return (
      <Centered>
        <Loader2 className="animate-spin text-slate-400" />
        <p className="text-sm text-slate-500">상권 데이터를 불러오는 중…</p>
      </Centered>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">대한민국 상권 분석</h1>
            <p className="text-xs text-slate-500">
              공공데이터 상가(상권)정보 {index.total.toLocaleString()}개 · AI 상권 브리핑
              {index.isSample && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                  샘플 데이터 — npm run data:api 로 실제 데이터를 받으세요
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Settings size={15} />
            <span className="hidden sm:inline">API 키</span>
            {settingsOrDefault.groqKey && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
        <FilterBar
          index={index}
          selection={selection}
          onChange={setSelection}
          dongs={sigungu?.dongs}
        />

        <nav className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <t.icon size={15} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>

        {region.loading && (
          <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            <Loader2 size={15} className="animate-spin" /> {sigungu?.name} 점포 데이터를 불러오는 중…
          </p>
        )}
        {region.error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{region.error}</p>
        )}

        {!selection.sigunguId && tab !== 'compare' && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Store className="mx-auto mb-3 text-slate-300" size={32} />
            <p className="font-semibold text-slate-800">시/도와 시/군/구를 먼저 선택하세요</p>
            <p className="mt-1 text-sm text-slate-500">
              선택한 지역의 점포 데이터만 내려받아 분석하기 때문에 빠르게 동작합니다.
            </p>
          </div>
        )}

        {tab === 'analysis' && analysis && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <AnalysisPanel
              result={analysis.result}
              categoryLabel={catLabel}
              regionLabel={regionLabel}
              sidoName={sido.name}
              sigunguName={sigungu.name}
              dong={selection.dong}
              topL3={analysis.topL3}
              dongRows={analysis.dongRows}
              opportunities={analysis.opportunities}
              saturated={analysis.saturated}
            />
            <div className="lg:sticky lg:top-24 lg:h-[calc(100vh-7.5rem)]">
              <AiBriefing
                context={aiContext}
                settings={settingsOrDefault}
                onRequestKey={() => setSettingsOpen(true)}
              />
            </div>
          </div>
        )}

        {tab === 'map' && analysis && (
          <StoreMap
            stores={analysis.result.selected}
            appKey={settingsOrDefault.kakaoKey}
            onRequestKey={() => setSettingsOpen(true)}
          />
        )}

        {tab === 'compare' && (
          <CompareTab index={index} loadSummary={dataset.loadSummary} selection={selection} />
        )}

        {tab === 'list' && analysis && (
          <StoreTable
            stores={analysis.result.selected}
            filename={`${regionLabel}_${catLabel.replace(/\s›\s/g, '-')}.csv`}
          />
        )}

        <footer className="pt-6 pb-10 text-center text-xs text-slate-400">
          출처: 공공데이터포털 · 소상공인시장진흥공단 상가(상권)정보 (기준일 {formatDate(index.generatedAt)})
          <br />
          점포 수 기반 분석이며 매출·유동인구·임대료는 포함되지 않습니다.
        </footer>
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settingsOrDefault}
        onSave={setStoredSettings}
      />
    </div>
  )
}

function Centered({ children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      {children}
    </div>
  )
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('ko-KR')
  } catch {
    return '—'
  }
}
