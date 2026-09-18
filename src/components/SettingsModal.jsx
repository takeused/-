import { useEffect, useState } from 'react'
import { ExternalLink, KeyRound, Loader2, Map as MapIcon, RefreshCw, Sparkles, X } from 'lucide-react'
import { MODELS, listModels, pickDefaultModel } from '../lib/llm'

/** Groq · 카카오 지도 키 입력 모달. 키는 이 브라우저의 localStorage 에만 저장된다. */
export default function SettingsModal({ open, onClose, settings, onSave }) {
  const [draft, setDraft] = useState(settings)
  const [models, setModels] = useState(MODELS)
  const [modelState, setModelState] = useState({ loading: false, error: null, live: false })

  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])

  // Groq 은 모델을 수시로 교체하므로, 키가 있으면 실제 사용 가능한 목록을 받아온다
  useEffect(() => {
    if (!open || !draft.groqKey) return
    let cancelled = false
    setModelState({ loading: true, error: null, live: false })

    listModels(draft.groqKey)
      .then((list) => {
        if (cancelled) return
        setModels(list)
        setModelState({ loading: false, error: null, live: true })
        setDraft((d) => (list.some((m) => m.id === d.model) ? d : { ...d, model: pickDefaultModel(list) }))
      })
      .catch((e) => {
        if (!cancelled) setModelState({ loading: false, error: e.message, live: false })
      })

    return () => {
      cancelled = true
    }
  }, [open, draft.groqKey])

  if (!open) return null

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <KeyRound size={18} /> API 키 설정
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              키는 서버로 전송되지 않고 이 브라우저(localStorage)에만 저장됩니다. 공용 PC라면 사용 후 삭제하세요.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Sparkles size={15} /> Groq API 키
            </label>
            <input
              type="password"
              className={field}
              placeholder="gsk_..."
              value={draft.groqKey}
              onChange={(e) => setDraft({ ...draft, groqKey: e.target.value.trim() })}
            />
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              Groq Console에서 무료 발급 <ExternalLink size={11} />
            </a>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
              모델
              {modelState.loading && <Loader2 size={13} className="animate-spin text-slate-400" />}
              {modelState.live && (
                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                  내 계정에서 사용 가능한 {models.length}개
                </span>
              )}
            </label>
            <select
              className={field}
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.context ? ` · ${Math.round(m.context / 1000)}K` : ''}
                </option>
              ))}
            </select>
            {modelState.error && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                모델 목록을 못 받았습니다: {modelState.error}
              </p>
            )}
            {!draft.groqKey && (
              <p className="mt-1 text-xs text-slate-500">
                키를 입력하면 계정에서 실제 쓸 수 있는 모델 목록을 불러옵니다.
              </p>
            )}
            {modelState.live && (
              <button
                type="button"
                onClick={() => setDraft({ ...draft })}
                className="mt-1 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
              >
                <RefreshCw size={11} /> 목록 새로고침
              </button>
            )}
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <MapIcon size={15} /> 카카오맵 JavaScript 키 (선택)
            </label>
            <input
              type="password"
              className={field}
              placeholder="지도 탭을 쓰려면 입력"
              value={draft.kakaoKey}
              onChange={(e) => setDraft({ ...draft, kakaoKey: e.target.value.trim() })}
            />
            <a
              href="https://developers.kakao.com/console/app"
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              Kakao Developers · 내 애플리케이션 → 앱 키 <ExternalLink size={11} />
            </a>
            <p className="mt-1 text-xs text-slate-500">
              플랫폼 → Web 에 <code className="rounded bg-slate-100 px-1">{window.location.origin}</code> 을 등록해야 지도가 뜹니다.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-between">
          <button
            onClick={() => {
              onSave({ groqKey: '', kakaoKey: '', model: draft.model })
              onClose()
            }}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
          >
            저장된 키 삭제
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              취소
            </button>
            <button
              onClick={() => {
                onSave(draft)
                onClose()
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
