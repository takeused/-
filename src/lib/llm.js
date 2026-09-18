/**
 * Groq API 호출 (브라우저 직접 호출, OpenAI 호환 스펙).
 * 키는 사용자가 발급해 localStorage 에 보관하므로 서버가 필요 없다.
 * 대신 키는 이 브라우저 밖으로 나가지 않으며, 공용 PC에서는 사용 후 삭제를 권장한다.
 */

const BASE = 'https://api.groq.com/openai/v1'
const ENDPOINT = `${BASE}/chat/completions`

/**
 * 폴백 목록. Groq 은 모델을 수시로 교체(decommission)하므로
 * 키가 있으면 listModels() 로 실제 사용 가능한 목록을 받아 쓰는 것이 원칙이다.
 */
export const MODELS = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
]

export const DEFAULT_MODEL = MODELS[0].id

// 채팅용이 아닌 모델(음성·임베딩·안전 필터 등)은 목록에서 제외한다
const NON_CHAT = /whisper|tts|embed|guard|playai|safety|moderation|orpheus|canopylabs/i

/** 키로 실제 호출 가능한 채팅 모델 목록을 받아온다. 큰 모델이 위로 오도록 정렬. */
export async function listModels(apiKey) {
  const res = await fetch(`${BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(explainError(res.status, await res.text()))

  const json = await res.json()
  const models = (json.data ?? [])
    .filter((m) => m.active !== false && !NON_CHAT.test(m.id))
    .map((m) => ({ id: m.id, label: m.id, context: m.context_window ?? 0 }))
    .sort((a, b) => a.id.localeCompare(b.id))

  if (!models.length) throw new Error('사용 가능한 채팅 모델이 없습니다. Groq Console에서 계정 상태를 확인하세요.')
  return models
}

/** 저장된 모델이 목록에 없을 때 쓸 기본값 — 큰 모델을 우선 고른다. */
export function pickDefaultModel(models) {
  const preferred = [/gpt-oss-120b/, /llama-3\.3-70b/, /kimi-k2/, /70b/, /gpt-oss/, /llama/]
  for (const pattern of preferred) {
    const hit = models.find((m) => pattern.test(m.id))
    if (hit) return hit.id
  }
  return models[0]?.id ?? DEFAULT_MODEL
}

export const SYSTEM_PROMPT = `당신은 대한민국 상권 인텔리전스 분석 전문가입니다.
소상공인시장진흥공단 상가(상권)정보를 근거로, 창업 예정자가 바로 실행할 수 있는 조언을 제공합니다.

원칙:
- 제공된 숫자만 근거로 사용하고, 없는 통계를 지어내지 않습니다.
- 매출·유동인구·임대료처럼 데이터에 없는 항목은 "이 데이터로는 알 수 없음"이라고 명시하고 확인 방법을 알려줍니다.
- 지역 특산물·축제·관광지는 확실히 아는 것만 언급합니다. 확신이 없으면 "지역 특산물은 별도 확인 필요"라고 쓰고,
  "○○산 토마토"처럼 그럴듯한 이름을 만들어내지 않습니다.
- '상위 업종'과 '공백 업종'은 겹칠 수 있습니다. 점포 수가 많아도 지역 규모 대비 기대치보다 적으면 공백으로 잡히기 때문입니다.
  둘 다 등장하는 업종은 "총량은 많지만 규모 대비로는 여전히 여지가 있다"는 뜻으로 해석하고, 모순처럼 서술하지 않습니다.
- 도시 상권에 펜션·캠핑장처럼 입지 자체가 맞지 않는 업종이 공백으로 잡히면, 통계상 수치일 뿐이라고 짚고 추천하지 않습니다.
- 추상적인 조언 대신 업종·메뉴·가격대·타깃처럼 구체적으로 씁니다.
- 반드시 한국어로, 마크다운 소제목과 불릿으로 간결하게 정리합니다. 표는 쓰지 않습니다.`

/** 분석 결과를 프롬프트용 데이터 블록으로 직렬화 */
export function buildBriefingPrompt({
  sido,
  sigungu,
  dong,
  categoryLabel,
  regionTotal,
  selectedCount,
  ratio,
  peerAvgCount,
  peerAvgRatio,
  competition,
  rank,
  peerCount,
  topCategories = [],
  opportunities = [],
  saturated = [],
}) {
  const fmt = (n, d = 1) => Number(n).toFixed(d)
  return `[데이터 입력]
- 분석 지역: ${sido} ${sigungu}${dong ? ` ${dong}` : ' (전체)'}
- 지역 내 전체 점포 수: ${regionTotal.toLocaleString()}개
- 타겟 업종: ${categoryLabel} (${selectedCount.toLocaleString()}개, 점유율 ${fmt(ratio, 2)}%)
- 같은 시/도 시군구 ${peerCount}곳 평균: ${fmt(peerAvgCount, 0)}개 (평균 점유율 ${fmt(peerAvgRatio, 2)}%)
- 경쟁 강도 판정: ${competition.label}${rank ? ` / 시도 내 점포 수 ${rank}위` : ''}
- 지역 내 상위 업종: ${topCategories.map((c) => `${c.name} ${c.count}개(${fmt(c.ratio)}%)`).join(', ') || '없음'}
- 공백/기회 업종(지역 규모 보정 기대치 대비 부족): ${
    opportunities
      .map((o) => `${o.l3 || o.l2 || o.l1} (실제 ${o.myCount}개 vs 기대 ${fmt(o.expected, 0)}개)`)
      .join(', ') || '없음'
  }
- 포화 업종(기대치 대비 과다): ${
    saturated
      .map((o) => `${o.l3 || o.l2 || o.l1} (실제 ${o.myCount}개 vs 기대 ${fmt(o.expected, 0)}개)`)
      .join(', ') || '없음'
  }

[요청 사항]
1. 현재 상권의 경쟁 강도와 특성을 3~4문장으로 종합 브리핑하십시오.
2. 기존 업종의 획일화를 탈피할 차별화 전략과 대표 메뉴/서비스 아이디어를 3가지 제시하십시오.
3. 지역 특산물, 관광객과 현지인의 소비 패턴 차이를 반영한 구체적인 창업 팁을 제안하십시오.
4. 마지막에 "확인이 필요한 항목" 2~3가지를 짧게 적으십시오.`
}

/** SSE 스트리밍 호출. 토큰 조각을 순차적으로 yield 한다. */
export async function* streamChat({ apiKey, model, history, systemInstruction, signal }) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.8,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: systemInstruction },
        ...history.map((m) => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.text,
        })),
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(explainError(res.status, body))
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      if (payload === '[DONE]') return
      try {
        const json = JSON.parse(payload)
        const text = json.choices?.[0]?.delta?.content ?? ''
        if (text) yield text
      } catch {
        // 조각난 SSE 프레임은 무시하고 다음 줄을 기다린다
      }
    }
  }
}

function explainError(status, body) {
  let message = body
  try {
    message = JSON.parse(body)?.error?.message || body
  } catch {
    /* 그대로 사용 */
  }
  if (status === 401)
    return 'API 키가 올바르지 않습니다. Groq Console에서 발급한 키(gsk_ 로 시작)를 다시 확인해 주세요.'
  if (status === 403) return '이 키로는 Groq API를 호출할 수 없습니다. (권한/제한 설정 확인)'
  if (status === 429)
    return '무료 티어 호출 한도를 초과했습니다. 잠시 후 다시 시도하거나 더 가벼운 모델을 선택하세요.'
  if (status === 404 || /decommissioned|does not exist/i.test(message))
    return `모델을 쓸 수 없습니다. 다른 모델을 선택해 보세요. (${message})`
  return `Groq 호출 실패 (${status}): ${message}`
}
