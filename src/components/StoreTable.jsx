import { useState } from 'react'
import { Download, Search } from 'lucide-react'
import { downloadStoresCsv } from '../lib/csv'

const PAGE = 50

export default function StoreTable({ stores, filename }) {
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)

  const q = query.trim()
  const rows = q
    ? stores.filter((s) => s.name.includes(q) || s.addr.includes(q) || s.l3.includes(q))
    : stores

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search size={15} className="absolute top-2.5 left-3 text-slate-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setShown(PAGE)
            }}
            placeholder="상호·주소·업종 검색"
            className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-sm outline-none focus:border-slate-900"
          />
        </div>
        <button
          onClick={() => downloadStoresCsv(rows, filename)}
          disabled={!rows.length}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          <Download size={14} /> CSV 내려받기 ({rows.length.toLocaleString()})
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">상호명</th>
              <th className="px-4 py-2.5 font-semibold">업종</th>
              <th className="px-4 py-2.5 font-semibold">행정동</th>
              <th className="hidden px-4 py-2.5 font-semibold md:table-cell">주소</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((s, i) => (
              <tr key={`${s.name}-${i}`} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{s.name}</td>
                <td className="px-4 py-2 text-slate-600">
                  {s.l3}
                  <span className="ml-1.5 text-xs text-slate-400">{s.l2}</span>
                </td>
                <td className="px-4 py-2 text-slate-600">{s.dong}</td>
                <td className="hidden px-4 py-2 text-slate-500 md:table-cell">{s.addr}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  조건에 맞는 점포가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {shown < rows.length && (
        <button
          onClick={() => setShown((n) => n + PAGE * 4)}
          className="w-full rounded-lg border border-slate-300 py-2 text-sm text-slate-600 hover:bg-white"
        >
          더 보기 ({(rows.length - shown).toLocaleString()}개 남음)
        </button>
      )}
    </div>
  )
}
