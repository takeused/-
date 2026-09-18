import { Activity, Building2, Percent, Store, Trophy } from 'lucide-react'

const TONES = {
  red: 'bg-red-50 text-red-700 border-red-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
}

function Card({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Icon size={13} /> {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

function Bars({ rows, max, color = 'bg-slate-900' }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center gap-2 text-sm">
          <span className="w-32 shrink-0 truncate text-slate-700" title={r.name}>
            {r.name}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className={`block h-full rounded-full ${color}`}
              style={{ width: `${max > 0 ? (r.count / max) * 100 : 0}%` }}
            />
          </span>
          <span className="w-16 shrink-0 text-right tabular-nums text-slate-500">
            {r.count.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  )
}

function GapList({ title, desc, rows, tone, emptyText }) {
  if (!rows.length) return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
    </div>
  )
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <p className="mt-0.5 mb-3 text-xs text-slate-500">{desc}</p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-800" title={`${r.l1} › ${r.l2} › ${r.l3 ?? ''}`}>
              {r.l3 || r.l2 || r.l1}
              <span className="ml-1.5 text-xs text-slate-400">{r.l2}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 tabular-nums">
              <span
                className="text-slate-500"
                title={`시/도 평균 ${r.avgCount.toFixed(0)}개 · 평균 점유율 ${r.avgRatio.toFixed(2)}%`}
              >
                {r.myCount}개 / 기대 {r.expected.toFixed(0)}개
              </span>
              <span className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
                {r.gap > 0 ? '+' : ''}
                {Math.round(r.gap)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function AnalysisPanel({
  result,
  categoryLabel,
  regionLabel,
  sidoName,
  sigunguName,
  dong,
  topL3,
  dongRows,
  opportunities,
  saturated,
}) {
  const { competition } = result

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          icon={Building2}
          label="지역 전체 점포"
          value={result.regionTotal.toLocaleString()}
          sub={regionLabel}
        />
        <Card
          icon={Store}
          label="타겟 업종 점포"
          value={result.selectedCount.toLocaleString()}
          sub={categoryLabel}
        />
        <Card
          icon={Percent}
          label="업종 점유율"
          value={`${result.ratio.toFixed(2)}%`}
          sub={`${sidoName} 평균 ${result.peerAvgRatio.toFixed(2)}%`}
        />
        <Card
          icon={Trophy}
          label="시도 내 순위"
          value={result.rank ? `${result.rank}위` : '—'}
          sub={
            result.rank
              ? `${dong ? sigunguName + ' 기준 · ' : ''}시군구 ${result.peerCount}곳 중 점포 수`
              : '업종을 선택하면 표시'
          }
        />
      </div>

      <div className={`rounded-xl border p-4 ${TONES[competition.tone]}`}>
        <div className="flex items-center gap-2">
          <Activity size={16} />
          <span className="font-bold">경쟁 강도 · {competition.label}</span>
          <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-xs font-semibold tabular-nums">
            지수 {result.competitionIndex.toFixed(2)}
          </span>
        </div>
        <p className="mt-1.5 text-sm opacity-90">{competition.desc}</p>
        <p className="mt-1 text-xs opacity-75">
          {dong ? (
            // 행정동과 시군구는 규모 단위가 달라 점포 수를 직접 비교하면 오해를 부른다
            <>
              같은 시/도 시군구 평균 점유율 {result.peerAvgRatio.toFixed(2)}% · {dong} {result.ratio.toFixed(2)}%
              (지수 1.00 = 시/도 평균 수준)
            </>
          ) : (
            <>
              같은 시/도 시군구 평균 {result.peerAvgCount.toFixed(0)}개 · 이 지역{' '}
              {result.selectedCount.toLocaleString()}개 (지수 1.00 = 시/도 평균 수준)
            </>
          )}
        </p>
      </div>

      {result.peerCount < 3 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          비교 대상 시/군/구가 {result.peerCount}곳뿐이라 평균값의 신뢰도가 낮습니다. 같은 시/도 전체를 수집하면
          경쟁 강도와 공백 업종이 훨씬 정확해집니다. (예: <code className="rounded bg-amber-100 px-1">npm run data:api 41</code>)
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GapList
          title={`공백 업종 (블루오션 후보)${dong ? ` — ${sigunguName} 기준` : ''}`}
          desc="시/도 평균 비중을 이 지역 규모에 적용한 '기대 점포 수'보다 실제가 적은 업종"
          rows={opportunities}
          tone="emerald"
          emptyText="시/군/구를 선택하면 표시됩니다."
        />
        <GapList
          title={`포화 업종${dong ? ` — ${sigunguName} 기준` : ''}`}
          desc="평균 대비 이미 많이 들어선 업종 — 진입 시 차별화 필수"
          rows={saturated}
          tone="red"
          emptyText="시/군/구를 선택하면 표시됩니다."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-900">상위 세부 업종</h3>
          {topL3.length ? (
            <Bars rows={topL3} max={topL3[0]?.count ?? 0} />
          ) : (
            <p className="text-sm text-slate-500">조건에 맞는 점포가 없습니다.</p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-900">행정동별 분포</h3>
          {dongRows.length ? (
            <Bars rows={dongRows.slice(0, 10)} max={dongRows[0]?.count ?? 0} color="bg-blue-600" />
          ) : (
            <p className="text-sm text-slate-500">조건에 맞는 점포가 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  )
}
