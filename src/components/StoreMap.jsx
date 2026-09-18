import { useEffect, useRef, useState } from 'react'
import { MapPinned } from 'lucide-react'

const SDK_ID = 'kakao-maps-sdk'

/** 카카오 지도 SDK를 키가 생겼을 때 1회만 동적 로드 */
function loadKakaoSdk(appKey) {
  if (window.kakao?.maps?.MarkerClusterer) return Promise.resolve(window.kakao)
  return new Promise((resolve, reject) => {
    let script = document.getElementById(SDK_ID)
    if (!script) {
      script = document.createElement('script')
      script.id = SDK_ID
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=clusterer`
      document.head.appendChild(script)
    }
    script.addEventListener('load', () => window.kakao.maps.load(() => resolve(window.kakao)))
    script.addEventListener('error', () =>
      reject(new Error('카카오맵 SDK를 불러오지 못했습니다. 앱 키와 등록된 웹 플랫폼 도메인을 확인하세요.')),
    )
    if (window.kakao?.maps) window.kakao.maps.load(() => resolve(window.kakao))
  })
}

export default function StoreMap({ stores, appKey, onRequestKey }) {
  const boxRef = useRef(null)
  const mapRef = useRef(null)
  const clustererRef = useRef(null)
  const infoRef = useRef(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!appKey) return
    let cancelled = false
    loadKakaoSdk(appKey)
      .then((kakao) => {
        if (cancelled || !boxRef.current) return
        mapRef.current = new kakao.maps.Map(boxRef.current, {
          center: new kakao.maps.LatLng(37.5665, 126.978),
          level: 7,
        })
        clustererRef.current = new kakao.maps.MarkerClusterer({
          map: mapRef.current,
          averageCenter: true,
          minLevel: 6,
          gridSize: 60,
        })
        infoRef.current = new kakao.maps.InfoWindow({ removable: true })
        setReady(true)
      })
      .catch((e) => setError(e.message))
    return () => {
      cancelled = true
    }
  }, [appKey])

  useEffect(() => {
    if (!ready || !stores) return
    const kakao = window.kakao
    const clusterer = clustererRef.current
    clusterer.clear()
    if (!stores.length) return

    // 점포가 매우 많으면 렌더 비용이 커서 상한을 둔다
    const limited = stores.length > 3000 ? stores.slice(0, 3000) : stores
    const bounds = new kakao.maps.LatLngBounds()

    const markers = limited.map((s) => {
      const position = new kakao.maps.LatLng(s.lat, s.lng)
      bounds.extend(position)
      const marker = new kakao.maps.Marker({ position })
      kakao.maps.event.addListener(marker, 'click', () => {
        infoRef.current.setContent(
          `<div style="padding:8px 10px;font-size:12px;line-height:1.5;max-width:240px">
             <b style="font-size:13px">${escapeHtml(s.name)}</b><br/>
             <span style="color:#555">${escapeHtml(s.l1)} › ${escapeHtml(s.l2)} › ${escapeHtml(s.l3)}</span><br/>
             <span style="color:#888">${escapeHtml(s.addr || s.dong)}</span>
           </div>`,
        )
        infoRef.current.open(mapRef.current, marker)
      })
      return marker
    })

    clusterer.addMarkers(markers)
    mapRef.current.setBounds(bounds)
  }, [ready, stores])

  if (!appKey) {
    return (
      <div className="flex h-[520px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white text-center">
        <MapPinned size={28} className="text-slate-400" />
        <div>
          <p className="font-semibold text-slate-800">카카오맵 JavaScript 키가 필요합니다</p>
          <p className="mt-1 text-sm text-slate-500">
            Kakao Developers에서 앱을 만들고 JavaScript 키를 입력하면 점포 위치가 표시됩니다.
          </p>
        </div>
        <button
          onClick={onRequestKey}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          키 입력하기
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <div ref={boxRef} className="h-[520px] w-full rounded-2xl border border-slate-200 bg-slate-100" />
      <p className="text-xs text-slate-500">
        표시 중 {Math.min(stores?.length ?? 0, 3000).toLocaleString()}개
        {stores && stores.length > 3000 && ` (전체 ${stores.length.toLocaleString()}개 중 상위 3,000개만 렌더링)`}
        · 마커를 클릭하면 상호·주소·업종이 표시됩니다.
      </p>
    </div>
  )
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c])
}
