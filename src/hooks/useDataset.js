import { useCallback, useEffect, useRef, useState } from 'react'
import { expandStores } from '../lib/stats'

// 실제 수집 데이터(public/data)는 용량이 커서 저장소에 올리지 않는다.
// 없으면 저장소에 포함된 샘플(public/sample-data)로 자동 폴백해, 클론 직후에도 앱이 동작한다.
const REAL = `${import.meta.env.BASE_URL}data`
const SAMPLE = `${import.meta.env.BASE_URL}sample-data`

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다: ${url} (${res.status})`)
  return res.json()
}

/** index.json 은 앱 시작 시 1회, summary/stores 는 선택할 때마다 지연 로딩 + 캐시 */
export function useDataset() {
  const [index, setIndex] = useState(null)
  const [error, setError] = useState(null)
  const [base, setBase] = useState(REAL)
  const cache = useRef({ summary: new Map(), stores: new Map() })

  useEffect(() => {
    let cancelled = false
    getJson(`${REAL}/index.json`)
      .then((data) => !cancelled && setIndex(data))
      .catch(() =>
        getJson(`${SAMPLE}/index.json`).then((data) => {
          if (cancelled) return
          setBase(SAMPLE)
          setIndex({ ...data, isSample: true })
        }),
      )
      .catch((e) => !cancelled && setError(e.message))

    return () => {
      cancelled = true
    }
  }, [])

  const loadSummary = useCallback(
    async (sidoId) => {
      const { summary } = cache.current
      if (!summary.has(sidoId)) summary.set(sidoId, getJson(`${base}/summary/${sidoId}.json`))
      return summary.get(sidoId)
    },
    [base],
  )

  const loadStores = useCallback(
    async (sigunguId) => {
      const { stores } = cache.current
      if (!stores.has(sigunguId)) {
        stores.set(
          sigunguId,
          getJson(`${base}/stores/${sigunguId}.json`).then((file) => ({
            meta: { id: file.id, sido: file.sido, sigungu: file.sigungu },
            stores: expandStores(file),
          })),
        )
      }
      return stores.get(sigunguId)
    },
    [base],
  )

  return { index, error, loadSummary, loadStores }
}

/** 선택된 시군구의 점포 + 시도 summary 를 함께 들고 온다. */
export function useRegionData({ loadSummary, loadStores }, sidoId, sigunguId) {
  const [state, setState] = useState({ loading: false, stores: null, summary: null, error: null })

  useEffect(() => {
    if (!sidoId || !sigunguId) {
      setState({ loading: false, stores: null, summary: null, error: null })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    Promise.all([loadSummary(sidoId), loadStores(sigunguId)])
      .then(([summary, storeFile]) => {
        if (cancelled) return
        setState({ loading: false, summary, stores: storeFile.stores, error: null })
      })
      .catch((e) => {
        if (!cancelled) setState({ loading: false, stores: null, summary: null, error: e.message })
      })

    return () => {
      cancelled = true
    }
  }, [sidoId, sigunguId, loadSummary, loadStores])

  return state
}
