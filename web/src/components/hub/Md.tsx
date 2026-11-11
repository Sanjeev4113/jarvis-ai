import { Fragment, type ReactNode } from "react";

/** A small, safe Markdown renderer for JARVIS replies (no innerHTML): headings, lists, code, bold, italics, links. */

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{m[2].slice(2, -2)}</strong>);
    else if (m[3]) out.push(<em key={k}>{m[3].slice(1, -1)}</em>);
    else if (m[4])
      out.push(
        <a key={k} href={m[5]} target="_blank" rel="noreferrer">
          {m[4].slice(1, m[4].indexOf("]"))}
        </a>,
      );
    else if (m[6])
      out.push(
        <a key={k} href={m[6]} target="_blank" rel="noreferrer">
          {m[6].replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}
        </a>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Md({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("```")) {
      const lang = l.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={k++} data-lang={lang || undefined} data-lenis-prevent>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (/^\s*[-*•]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ""));
      blocks.push(
        <ul key={k++}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, j)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(
        <ol key={k++}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, j)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      blocks.push(<p key={k++} className="md-h">{inline(h[2])}</p>);
      i++;
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(```|\s*[-*•]\s+|\s*\d+[.)]\s+|#{1,4}\s)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={k++}>
        {para.map((t, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(t, j)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <>{blocks}</>;
}
