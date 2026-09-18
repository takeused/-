import { useEffect } from 'react'
import { listModels, pickDefaultModel } from '../lib/llm'

/**
 * 저장된 모델이 계정에서 실제로 쓸 수 있는지 확인하고, 없으면 조용히 갈아끼운다.
 * Groq 은 모델을 수시로 교체하므로, 예전에 저장해둔 이름이 남아 있으면
 * 사용자가 설정을 다시 열기 전까지 호출이 계속 실패하게 된다.
 */
export function useModelGuard(settings, onFix) {
  const { groqKey, model } = settings

  useEffect(() => {
    if (!groqKey) return
    let cancelled = false

    listModels(groqKey)
      .then((list) => {
        if (cancelled || list.some((m) => m.id === model)) return
        onFix(pickDefaultModel(list))
      })
      .catch(() => {
        // 키가 잘못됐거나 네트워크 문제인 경우 — 실제 호출 시점에 안내되므로 여기서는 조용히 넘어간다
      })

    return () => {
      cancelled = true
    }
  }, [groqKey, model, onFix])
}
