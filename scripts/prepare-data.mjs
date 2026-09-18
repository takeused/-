#!/usr/bin/env node
/**
 * 공공데이터포털 "소상공인시장진흥공단_상가(상권)정보" CSV -> 웹앱용 경량 JSON 분할
 *
 *   node scripts/prepare-data.mjs <csv 파일 또는 폴더> [--out public/data]
 *
 * 원본 CSV는 전국 기준 수백 MB라 브라우저가 통째로 받을 수 없다.
 * 필요한 9개 컬럼만 남기고 시군구 단위 파일로 쪼갠 뒤, 사전(dictionary) 인코딩해
 * 파일당 수백 KB 수준으로 줄인다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseCsv, sniffDecode } from './lib/csv.mjs'

const COLUMNS = {
  name: ['상호명'],
  l1: ['상권업종대분류명'],
  l2: ['상권업종중분류명'],
  l3: ['상권업종소분류명'],
  sido: ['시도명'],
  sigungu: ['시군구명'],
  dong: ['행정동명'],
  lat: ['위도'],
  lng: ['경도'],
  addr: ['도로명주소', '지번주소'],
}

function resolveColumns(header) {
  const map = {}
  for (const [key, candidates] of Object.entries(COLUMNS)) {
    const idx = candidates
      .map((c) => header.indexOf(c))
      .find((i) => i !== -1)
    if (idx === undefined) {
      if (key === 'addr') continue
      throw new Error(
        `CSV에 '${candidates[0]}' 컬럼이 없습니다. 실제 헤더: ${header.join(', ')}`,
      )
    }
    map[key] = idx
  }
  return map
}

function collectCsvFiles(target) {
  const stat = fs.statSync(target)
  if (stat.isFile()) return [target]
  return fs
    .readdirSync(target)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .map((f) => path.join(target, f))
}

function slugId(n) {
  return String(n).padStart(3, '0')
}

function main() {
  const args = process.argv.slice(2)
  const input = args.find((a) => !a.startsWith('--'))
  const outIdx = args.indexOf('--out')
  const outDir = outIdx !== -1 ? args[outIdx + 1] : 'public/data'

  if (!input) {
    console.error('사용법: node scripts/prepare-data.mjs <csv 파일 또는 폴더> [--out public/data]')
    process.exit(1)
  }

  const files = collectCsvFiles(input)
  if (files.length === 0) {
    console.error(`CSV 파일을 찾지 못했습니다: ${input}`)
    process.exit(1)
  }

  /** @type {Map<string, {sido:string, sigungu:string, rows:any[]}>} */
  const buckets = new Map()
  let read = 0
  let skipped = 0

  for (const file of files) {
    const text = sniffDecode(fs.readFileSync(file))
    const rows = parseCsv(text)
    if (rows.length < 2) continue
    const col = resolveColumns(rows[0])
    console.log(`  · ${path.basename(file)} — ${(rows.length - 1).toLocaleString()}행`)

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      read++
      const sido = (r[col.sido] || '').trim()
      const sigungu = (r[col.sigungu] || '').trim()
      const lat = Number(r[col.lat])
      const lng = Number(r[col.lng])
      if (!sido || !sigungu || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        skipped++
        continue
      }
      const key = `${sido}|${sigungu}`
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { sido, sigungu, rows: [] }
        buckets.set(key, bucket)
      }
      bucket.rows.push({
        name: (r[col.name] || '').trim(),
        l1: (r[col.l1] || '기타').trim(),
        l2: (r[col.l2] || '기타').trim(),
        l3: (r[col.l3] || '기타').trim(),
        dong: (r[col.dong] || '기타').trim(),
        lat: Math.round(lat * 1e6) / 1e6,
        lng: Math.round(lng * 1e6) / 1e6,
        addr: col.addr !== undefined ? (r[col.addr] || '').trim() : '',
      })
    }
  }

  writeDataset(buckets, outDir)
  console.log(
    `\n완료: ${read.toLocaleString()}행 읽음 / ${skipped.toLocaleString()}행 제외(좌표·지역 누락) → ${outDir}`,
  )
}

/**
 * 버킷(시군구별 점포 배열)을 index.json / stores / summary 로 직렬화한다.
 * 샘플 생성 스크립트도 같은 함수를 쓴다.
 */
