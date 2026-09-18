/** LLM 응답용 최소 마크다운 렌더러 (제목/불릿/번호/표/굵게/코드) */

function inline(text, keyPrefix) {
  const parts = []
  // <br> 은 모델이 표 안에서 자주 쓰는데 그대로 두면 태그 문자열이 보인다
  const source = String(text ?? '').replace(/<br\s*\/?>/gi, '\n')
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\n)/g
  let last = 0
  let match
  let i = 0

  while ((match = regex.exec(source)) !== null) {
    if (match.index > last) parts.push(source.slice(last, match.index))
    const token = match[0]
    if (token === '\n') {
      parts.push(<br key={`${keyPrefix}-br${i++}`} />)
    } else if (token.startsWith('**')) {
      parts.push(
        <strong key={`${keyPrefix}-b${i++}`} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>,
      )
    } else {
      parts.push(
        <code key={`${keyPrefix}-c${i++}`} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      )
    }
    last = match.index + token.length
  }
  if (last < source.length) parts.push(source.slice(last))
  return parts
}

const splitRow = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line)
const isDivider = (line) => /^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/.test(line) && line.includes('-')

function Table({ rows, keyPrefix }) {
  const [header, ...body] = rows
  return (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50">
            {header.map((cell, i) => (
              <th
                key={i}
                className="border border-slate-200 px-2.5 py-1.5 text-left font-semibold text-slate-700"
              >
                {inline(cell, `${keyPrefix}-h${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              {header.map((_, c) => (
                <td key={c} className="border border-slate-200 px-2.5 py-1.5 align-top text-slate-700">
                  {inline(row[c] ?? '', `${keyPrefix}-r${r}c${c}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Markdown({ text }) {
  const blocks = []
  let list = null
  let table = null

  const flushList = () => {
    if (!list) return
    blocks.push(
      <ul key={`l${blocks.length}`} className="my-2 list-disc space-y-1 pl-5 text-slate-700">
        {list.map((item, i) => (
          <li key={i}>{inline(item, `li${blocks.length}-${i}`)}</li>
        ))}
      </ul>,
    )
    list = null
  }

  const flushTable = () => {
    if (!table) return
    if (table.length > 1) blocks.push(<Table key={`t${blocks.length}`} rows={table} keyPrefix={`t${blocks.length}`} />)
    table = null
  }

  const flush = () => {
    flushList()
    flushTable()
  }

  for (const raw of (text || '').split('\n')) {
    const line = raw.trimEnd()

    // 표: 헤더 구분선(|---|---|)은 버리고 나머지 행만 모은다
    if (isTableRow(line)) {
      flushList()
      if (!isDivider(line)) {
        table = table ?? []
        table.push(splitRow(line))
      }
      continue
    }
    flushTable()

    const bullet = line.match(/^\s*([-*•]|\d+\.)\s+(.*)$/)
    const heading = line.match(/^(#{1,4})\s+(.*)$/)

    if (bullet) {
      list = list ?? []
      list.push(bullet[2])
      continue
    }
    flushList()

    if (!line.trim()) continue
    if (/^\s*-{3,}\s*$/.test(line)) {
      blocks.push(<hr key={blocks.length} className="my-3 border-slate-200" />)
    } else if (heading) {
      const level = heading[1].length
      blocks.push(
        <p
          key={blocks.length}
          className={
            level <= 2
              ? 'mt-4 mb-1 text-base font-bold text-slate-900'
              : 'mt-3 mb-1 text-sm font-semibold text-slate-900'
          }
        >
          {inline(heading[2], `h${blocks.length}`)}
        </p>,
      )
    } else {
      blocks.push(
        <p key={blocks.length} className="my-1.5 leading-relaxed text-slate-700">
          {inline(line, `p${blocks.length}`)}
        </p>,
      )
    }
  }
  flush()

  return <div className="text-[15px]">{blocks}</div>
}
