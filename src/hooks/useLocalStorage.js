import { useCallback, useState } from 'react'

export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initialValue : JSON.parse(raw)
    } catch {
      return initialValue
    }
  })

  const update = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        try {
          if (resolved === null || resolved === undefined) localStorage.removeItem(key)
          else localStorage.setItem(key, JSON.stringify(resolved))
        } catch {
          // 사생활 보호 모드 등 저장 실패는 무시하고 메모리 상태만 유지
        }
        return resolved
      })
    },
    [key],
  )

  return [value, update]
}