export function writeDataset(buckets, outDir) {
  fs.rmSync(path.join(outDir, 'stores'), { recursive: true, force: true })
  fs.rmSync(path.join(outDir, 'summary'), { recursive: true, force: true })
  fs.mkdirSync(path.join(outDir, 'stores'), { recursive: true })
  fs.mkdirSync(path.join(outDir, 'summary'), { recursive: true })

  const bySido = new Map()
  for (const bucket of buckets.values()) {
    if (!bySido.has(bucket.sido)) bySido.set(bucket.sido, [])
    bySido.get(bucket.sido).push(bucket)
  }

  const cats = {}
  const national = { total: 0, l1: {}, l2: {}, l3: {} }
  const sidoIndex = []
  let sidoNo = 0

  for (const [sidoName, list] of [...bySido.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], 'ko'),
  )) {
    sidoNo++
    const sidoId = `s${slugId(sidoNo)}`
    const summary = {}
    const sigunguIndex = []
    let sidoTotal = 0
    let sigunguNo = 0

    for (const bucket of list.sort((a, b) => a.sigungu.localeCompare(b.sigungu, 'ko'))) {
      sigunguNo++
      const sigunguId = `${sidoId}-g${slugId(sigunguNo)}`

      // 사전 인코딩: 반복되는 문자열을 인덱스로 치환
      const dict = { dong: [], l1: [], l2: [], l3: [] }
      const lookup = { dong: new Map(), l1: new Map(), l2: new Map(), l3: new Map() }
      const idOf = (kind, value) => {
        let id = lookup[kind].get(value)
        if (id === undefined) {
          id = dict[kind].length
          dict[kind].push(value)
          lookup[kind].set(value, id)
        }
        return id
      }

      const counts = { total: bucket.rows.length, l1: {}, l2: {}, l3: {} }
      const rows = bucket.rows.map((s) => {
        ;(cats[s.l1] ??= {})[s.l2] ??= new Set()
        cats[s.l1][s.l2].add(s.l3)

        const k2 = `${s.l1}|${s.l2}`
        const k3 = `${s.l1}|${s.l2}|${s.l3}`
        counts.l1[s.l1] = (counts.l1[s.l1] || 0) + 1
        counts.l2[k2] = (counts.l2[k2] || 0) + 1
        counts.l3[k3] = (counts.l3[k3] || 0) + 1
        national.l1[s.l1] = (national.l1[s.l1] || 0) + 1
        national.l2[k2] = (national.l2[k2] || 0) + 1
        national.l3[k3] = (national.l3[k3] || 0) + 1

        return [
          s.name,
          idOf('l1', s.l1),
          idOf('l2', s.l2),
          idOf('l3', s.l3),
          idOf('dong', s.dong),
          s.lat,
          s.lng,
          s.addr,
        ]
      })

      fs.writeFileSync(
        path.join(outDir, 'stores', `${sigunguId}.json`),
        JSON.stringify({
          id: sigunguId,
          sido: sidoName,
          sigungu: bucket.sigungu,
          dict,
          // [상호명, 대분류, 중분류, 소분류, 행정동, 위도, 경도, 주소]
          rows,
        }),
      )

      summary[sigunguId] = counts
      sidoTotal += counts.total
      national.total += counts.total
      sigunguIndex.push({
        id: sigunguId,
        name: bucket.sigungu,
        total: counts.total,
        dongs: [...dict.dong].sort((a, b) => a.localeCompare(b, 'ko')),
      })
    }

    fs.writeFileSync(
      path.join(outDir, 'summary', `${sidoId}.json`),
      JSON.stringify({ id: sidoId, name: sidoName, total: sidoTotal, sigungu: summary }),
    )
    sidoIndex.push({ id: sidoId, name: sidoName, total: sidoTotal, sigungu: sigunguIndex })
  }

  fs.writeFileSync(
    path.join(outDir, 'summary', 'national.json'),
    JSON.stringify(national),
  )

  const catsPlain = {}
  for (const [l1, l2s] of Object.entries(cats)) {
    catsPlain[l1] = {}
    for (const [l2, l3s] of Object.entries(l2s)) {
      catsPlain[l1][l2] = [...l3s].sort((a, b) => a.localeCompare(b, 'ko'))
    }
  }

  fs.writeFileSync(
    path.join(outDir, 'index.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      total: national.total,
      cats: catsPlain,
      sido: sidoIndex,
    }),
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
