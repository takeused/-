/** 상권 통계 연산 — 필터링, 점유율, 경쟁 강도, 공백(블루오션) 업종 도출 */

export const ALL = ''

/** 사전 인코딩된 stores/*.json 을 다루기 쉬운 객체 배열로 편다. */
export function expandStores(file) {
  const { dict, rows } = file
  return rows.map(([name, l1, l2, l3, dong, lat, lng, addr]) => ({
    name,
    l1: dict.l1[l1],
    l2: dict.l2[l2],
    l3: dict.l3[l3],
    dong: dict.dong[dong],
    lat,
    lng,
    addr,
  }))
}

export function categoryKey({ l1, l2, l3 }) {
  if (l3) return `${l1}|${l2}|${l3}`
  if (l2) return `${l1}|${l2}`
  return l1
}

export function categoryLabel({ l1, l2, l3 }) {
  if (!l1) return '전체 업종'
  return [l1, l2, l3].filter(Boolean).join(' › ')
}

/** 시군구 summary 객체에서 현재 업종 필터에 해당하는 점포 수를 꺼낸다. */
export function countFromSummary(counts, filter) {
  if (!counts) return 0
  if (!filter.l1) return counts.total
  if (filter.l3) return counts.l3[categoryKey(filter)] || 0
  if (filter.l2) return counts.l2[categoryKey(filter)] || 0
  return counts.l1[filter.l1] || 0
}

export function filterStores(stores, { dong, l1, l2, l3 }) {
  return stores.filter(
    (s) =>
      (!dong || s.dong === dong) &&
      (!l1 || s.l1 === l1) &&
      (!l2 || s.l2 === l2) &&
      (!l3 || s.l3 === l3),
  )
}

const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0)

/**
 * 선택 상권의 핵심 지표.
 * @param stores  선택한 시군구의 전체 점포
 * @param filter  { dong, l1, l2, l3 }
 * @param sidoSummary  summary/{sidoId}.json
 * @param sigunguId    현재 시군구 id
 */
export function analyze(stores, filter, sidoSummary, sigunguId) {
  const inRegion = filterStores(stores, { dong: filter.dong })
  const selected = filterStores(stores, filter)

  const regionTotal = inRegion.length
  const selectedCount = selected.length
  const ratio = pct(selectedCount, regionTotal)

  // 같은 시/도 안의 다른 시군구와 비교 (시군구 단위 summary 사용)
  const peers = Object.entries(sidoSummary?.sigungu || {}).map(([id, counts]) => ({
    id,
    count: countFromSummary(counts, filter),
    total: counts.total,
    ratio: pct(countFromSummary(counts, filter), counts.total),
  }))

  const peerAvgCount = peers.length
    ? peers.reduce((s, p) => s + p.count, 0) / peers.length
    : 0
  const peerAvgRatio = peers.length
    ? peers.reduce((s, p) => s + p.ratio, 0) / peers.length
    : 0

  const competitionIndex = peerAvgRatio > 0 ? ratio / peerAvgRatio : 0
  const rank =
    peers.length && filter.l1
      ? [...peers].sort((a, b) => b.count - a.count).findIndex((p) => p.id === sigunguId) + 1
      : 0

  return {
    regionTotal,
    selectedCount,
    ratio,
    selected,
    peerAvgCount,
    peerAvgRatio,
    competitionIndex,
    competition: gradeCompetition(competitionIndex, selectedCount),
    rank,
    peerCount: peers.length,
  }
}

export function gradeCompetition(index, count) {
  if (!count) return { level: 'empty', label: '점포 없음', tone: 'sky', desc: '해당 업종 점포가 없습니다. 완전 공백 상권입니다.' }
  if (index >= 1.5) return { level: 'high', label: '과열', tone: 'red', desc: '시/도 평균 대비 점포 밀도가 매우 높습니다. 차별화 없이는 진입이 불리합니다.' }
  if (index >= 1.15) return { level: 'above', label: '높음', tone: 'orange', desc: '평균보다 경쟁이 치열합니다. 확실한 컨셉이 필요합니다.' }
  if (index >= 0.85) return { level: 'normal', label: '보통', tone: 'slate', desc: '시/도 평균 수준의 경쟁 강도입니다.' }
  if (index >= 0.5) return { level: 'low', label: '낮음', tone: 'emerald', desc: '평균보다 점포가 적습니다. 수요만 확인되면 기회가 있습니다.' }
  return { level: 'blue', label: '공백', tone: 'sky', desc: '평균 대비 현저히 적습니다. 블루오션 후보입니다.' }
}

/**
 * 공백(기회) 업종 / 포화 업종 도출.
 * 시도 평균 '비중'과 현재 지역 '비중'의 차이를 기대 점포 수 차이로 환산해 정렬한다.
 */
export function findOpportunities(sidoSummary, sigunguId, { level = 'l3', limit = 6 } = {}) {
  const mine = sidoSummary?.sigungu?.[sigunguId]
  if (!mine) return { opportunities: [], saturated: [] }

  const peers = Object.entries(sidoSummary.sigungu).filter(([id]) => id !== sigunguId)
  const keys = new Set(Object.keys(mine[level]))
  peers.forEach(([, c]) => Object.keys(c[level]).forEach((k) => keys.add(k)))

  const rows = []
  for (const key of keys) {
    const myCount = mine[level][key] || 0
    const myRatio = pct(myCount, mine.total)
    const peerRatios = peers.map(([, c]) => pct(c[level][key] || 0, c.total))
    const peerCounts = peers.map(([, c]) => c[level][key] || 0)
    if (!peerRatios.length) continue

    const avgRatio = peerRatios.reduce((s, r) => s + r, 0) / peerRatios.length
    const avgCount = peerCounts.reduce((s, r) => s + r, 0) / peerCounts.length
    // 우리 지역 규모에 평균 비중을 적용했을 때 "있어야 할" 점포 수
    const expected = (avgRatio / 100) * mine.total
    const gap = expected - myCount
    if (avgCount < 3) continue // 표본이 너무 적은 업종은 노이즈

    const [l1, l2, l3] = key.split('|')
    rows.push({ key, l1, l2, l3, myCount, myRatio, avgCount, avgRatio, expected, gap })
  }

  const opportunities = rows
    .filter((r) => r.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit)
  const saturated = rows
    .filter((r) => r.gap < 0)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, limit)

  return { opportunities, saturated }
}

/** 상위 업종 랭킹 (현재 필터 범위 안에서) */
export function topCategories(stores, level = 'l3', limit = 10) {
  const counts = new Map()
  for (const s of stores) counts.set(s[level], (counts.get(s[level]) || 0) + 1)
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, ratio: pct(count, stores.length) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/** 행정동별 분포 */
export function byDong(stores) {
  const counts = new Map()
  for (const s of stores) counts.set(s.dong, (counts.get(s.dong) || 0) + 1)
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}
