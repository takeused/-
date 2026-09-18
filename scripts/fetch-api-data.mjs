#!/usr/bin/env node
/**
 * 공공데이터포털 오픈API로 상가(상권)정보를 내려받아 웹앱용 JSON으로 변환한다.
 * CSV를 수동으로 받는 대신 API 키만 있으면 되는 경로.
 *
 *   node scripts/fetch-api-data.mjs 41          # 경기도 전체
 *   node scripts/fetch-api-data.mjs 41820 41830 # 가평군, 양평군만
 *   node scripts/fetch-api-data.mjs 41 --build  # 내려받은 캐시 전부로 public/data 재생성
 *
 * 키는 .env 의 DATA_GO_KR_KEY 에서 읽는다 (.env.example 참고).
 * 브라우저에서 직접 호출하지 않는 이유: data.go.kr 은 CORS 헤더를 주지 않고,
 * 키가 노출되면 하루 트래픽이 소진되기 때문이다. 수집은 이 스크립트(서버 측)에서 한 번만 한다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { writeDataset } from './prepare-data.mjs'

const API = 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong'
const CACHE = '.cache/api'
const ROWS = 1000
// 초당 요청제한 등 잠시 뒤 재시도하면 풀리는 오류
const RATE_LIMITED = /요청제한|LIMITED_NUMBER|TOO_MANY|초당|일시적/i

// 시도 코드(2자리) — 시군구 코드(5자리)는 앞 2자리가 시도 코드다
const SIDO = {
  11: '서울특별시', 26: '부산광역시', 27: '대구광역시', 28: '인천광역시',
  29: '광주광역시', 30: '대전광역시', 31: '울산광역시', 36: '세종특별자치시',
  41: '경기도', 43: '충청북도', 44: '충청남도', 46: '전라남도', 47: '경상북도',
  48: '경상남도', 50: '제주특별자치도', 51: '강원특별자치도', 52: '전북특별자치도',
}

function loadEnv() {
  if (process.env.DATA_GO_KR_KEY) return process.env.DATA_GO_KR_KEY
  if (!fs.existsSync('.env')) return null
  for (const line of fs.readFileSync('.env', 'utf-8').split('\n')) {
    const m = line.match(/^\s*DATA_GO_KR_KEY\s*=\s*(.*)\s*$/)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 네트워크 계층 실패(fetch failed)의 실제 원인을 사람이 읽을 수 있게 풀어준다. */
function explainNetworkError(e, url) {
  const code = e.cause?.code ?? e.code
  const host = new URL(url).host
  const hints = {
    ENOTFOUND: `DNS 조회 실패 — ${host} 이름을 찾지 못했습니다. VPN/사내망 DNS 설정을 확인하세요.`,
    ECONNREFUSED: `연결 거부 — 방화벽이나 프록시가 ${host} 접속을 막고 있습니다.`,
    ECONNRESET: `연결이 끊겼습니다 — 사내 방화벽/보안 장비가 중간에서 끊는 경우가 많습니다.`,
    ETIMEDOUT: '응답 시간 초과 — 프록시를 거쳐야 하는 망일 수 있습니다.',
    UND_ERR_CONNECT_TIMEOUT: '연결 시간 초과 — 프록시를 거쳐야 하는 망일 수 있습니다.',
    EPROTO: 'TLS 핸드셰이크 실패 — HTTPS 검사(SSL 인스펙션) 장비가 있는 망일 수 있습니다.',
    SELF_SIGNED_CERT_IN_CHAIN:
      '사내 보안 장비가 인증서를 바꿔치기하고 있습니다. 회사 루트 인증서를 NODE_EXTRA_CA_CERTS 환경변수로 지정하세요.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE:
      '인증서 검증 실패 — 사내 프록시의 루트 인증서를 NODE_EXTRA_CA_CERTS 로 지정해야 합니다.',
  }
  const detail = hints[code] ?? e.cause?.message ?? e.message
  return new Error(
    `${url.split('?')[0]} 접속 실패 (${code ?? 'unknown'})\n  ${detail}\n` +
      '  · 프록시를 쓰는 망이면: set HTTPS_PROXY=http://프록시주소:포트 후 다시 실행\n' +
      '  · HTTPS 가 막힌 경우: 명령 끝에 --http 를 붙여 평문 HTTP 로 시도\n' +
      '  · 진단만 하려면: npm run data:api -- --check',
  )
}

