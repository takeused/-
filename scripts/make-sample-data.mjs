#!/usr/bin/env node
/**
 * 실제 CSV가 준비되기 전에 쓰는 샘플 데이터 생성기.
 * 컬럼 구조·분류 체계·좌표 범위를 실제 상가(상권)정보와 동일하게 맞췄기 때문에,
 * 나중에 prepare-data.mjs 로 실제 CSV를 돌리면 앱 코드는 그대로 동작한다.
 *
 *   node scripts/make-sample-data.mjs                 # -> public/sample-data (저장소에 포함)
 *   node scripts/make-sample-data.mjs --out public/data # -> 앱이 우선 읽는 위치
 */
import { writeDataset } from './prepare-data.mjs'

// 소상공인시장진흥공단 분류 체계(일부 발췌)
const CATEGORIES = {
  음식: {
    한식: ['백반/한정식', '국/탕/찌개류', '족발/보쌈', '고기요리', '냉면/국수'],
    중식: ['중국집', '중화요리전문', '양꼬치전문'],
    '일식/수산물': ['일식집', '초밥전문', '횟집'],
    양식: ['이탈리안', '스테이크전문', '패밀리레스토랑'],
    '커피점/카페': ['카페', '테마카페', '전통찻집'],
    '제과제빵떡케익': ['제과점', '떡집', '도넛전문'],
    닭오리요리: ['치킨', '닭갈비', '오리요리'],
    유흥주점: ['호프/맥주', '포장마차', '와인바'],
  },
  소매: {
    '음/식료품소매': ['편의점', '정육점', '반찬가게', '농산물판매'],
    '종합소매점': ['슈퍼마켓', '생활용품점'],
    '의복의류': ['캐주얼/스포츠의류', '아동복'],
    '가정/주방/인테리어': ['가구판매', '조명/인테리어'],
  },
  생활서비스: {
    '이/미용/건강': ['미용실', '네일숍', '피부관리'],
    세탁서비스: ['세탁소', '코인빨래방'],
    '자동차/이륜차': ['자동차정비', '세차장'],
    '개인서비스': ['사진관', '수선집'],
  },
  '학문/교육': {
    '학원-보습교습입시': ['입시학원', '보습학원'],
    '학원-예체능': ['음악학원', '미술학원', '태권도장'],
    '학원-외국어': ['영어학원', '중국어학원'],
  },
  '관광/여가/오락': {
    '관광/휴양': ['관광농원', '수목원/식물원', '유원지'],
    '레저/스포츠': ['캠핑장', '수상레저', '골프연습장'],
    '오락': ['PC방', '노래방', '당구장'],
  },
  숙박: {
    '일반숙박': ['모텔/여관', '호텔'],
    '캠핑/펜션': ['펜션', '글램핑', '도미토리'],
  },
  스포츠: {
    '스포츠시설': ['헬스클럽', '요가/필라테스', '수영장'],
  },
}

