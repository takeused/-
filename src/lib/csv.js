/** 브라우저에서 바로 CSV 파일 저장 (엑셀 한글 깨짐 방지용 BOM 포함) */

function escapeCell(value) {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(filename, header, rows) {
  const body = [header, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function downloadStoresCsv(stores, filename) {
  downloadCsv(
    filename,
    ['상호명', '대분류', '중분류', '소분류', '시도', '시군구', '행정동', '주소', '위도', '경도'],
    stores.map((s) => [
      s.name, s.l1, s.l2, s.l3, s.sido ?? '', s.sigungu ?? '', s.dong, s.addr, s.lat, s.lng,
    ]),
  )
}