async function fetchPage(serviceKey, divId, key, pageNo, { http = false } = {}) {
  const params = new URLSearchParams({
    serviceKey,
    pageNo: String(pageNo),
    numOfRows: String(ROWS),
    divId,
    key,
    type: 'json',
  })
  const url = `${http ? API.replace('https://', 'http://') : API}?${params}`

  for (let attempt = 1; attempt <= 5; attempt++) {
    let text
    try {
      const res = await fetch(url)
      text = await res.text()
    } catch (e) {
      // 네트워크 자체가 실패한 경우 — 재시도해도 소용없는 원인이 대부분이라 바로 알린다
      if (attempt === 5 || e.cause?.code === 'ENOTFOUND') throw explainNetworkError(e, url)
      await sleep(attempt * 1500)
      continue
    }

    const failure = readApiError(text)
    if (failure) {
      // 초당 요청제한(코드 23)은 잠시 쉬면 풀린다. 키/파라미터 오류는 재시도해도 소용없다.
      if (RATE_LIMITED.test(failure) && attempt < 3) {
        await sleep(attempt * 1200)
        continue
      }
      throw new Error(failure)
    }

    const json = JSON.parse(text)
    const body = json.body ?? json.response?.body ?? {}
    return { items: body.items ?? [], totalCount: Number(body.totalCount ?? 0) }
  }
}

/** 인증 실패는 XML 또는 OpenAPI_ServiceResponse JSON 으로 내려온다. 정상이면 null. */
function readApiError(text) {
  const head = text.trimStart()
  if (head.startsWith('<')) {
    const msg = text.match(/<returnAuthMsg>([^<]*)</)?.[1]
    const code = text.match(/<returnReasonCode>([^<]*)</)?.[1]
    return `API 오류 (${code ?? '?'}): ${msg ?? text.slice(0, 200)}`
  }

  let json
  try {
    json = JSON.parse(text)
  } catch {
    return `응답을 해석할 수 없습니다: ${text.slice(0, 200)}`
  }

  const envelope = json.OpenAPI_ServiceResponse?.cmmMsgHeader
  if (envelope) {
    const msg = envelope.returnAuthMsg ?? envelope.errMsg
    const code = envelope.returnReasonCode ?? '?'
    let guide = ''

    if (envelope.errMsg === 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR') {
      guide =
        '\n  · .env 의 DATA_GO_KR_KEY 가 "일반 인증키(Decoding)" 인지 확인하세요.\n' +
        '  · 승인 직후에는 반영까지 몇 분~1시간이 걸릴 수 있습니다.\n' +
        '  · 해당 API(소상공인시장진흥공단 상가업소정보)를 활용신청했는지도 확인하세요.'
    } else if (code === '23' || RATE_LIMITED.test(String(msg))) {
      // 문구는 "초당"이라고 나오지만, 간격을 두고 한 건만 보내도 계속 실패하면 일일 할당량 소진이다
      guide =
        '\n  이 메시지는 "초당"이라고 나오지만, 요청 간격을 벌려도 계속 실패하면 일일 트래픽 소진입니다.\n' +
        '  · 개발계정 기본 한도는 하루 1,000건이며 매일 자정에 초기화됩니다.\n' +
        '  · data.go.kr > 마이페이지 > 오픈API > 활용현황 에서 남은 트래픽을 확인하세요.\n' +
        '  · 한도를 늘리려면 해당 API 상세 페이지에서 "활용사례 등록" 또는 운영계정을 신청하세요.\n' +
        '  · 급하면 CSV 경로를 쓰세요 (트래픽과 무관): npm run data:csv -- ./다운로드폴더\n' +
        '  · 이미 받아둔 페이지는 .cache 에 남아 있어, 내일 같은 명령으로 이어받습니다.'
    }
    return `API 오류 (${code}): ${msg}${guide}`
  }

  const header = json.header ?? json.response?.header
  if (header?.resultCode && header.resultCode !== '00') {
    return `API 오류 (${header.resultCode}): ${header.resultMsg ?? ''}`
  }
  return null
}

/**
 * 지역 코드 하나를 끝까지 받아 .cache/api/<code>/p0001.json 형태로 페이지마다 저장한다.
 * 시도 단위(수십만 건)는 한 파일에 담으면 JSON 문자열 길이 한계에 걸리고,
 * 중간에 끊겼을 때 처음부터 다시 받아야 하므로 페이지 단위로 쪼갠다.
 */
