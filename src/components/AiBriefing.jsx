import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Send, Sparkles } from 'lucide-react'
import Markdown from './Markdown'
import { SYSTEM_PROMPT, buildBriefingPrompt, streamChat } from '../lib/llm'

const SUGGESTIONS = [
  '외지인 타깃 메뉴 추천해줘',
  '초기 홍보 전략 알려줘',
  '이 지역에서 피해야 할 업종은?',
  '예상 준비 비용 항목을 정리해줘',
]

/**
 * 상권 브리핑 생성 + 후속 Q&A(멀티턴).
 * 대화는 history 배열에 쌓아 매 요청마다 통째로 보낸다(무상태 REST).
 */
export default function AiBriefing({ context, settings, onRequestKey }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)
  const bottomRef = useRef(null)

  // 지역/업종을 바꾸면 대화를 초기화한다 (다른 상권 브리핑이 섞이지 않도록)
  const contextKey = `${context.sigunguId}|${context.dong}|${context.categoryLabel}`
  useEffect(() => {
    setMessages([])
    setError(null)
    abortRef.current?.abort()
  }, [contextKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  async function send(text, { reset = false } = {}) {
    if (!settings.groqKey) return onRequestKey()
    const base = reset ? [] : messages
    const history = [...base, { role: 'user', text }]
    setMessages([...history, { role: 'model', text: '' }])
    setBusy(true)
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      let acc = ''
      for await (const chunk of streamChat({
        apiKey: settings.groqKey,
        model: settings.model,
        systemInstruction: SYSTEM_PROMPT,
        history,
        signal: controller.signal,
      })) {
        acc += chunk
        setMessages([...history, { role: 'model', text: acc }])
      }
      if (!acc) setError('응답이 비어 있습니다. 모델을 바꾸거나 잠시 후 다시 시도해 주세요.')
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message)
        setMessages(history)
      }
    } finally {
      setBusy(false)
    }
  }

  const generate = () => send(buildBriefingPrompt(context), { reset: true })

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
          <Sparkles size={15} /> AI 상권 브리핑
        </h2>
        {messages.length > 0 && (
          <button
            onClick={generate}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw size={12} /> 다시 생성
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !busy && (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-600">
              선택한 상권의 통계를 근거로 경쟁 강도·차별화 전략·창업 팁을 정리합니다.
            </p>
            <button
              onClick={generate}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {settings.groqKey ? '브리핑 생성하기' : 'API 키 입력하고 시작'}
            </button>
            {!settings.groqKey && (
              <p className="mt-2 text-xs text-slate-500">
                Groq 무료 키로 동작합니다. 키는 브라우저에만 저장됩니다.
              </p>
            )}
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            // 첫 메시지는 프롬프트 데이터 블록이라 감춘다
            i === 0 ? null : (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 px-3.5 py-2 text-sm text-white">
                  {m.text}
                </p>
              </div>
            )
          ) : (
            <div key={i} className="rounded-2xl rounded-bl-sm bg-slate-50 px-3.5 py-2.5">
              {m.text ? (
                <Markdown text={m.text} />
              ) : (
                <span className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" /> 분석 중…
                </span>
              )}
            </div>
          ),
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <p>{error}</p>
            {/모델|API 키|한도/.test(error) && (
              <button
                onClick={onRequestKey}
                className="mt-1.5 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
              >
                설정 열기
              </button>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length > 0 && (
        <div className="border-t border-slate-100 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                disabled={busy}
                onClick={() => send(s)}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const text = input.trim()
              if (!text || busy) return
              setInput('')
              send(text)
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="이 상권에 대해 더 물어보기"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-lg bg-slate-900 px-3 text-white disabled:opacity-40"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
