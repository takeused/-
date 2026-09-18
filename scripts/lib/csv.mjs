/** 의존성 없는 최소 CSV 파서 + 인코딩 감지. 공공데이터 CSV는 UTF-8 또는 CP949(EUC-KR)로 배포된다. */

export function sniffDecode(buffer) {
  // BOM이 있으면 확실히 UTF-8
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.subarray(3))
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  // U+FFFD(치환 문자)가 섞여 있으면 UTF-8이 아니다 -> EUC-KR로 재시도
  if (!utf8.includes('\uFFFD')) return utf8
  try {
    return new TextDecoder('euc-kr').decode(buffer)
  } catch {
    return utf8
  }
}

/** RFC4180 기준(따옴표·escaped quote·줄바꿈 포함 필드 지원). 반환값은 문자열 2차원 배열. */
export function parseCsv(text, delimiter = ',') {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += ch
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
