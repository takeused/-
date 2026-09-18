import { useEffect, useState } from 'react'
import { ArrowLeftRight, Download } from 'lucide-react'
import { categoryLabel, countFromSummary } from '../lib/stats'
import { downloadCsv } from '../lib/csv'

function RegionPicker({ index, value, onChange, title }) {
  const sido = index.sido.find((s) => s.id === value.sidoId)
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      <select
        value={value.sidoId}
        onChange={(e) => onChange({ sidoId: e.target.value, sigunguId: '' })}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
      >
        <option value="">시/도 선택</option>
        {index.sido.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        value={value.sigunguId}
        disabled={!value.sidoId}
        onChange={(e) => onChange({ ...value, sigunguId: e.target.value })}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100"
      >
        <option value="">시/군/구 선택</option>
        {(sido?.sigungu ?? []).map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  )
}

/** 두 지역을 같은 업종 기준으로 나란히 비교 */
export default function CompareTab({ index, loadSummary, selection }) {
  const [left, setLeft] = useState({ sidoId: selection.sidoId, sigunguId: selection.sigunguId })
  const [right, setRight] = useState({ sidoId: '', sigunguId: '' })
  const [summaries, setSummaries] = useState({})

  const filter = { l1: selection.l1, l2: selection.l2, l3: selection.l3 }
  const label = categoryLabel(filter)

  useEffect(() => {
    const ids = [left.sidoId, right.sidoId].filter(Boolean)
    if (!ids.length) return
    Promise.all(ids.map((id) => loadSummary(id).then((s) => [id, s]))).then((entries) =>
      setSummaries((prev) => ({ ...prev, ...Object.fromEntries(entries) })),
    )
  }, [left.sidoId, right.sidoId, loadSummary])

  const side = (sel) => {
    const sido = index.sido.find((s) => s.id === sel.sidoId)
    const sigungu = sido?.sigungu.find((g) => g.id === sel.sigunguId)
    const summary = summaries[sel.sidoId]
    const counts = summary?.sigungu?.[sel.sigunguId]
    if (!sido || !sigungu || !counts) return null

    const selected = countFromSummary(counts, filter)
    const ratio = counts.total ? (selected / counts.total) * 100 : 0
    const peers = Object.values(summary.sigungu)
    const avgRatio =
      peers.reduce((s, c) => s + (c.total ? (countFromSummary(c, filter) / c.total) * 100 : 0), 0) /
      (peers.length || 1)

    return {
      name: `${sido.name} ${sigungu.name}`,
      total: counts.total,
      selected,
      ratio,
      avgRatio,
      index: avgRatio > 0 ? ratio / avgRatio : 0,
    }
  }

  const a = side(left)
  const b = side(right)

  const rows = [
    ['전체 점포 수', a && a.total.toLocaleString(), b && b.total.toLocaleString()],
    ['해당 업종 점포 수', a && a.selected.toLocaleString(), b && b.selected.toLocaleString()],
    ['업종 점유율', a && `${a.ratio.toFixed(2)}%`, b && `${b.ratio.toFixed(2)}%`],
    ['시도 평균 점유율', a && `${a.avgRatio.toFixed(2)}%`, b && `${b.avgRatio.toFixed(2)}%`],
    ['경쟁 강도 지수', a && a.index.toFixed(2), b && b.index.toFixed(2)],
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-900">
          <ArrowLeftRight size={15} /> 지역 비교
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          기준 업종: <b className="text-slate-700">{label}</b> — 상단 필터에서 바꿀 수 있습니다.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <RegionPicker index={index} title="지역 A" value={left} onChange={setLeft} />
          <RegionPicker index={index} title="지역 B" value={right} onChange={setRight} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">항목</th>
              <th className="px-4 py-2.5 font-semibold">{a?.name ?? '지역 A'}</th>
              <th className="px-4 py-2.5 font-semibold">{b?.name ?? '지역 B'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, x, y]) => (
              <tr key={name} className="border-t border-slate-100">
                <td className="px-4 py-2.5 text-slate-600">{name}</td>
                <td className="px-4 py-2.5 font-semibold tabular-nums text-slate-900">{x ?? '—'}</td>
                <td className="px-4 py-2.5 font-semibold tabular-nums text-slate-900">{y ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {a && b && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">
            {Math.abs(a.ratio - b.ratio) < 0.01 ? (
              <>
                <b>{label}</b> 기준으로 두 지역의 밀도가 거의 같습니다 (점유율 차 0.01%p 미만).
              </>
            ) : (
              <>
                <b>{label}</b> 기준으로 <b>{a.ratio > b.ratio ? a.name : b.name}</b> 의 밀도가 더 높습니다 (점유율 차{' '}
                {Math.abs(a.ratio - b.ratio).toFixed(2)}%p). 상대적으로 비어 있는 쪽은{' '}
                <b>{a.ratio > b.ratio ? b.name : a.name}</b> 입니다.
              </>
            )}
          </p>
          <button
            onClick={() =>
              downloadCsv(
                `지역비교_${a.name}_vs_${b.name}.csv`,
                ['항목', a.name, b.name],
                rows.map(([n, x, y]) => [n, x, y]),
              )
            }
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Download size={14} /> CSV 내려받기
          </button>
        </div>
      )}
    </div>
  )
}