async function fetchRegion(serviceKey, code, opts = {}) {
  const divId = code.length === 2 ? 'ctprvnCd' : code.length === 5 ? 'signguCd' : 'adongCd'
  const dir = path.join(CACHE, code)
  const legacy = path.join(CACHE, `${code}.json`)

  if (fs.existsSync(legacy)) {
    const count = JSON.parse(fs.readFileSync(legacy, 'utf-8')).length
    console.log(`  · ${code}: 캐시 사용 (${count.toLocaleString()}건) — 다시 받으려면 ${legacy} 삭제`)
    return
  }

  fs.mkdirSync(dir, { recursive: true })
  const donePath = path.join(dir, 'done.json')
  if (fs.existsSync(donePath)) {
    const done = JSON.parse(fs.readFileSync(donePath, 'utf-8'))
    console.log(`  · ${code}: 캐시 사용 (${done.count.toLocaleString()}건) — 다시 받으려면 ${dir} 삭제`)
    return
  }

  const pageFile = (n) => path.join(dir, `p${String(n).padStart(4, '0')}.json`)
  const have = new Set(
    fs.readdirSync(dir).filter((f) => /^p\d+\.json$/.test(f)).map((f) => Number(f.slice(1, 5))),
  )
  const label = SIDO[code.slice(0, 2)] ?? ''

  // 1페이지로 총 건수를 먼저 확인한다
  const first = await fetchPage(serviceKey, divId, code, 1, opts)
  const total = first.totalCount
  const lastPage = Math.ceil(total / ROWS)
  console.log(`  · ${code} (${label}): 총 ${total.toLocaleString()}건 / ${lastPage}페이지`)
  if (!total) return

  if (!have.has(1)) {
    fs.writeFileSync(pageFile(1), JSON.stringify(first.items))
    have.add(1)
  }
  if (have.size > 1) console.log(`    ${have.size}페이지는 이미 받아둠 — 나머지만 받습니다`)

  // 남은 페이지를 동시 요청으로 나눠 받는다 (순차로는 수십 분이 걸린다)
  const todo = []
  for (let p = 2; p <= lastPage; p++) if (!have.has(p)) todo.push(p)

  let done = 0
  for (let i = 0; i < todo.length; i += opts.concurrency) {
    const batch = todo.slice(i, i + opts.concurrency)
    const results = await Promise.all(
      batch.map((p) => fetchPage(serviceKey, divId, code, p, opts).then((r) => [p, r])),
    )
    for (const [p, r] of results) {
      if (r.items.length) fs.writeFileSync(pageFile(p), JSON.stringify(r.items))
      done++
    }
    process.stdout.write(
      `\r    ${(have.size + done).toLocaleString()} / ${lastPage.toLocaleString()} 페이지`,
    )
    await sleep(250) // 초당 요청제한 여유
  }

  process.stdout.write('\n')
  fs.writeFileSync(donePath, JSON.stringify({ code, count: total, at: new Date().toISOString() }))
}

/** 캐시에 있는 응답 파일 경로 — 예전 방식(<code>.json)과 페이지 방식(<code>/p0001.json) 모두 */
function cacheFiles() {
  if (!fs.existsSync(CACHE)) return []
  const files = []
  for (const entry of fs.readdirSync(CACHE, { withFileTypes: true })) {
    const full = path.join(CACHE, entry.name)
    if (entry.isFile() && entry.name.endsWith('.json')) files.push(full)
    else if (entry.isDirectory()) {
      for (const page of fs.readdirSync(full)) {
        if (/^p\d+\.json$/.test(page)) files.push(path.join(full, page))
      }
    }
  }
  return files
}

/** 캐시에 쌓인 원본 응답 전부를 시군구 버킷으로 정리 */
function buildFromCache() {
  const buckets = new Map()
  const seen = new Set()

  for (const file of cacheFiles()) {
    const items = JSON.parse(fs.readFileSync(file, 'utf-8'))
    for (const it of items) {
      if (seen.has(it.bizesId)) continue // 시도+시군구를 같이 받았을 때의 중복 제거
      seen.add(it.bizesId)

      const lat = Number(it.lat)
      const lng = Number(it.lon)
      const sido = (it.ctprvnNm ?? '').trim()
      const sigungu = (it.signguNm ?? '').trim()
      if (!sido || !sigungu || !Number.isFinite(lat) || !Number.isFinite(lng)) continue

      const key = `${sido}|${sigungu}`
      if (!buckets.has(key)) buckets.set(key, { sido, sigungu, rows: [] })
      buckets.get(key).rows.push({
        name: (it.bizesNm ?? '').trim(),
        l1: (it.indsLclsNm ?? '기타').trim(),
        l2: (it.indsMclsNm ?? '기타').trim(),
        l3: (it.indsSclsNm ?? '기타').trim(),
        dong: (it.adongNm ?? it.ldongNm ?? '기타').trim(),
        lat: Math.round(lat * 1e6) / 1e6,
        lng: Math.round(lng * 1e6) / 1e6,
        addr: (it.rdnmAdr ?? it.lnoAdr ?? '').trim(),
      })
    }
  }
  return buckets
}