// 지역별 성격 가중치 — 관광지/신도시/도심의 업종 구성 차이를 만든다
const REGIONS = [
  { sido: '경기도', sigungu: '가평군', dongs: ['가평읍', '청평면', '설악면', '상면'], center: [37.831, 127.509], stores: 1400, weights: { 음식: 1.3, 숙박: 3.2, '관광/여가/오락': 2.6, '학문/교육': 0.3, 스포츠: 0.4, 소매: 0.9, 생활서비스: 0.8 } },
  { sido: '경기도', sigungu: '양평군', dongs: ['양평읍', '용문면', '서종면', '강상면'], center: [37.491, 127.487], stores: 1600, weights: { 음식: 1.2, 숙박: 2.4, '관광/여가/오락': 2.0, '학문/교육': 0.5, 스포츠: 0.5, 소매: 1.0, 생활서비스: 0.9 } },
  { sido: '경기도', sigungu: '성남시 분당구', dongs: ['정자동', '서현동', '야탑동', '판교동'], center: [37.382, 127.119], stores: 5200, weights: { 음식: 1.1, 숙박: 0.2, '관광/여가/오락': 0.8, '학문/교육': 2.8, 스포츠: 1.6, 소매: 1.1, 생활서비스: 1.3 } },
  { sido: '경기도', sigungu: '수원시 팔달구', dongs: ['인계동', '매교동', '행궁동', '우만동'], center: [37.279, 127.017], stores: 4300, weights: { 음식: 1.3, 숙박: 0.6, '관광/여가/오락': 1.1, '학문/교육': 1.4, 스포츠: 1.0, 소매: 1.2, 생활서비스: 1.2 } },
  { sido: '서울특별시', sigungu: '마포구', dongs: ['서교동', '연남동', '합정동', '망원동'], center: [37.556, 126.914], stores: 6100, weights: { 음식: 1.8, 숙박: 0.4, '관광/여가/오락': 1.2, '학문/교육': 0.9, 스포츠: 1.1, 소매: 1.0, 생활서비스: 1.1 } },
  { sido: '서울특별시', sigungu: '강남구', dongs: ['역삼동', '논현동', '청담동', '대치동'], center: [37.497, 127.045], stores: 7200, weights: { 음식: 1.4, 숙박: 0.5, '관광/여가/오락': 0.9, '학문/교육': 2.4, 스포츠: 1.5, 소매: 1.1, 생활서비스: 1.4 } },
  { sido: '강원특별자치도', sigungu: '속초시', dongs: ['조양동', '교동', '동명동', '영랑동'], center: [38.207, 128.591], stores: 2100, weights: { 음식: 1.6, 숙박: 2.8, '관광/여가/오락': 1.8, '학문/교육': 0.5, 스포츠: 0.5, 소매: 1.0, 생활서비스: 0.9 } },
  { sido: '강원특별자치도', sigungu: '춘천시', dongs: ['퇴계동', '석사동', '효자동', '남산면'], center: [37.881, 127.73], stores: 3300, weights: { 음식: 1.3, 숙박: 1.1, '관광/여가/오락': 1.3, '학문/교육': 1.2, 스포츠: 0.8, 소매: 1.0, 생활서비스: 1.0 } },
]

const PREFIX = ['행복', '참좋은', '으뜸', '한마음', '새봄', '오래된', '골목', '푸른', '달빛', '소소한', '정성', '늘봄']
const SUFFIX = ['본점', '직영점', '2호점', '점', '하우스', '마을']

/** 시드 고정 난수 — 실행할 때마다 같은 샘플이 나오도록 */
function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const rand = makeRandom(20260918)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]

function weightedPick(entries) {
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let r = rand() * total
  for (const [value, w] of entries) {
    r -= w
    if (r <= 0) return value
  }
  return entries[entries.length - 1][0]
}

/** 정규분포 근사(중심에 몰리는 좌표 분포) */
function gauss() {
  return (rand() + rand() + rand() + rand() - 2) / 2
}

const buckets = new Map()

for (const region of REGIONS) {
  const rows = []
  const l1Entries = Object.keys(CATEGORIES).map((l1) => [l1, region.weights[l1] ?? 1])

  for (let i = 0; i < region.stores; i++) {
    const l1 = weightedPick(l1Entries)
    const l2 = pick(Object.keys(CATEGORIES[l1]))
    const l3 = pick(CATEGORIES[l1][l2])
    const dong = pick(region.dongs)

    rows.push({
      name: `${pick(PREFIX)}${l3.replace(/[/-].*$/, '')}${pick(SUFFIX)}`,
      l1,
      l2,
      l3,
      dong,
      lat: Math.round((region.center[0] + gauss() * 0.035) * 1e6) / 1e6,
      lng: Math.round((region.center[1] + gauss() * 0.045) * 1e6) / 1e6,
      addr: `${region.sido} ${region.sigungu} ${dong} ${1 + Math.floor(rand() * 400)}`,
    })
  }

  buckets.set(`${region.sido}|${region.sigungu}`, {
    sido: region.sido,
    sigungu: region.sigungu,
    rows,
  })
}

// 기본 출력은 저장소에 커밋되는 샘플 위치. --out 으로 바꿀 수 있다.
const outIdx = process.argv.indexOf('--out')
const outDir = outIdx !== -1 ? process.argv[outIdx + 1] : 'public/sample-data'

writeDataset(buckets, outDir)
const total = [...buckets.values()].reduce((s, b) => s + b.rows.length, 0)
console.log(`샘플 데이터 생성 완료: ${buckets.size}개 시군구 / ${total.toLocaleString()}개 점포 → ${outDir}`)
console.log('실제 데이터로 교체하려면: node scripts/prepare-data.mjs <csv 폴더>')
