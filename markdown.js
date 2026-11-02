// markdown.js — 노트용 작은 마크다운 렌더러
// 모든 글자를 먼저 이스케이프한 뒤 정해진 모양만 HTML로 바꾸기 때문에, 노트에 <script> 같은 글을 적어도 안전해요.
// 지원: # 제목, - 목록, 1. 목록, - [ ] 체크리스트, > 인용, ``` 코드, ---, **굵게**, *기울임*, ~~취소~~, ==강조==, `코드`,
//       [글](https://링크), 맨 링크, [[노트 제목]] / [[노트 제목|보일 글]]

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function inline(raw, hasNote) {
  const slots = [];
  const keep = html => { slots.push(html); return "\u0001" + (slots.length - 1) + "\u0001"; };
  let t = String(raw);
  t = t.replace(/`([^`]+)`/g, (m, c) => keep(`<code>${esc(c)}</code>`));
  t = t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, title, alias) => {
    const ti = title.trim();
    const has = hasNote(ti);
    return keep(`<a href="#" class="wikilink${has ? "" : " missing"}" data-note="${esc(ti)}" title="${has ? "노트 열기" : "아직 없는 노트 · 누르면 만들어요"}">${esc((alias || ti).trim())}</a>`);
  });
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, txt, u) => keep(`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(txt)}</a>`));
  t = t.replace(/https?:\/\/[^\s<>"'\u0001]+/g, u => keep(`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`));
  let h = esc(t);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  h = h.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  h = h.replace(/==([^=]+)==/g, "<mark>$1</mark>");
  return h.replace(/\u0001(\d+)\u0001/g, (m, i) => slots[+i]);
}

export function mdToHtml(src, hasNote = () => false) {
  const lines = String(src || "").replace(/\r/g, "").split("\n");
  let html = "", list = null, para = [], inCode = false, code = [];
  const il = s => inline(s, hasNote);
  const flush = () => { if (para.length) { html += `<p>${para.map(il).join("<br>")}</p>`; para = []; } };
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  const open = (tag, cls) => { if (list !== tag) { close(); html += cls ? `<${tag} class="${cls}">` : `<${tag}>`; list = tag; } };
  lines.forEach((ln, i) => {
    let m;
    if (inCode) { if (/^\s*```/.test(ln)) { html += `<pre><code>${esc(code.join("\n"))}</code></pre>`; inCode = false; code = []; } else code.push(ln); return; }
    if (/^\s*```/.test(ln)) { flush(); close(); inCode = true; return; }
    if (!ln.trim()) { flush(); close(); return; }
    if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) { flush(); close(); const l = Math.min(m[1].length + 1, 4); html += `<h${l}>${il(m[2])}</h${l}>`; return; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(ln)) { flush(); close(); html += "<hr>"; return; }
    if ((m = ln.match(/^\s*>\s?(.*)$/))) { flush(); close(); html += `<blockquote>${il(m[1])}</blockquote>`; return; }
    if ((m = ln.match(/^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/))) {
      flush(); if (!m[2].trim()) return; open("ul", "tasks"); const on = m[1] !== " ";
      html += `<li class="task${on ? " done" : ""}"><label><input type="checkbox" data-line="${i}"${on ? " checked" : ""}><span>${il(m[2])}</span></label></li>`; return;
    }
    if ((m = ln.match(/^\s*[-*+]\s+(.*)$/))) { flush(); if (!m[1].trim()) return; open("ul"); html += `<li>${il(m[1])}</li>`; return; }
    if ((m = ln.match(/^\s*\d+[.)]\s+(.*)$/))) { flush(); open("ol"); html += `<li>${il(m[1])}</li>`; return; }
    close(); para.push(ln);
  });
  if (inCode) html += `<pre><code>${esc(code.join("\n"))}</code></pre>`;
  flush(); close();
  return html;
}

export function plainExcerpt(body) {
  for (const ln of String(body || "").split("\n")) {
    const t = ln.replace(/^\s*([#>]+|[-*+]\s+(\[[ xX]\])?|\d+[.)])\s*/, "")
      .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (m, a, b, c) => c || a).replace(/[*_~=`]/g, "").trim();
    if (t && !/^#/.test(ln.trim())) return t;
  }
  return "";
}

export function linksIn(body) {
  const out = new Set();
  String(body || "").replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, (m, t) => { out.add(t.trim().toLowerCase()); return m; });
  return out;
}