/** 네트워크·키·API 를 순서대로 한 번씩만 찔러보는 진단 모드 */
async function check(serviceKey) {
  console.log('\n[1/3] 인터넷 연결')
  await probe('https://www.data.go.kr')

  console.log('[2/3] API 서버 연결 (HTTPS / HTTP)')
  const httpsOk = await probe('https://apis.data.go.kr')
  const httpOk = await probe('http://apis.data.go.kr')

  console.log('[3/3] 인증키')
  if (!serviceKey) {
    console.log('  ✗ .env 의 DATA_GO_KR_KEY 가 비어 있습니다.')
    return
  }
  console.log(`  키 길이 ${serviceKey.length}자 (앞 6자리 ${serviceKey.slice(0, 6)}…)`)
  if (!httpsOk && !httpOk) {
    console.log('  → 서버에 닿지 못해 키 확인을 건너뜁니다. 위의 네트워크 오류를 먼저 해결하세요.')
    return
  }
  try {
    const { totalCount } = await fetchPage(serviceKey, 'signguCd', '41820', 1, { http: !httpsOk })
    console.log(`  ✓ 정상 — 가평군 ${totalCount.toLocaleString()}건 조회 가능`)
    console.log(`\n이제 수집하세요: npm run data:api 41820${httpsOk ? '' : ' -- --http'}`)
  } catch (e) {
    console.log(`  ✗ ${e.message}`)
  }
}

async function probe(url) {
  const started = Date.now()
  try {
    const res = await fetch(url, { redirect: 'manual' })
    console.log(`  ✓ ${url} — HTTP ${res.status} (${Date.now() - started}ms)`)
    return true
  } catch (e) {
    console.log(`  ✗ ${explainNetworkError(e, url).message.split('\n')[1]?.trim() ?? e.message}`)
    console.log(`    (${url}, ${e.cause?.code ?? 'unknown'})`)
    return false
  }
}

async function main() {
  const codes = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const buildOnly = process.argv.includes('--build')
  const checkOnly = process.argv.includes('--check')
  const http = process.argv.includes('--http')
  const concurrencyArg = process.argv.find((a) => a.startsWith('--concurrency='))
  const concurrency = Math.min(12, Math.max(1, Number(concurrencyArg?.split('=')[1]) || 4))

  let serviceKey = loadEnv()
  if (serviceKey?.includes('%')) serviceKey = decodeURIComponent(serviceKey)

  if (checkOnly) return check(serviceKey)

  if (!serviceKey && !buildOnly) {
    console.error(
      '\nDATA_GO_KR_KEY 가 없습니다.\n' +
        '  1) 프로젝트 루트의 .env 파일을 열고 (없으면 .env.example 을 복사)\n' +
        '  2) data.go.kr 마이페이지 > 오픈API > 인증키의 "일반 인증키(Decoding)" 값을 DATA_GO_KR_KEY= 뒤에 넣어주세요.\n',
    )
    process.exit(1)
  }
  if (!buildOnly) {
    if (!codes.length) {
      console.error('지역 코드를 지정하세요. 예) node scripts/fetch-api-data.mjs 41\n')
      console.error('시도 코드: ' + Object.entries(SIDO).map(([c, n]) => `${c}=${n}`).join(', '))
      process.exit(1)
    }
    console.log(`공공데이터 API 수집 시작${http ? ' (HTTP 모드)' : ''} · 동시 요청 ${concurrency}개`)
    for (const code of codes) await fetchRegion(serviceKey, code, { http, concurrency })
  }

  const buckets = buildFromCache()
  if (!buckets.size) {
    console.error('변환할 데이터가 없습니다. 먼저 지역 코드를 지정해 수집하세요.')
    process.exit(1)
  }
  writeDataset(buckets, 'public/data')
  const total = [...buckets.values()].reduce((s, b) => s + b.rows.length, 0)
  console.log(`\n완료: ${buckets.size}개 시군구 / ${total.toLocaleString()}개 점포 → public/data`)
}

main().catch((e) => {
  console.error('\n실패:', e.message)
  process.exit(1)
})
