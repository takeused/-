import { MapPin, Store } from 'lucide-react'

function Select({ label, value, onChange, options, placeholder, disabled }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-semibold tracking-wide text-slate-500">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * 위치(시도→시군구→행정동) · 업종(대→중→소) 다단계 필터.
 * 상위 단계를 바꾸면 하위 선택은 자동으로 초기화된다.
 */
export default function FilterBar({ index, selection, onChange, dongs }) {
  const sido = index.sido.find((s) => s.id === selection.sidoId)
  const sigunguList = sido?.sigungu ?? []
  const cats = index.cats
  const l2Map = selection.l1 ? cats[selection.l1] : null
  const l3List = selection.l1 && selection.l2 ? (cats[selection.l1]?.[selection.l2] ?? []) : []

  const set = (patch) => onChange({ ...selection, ...patch })

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <MapPin size={15} /> 위치
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Select
          label="시 / 도"
          placeholder="선택하세요"
          value={selection.sidoId}
          onChange={(v) => set({ sidoId: v, sigunguId: '', dong: '' })}
          options={index.sido.map((s) => ({
            value: s.id,
            label: `${s.name} (${s.total.toLocaleString()})`,
          }))}
        />
        <Select
          label="시 / 군 / 구"
          placeholder={selection.sidoId ? '선택하세요' : '시/도 먼저'}
          disabled={!selection.sidoId}
          value={selection.sigunguId}
          onChange={(v) => set({ sigunguId: v, dong: '' })}
          options={sigunguList.map((g) => ({
            value: g.id,
            label: `${g.name} (${g.total.toLocaleString()})`,
          }))}
        />
        <Select
          label="행정동"
          placeholder="전체"
          disabled={!selection.sigunguId}
          value={selection.dong}
          onChange={(v) => set({ dong: v })}
          options={(dongs ?? []).map((d) => ({ value: d, label: d }))}
        />
      </div>

      <div className="mt-5 mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Store size={15} /> 업종
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Select
          label="대분류"
          placeholder="전체"
          value={selection.l1}
          onChange={(v) => set({ l1: v, l2: '', l3: '' })}
          options={Object.keys(cats).map((k) => ({ value: k, label: k }))}
        />
        <Select
          label="중분류"
          placeholder="전체"
          disabled={!selection.l1}
          value={selection.l2}
          onChange={(v) => set({ l2: v, l3: '' })}
          options={Object.keys(l2Map ?? {}).map((k) => ({ value: k, label: k }))}
        />
        <Select
          label="소분류"
          placeholder="전체"
          disabled={!selection.l2}
          value={selection.l3}
          onChange={(v) => set({ l3: v })}
          options={l3List.map((k) => ({ value: k, label: k }))}
        />
      </div>
    </div>
  )
}
