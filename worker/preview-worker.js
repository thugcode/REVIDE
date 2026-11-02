/**
 * Revide 미리보기 서버 (Cloudflare Worker)
 *
 * 하는 일: 링크를 받아서 그 게시물의 제목·설명(캡션)·해시태그·썸네일을 JSON으로 돌려줍니다.
 * 브라우저는 인스타·유튜브 페이지를 직접 읽을 수 없어서(보안 정책), 이 서버가 대신 읽어 줍니다.
 *
 * 사용: GET https://<워커 주소>/?url=<게시물 링크>
 * 설정(선택): Cloudflare 대시보드 → 이 Worker → Settings → Variables 에
 *   ALLOWED_ORIGINS = https://내아이디.github.io
 *   를 넣으면 내 사이트에서만 쓸 수 있어요. (여러 개는 쉼표로 구분)
 */

const UA_BOT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const UA_BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CACHE_SECONDS = 60 * 60 * 24 * 7; // 같은 링크는 7일 동안 다시 읽지 않음
const MAX_HTML = 600_000; // 무료 플랜의 CPU 한도(요청당 10ms)를 넘지 않게 앞부분만 읽어요

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ ok: false, error: "GET만 받아요" }, 405, cors);
    if (cors === null) return json({ ok: false, error: "허용되지 않은 사이트예요" }, 403, {});

    const target = new URL(request.url).searchParams.get("url") || "";
    const url = safeUrl(target);
    if (!url) return json({ ok: false, error: "올바른 링크가 아니에요" }, 400, cors);

    // 캐시 확인
    const cache = caches.default;
    const cacheKey = new Request("https://revide-preview.cache/?u=" + encodeURIComponent(url.href));
    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = await hit.text();
      return new Response(body, { headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "X-Cache": "HIT" } });
    }

    let data;
    try {
      data = await preview(url);
    } catch (e) {
      data = { ok: false, error: "읽지 못했어요" };
    }
    data.url = url.href;
    data.hashtags = hashtags([data.title, data.description].join(" "));
    data.ok = Boolean(data.title || data.description);

    const body = JSON.stringify(data);
    if (data.ok) {
      ctx.waitUntil(cache.put(cacheKey, new Response(body, {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` }
      })));
    }
    return new Response(body, { headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "X-Cache": "MISS" } });
  }
};

/* ---------------- 사이트별 읽기 ---------------- */

async function preview(url) {
  const host = url.hostname.replace(/^(www|m)\./, "");

  if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) {
    const o = await getJson("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(url.href));
    if (o && o.title) {
      return { site: url.pathname.startsWith("/shorts") ? "유튜브 쇼츠" : "유튜브", title: o.title, description: "", author: o.author_name || "", image: o.thumbnail_url || "" };
    }
    return fromHtml(url, "유튜브");
  }

  if (host.endsWith("tiktok.com")) {
    const o = await getJson("https://www.tiktok.com/oembed?url=" + encodeURIComponent(url.href));
    if (o && (o.title || o.author_name)) {
      return { site: "틱톡", title: o.title || "", description: "", author: o.author_name || "", image: o.thumbnail_url || "" };
    }
    return fromHtml(url, "틱톡");
  }

  if (host.endsWith("instagram.com")) {
    return instagram(url);
  }

  if (host.endsWith("threads.net") || host.endsWith("threads.com")) return fromHtml(url, "스레드");
  if (host.includes("naver")) return fromHtml(url, "네이버");
  return fromHtml(url, host);
}

async function instagram(url) {
  const m = url.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  const kind = m ? m[1] : "";
  const site = kind.startsWith("reel") ? "인스타 릴스" : kind === "p" ? "인스타 게시물" : "인스타그램";

  // 1) 일반 페이지의 미리보기 태그 (링크 공유용 정보)
  const page = await fromHtml(url, site, UA_BOT);
  let best = cleanInstagram(page);

  // 2) 캡션이 비어 있으면 공개 임베드 페이지에서 캡션을 읽기
  if (m && !best.description) {
    const embedUrl = `https://www.instagram.com/${kind === "p" ? "p" : "reel"}/${m[2]}/embed/captioned/`;
    const html = await getText(embedUrl, UA_BROWSER);
    if (html) {
      const caption = embedCaption(html);
      const user = (html.match(/class="CaptionUsername"[^>]*>([^<]+)</) || [])[1] || "";
      const img = (html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/) || [])[1] || "";
      if (caption) best.description = caption;
      if (!best.author && user) best.author = decode(user).trim();
      if (!best.image && img) best.image = decode(img);
    }
  }
  return best;
}

// 인스타 미리보기 문장 정리: '좋아요 12개, 댓글 3개 - 아이디님, 날짜: "캡션"' → 캡션만
function cleanInstagram(d) {
  const out = { ...d };
  const generic = /^(Instagram|Login • Instagram|로그인 • Instagram)$/i;
  if (generic.test((out.title || "").trim())) out.title = "";
  let desc = out.description || "";
  const q = desc.match(/[:：]\s*["“](.+)["”]\s*\.?\s*$/s);
  if (q) desc = q[1];
  if (/^(Create an account or log in|계정을 만들거나 로그인)/i.test(desc)) desc = "";
  out.description = desc.trim();
  // 제목에서 작성자 추출: "아이디 on Instagram: ..." / "Instagram의 아이디님: ..."
  const t = out.title || "";
  const a = t.match(/^(.+?) on Instagram/i) || t.match(/Instagram의 (.+?)님/);
  if (a && !out.author) out.author = a[1].trim();
  if (a) {
    const inner = t.match(/[:：]\s*["“](.+?)["”]\s*$/s);
    out.title = inner ? inner[1].trim() : "";
  }
  if (out.title && out.description && out.title.includes(out.description.slice(0, 20))) out.title = "";
  return out;
}

function embedCaption(html) {
  const i = html.indexOf('class="Caption"');
  if (i < 0) return "";
  let chunk = html.slice(i, i + 8000);
  const end = chunk.search(/class="CaptionComments"|class="SocialProof"|<\/blockquote>/);
  if (end > 0) chunk = chunk.slice(0, end).replace(/<[^>]*$/, "");
  chunk = chunk.replace(/<a[^>]*class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/, " ");
  chunk = chunk.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
  chunk = chunk.replace(/^[^>]*>/, "");
  return decode(chunk).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, 1200);
}

/* ---------------- 일반 페이지: og 태그 읽기 ---------------- */

async function fromHtml(url, site, ua = UA_BOT) {
  const html = await getText(url.href, ua, true);
  if (!html) return { site, title: "", description: "", author: "", image: "" };
  const meta = {};
  const re = /<meta\s+[^>]*>/gi;
  let tag;
  while ((tag = re.exec(html))) {
    const t = tag[0];
    const key = (attr(t, "property") || attr(t, "name") || attr(t, "itemprop") || "").toLowerCase();
    const content = attr(t, "content");
    if (key && content && !(key in meta)) meta[key] = decode(content);
  }
  const titleTag = decode(((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").trim());
  return {
    site,
    title: (meta["og:title"] || meta["twitter:title"] || titleTag || "").slice(0, 300),
    description: (meta["og:description"] || meta["twitter:description"] || meta["description"] || "").slice(0, 1200),
    author: meta["author"] || meta["article:author"] || "",
    image: meta["og:image"] || meta["twitter:image"] || ""
  };
}

function attr(tag, name) {
  const m = tag.match(new RegExp(name + `\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3] ?? "") : "";
}

/* ---------------- 도우미 ---------------- */

async function getText(href, ua, stopAtHead = false) {
  try {
    const r = await fetch(href, {
      headers: { "User-Agent": ua, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      cf: { cacheTtl: 3600 }
    });
    if (!r.ok) return "";
    const type = r.headers.get("Content-Type") || "";
    if (!type.includes("html")) { r.body && r.body.cancel(); return ""; }
    // 필요한 부분(<head>의 미리보기 태그)까지만 읽고 멈추기
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let text = "";
    while (text.length < MAX_HTML) {
      const { value, done } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
      if (stopAtHead && /<\/head>/i.test(text.slice(-4096 - value.length))) break;
    }
    reader.cancel().catch(() => {});
    return text;
  } catch (e) {
    return "";
  }
}

async function getJson(href) {
  try {
    const r = await fetch(href, { headers: { "User-Agent": UA_BROWSER }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

function safeUrl(s) {
  if (!s || s.length > 2000) return null;
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = u.hostname.toLowerCase();
  // 내부망 주소는 읽지 않음
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return null;
  u.hash = "";
  // 인스타·유튜브 추적용 꼬리표 제거 (같은 게시물을 같은 링크로)
  for (const k of [...u.searchParams.keys()]) {
    if (/^(igsh|igshid|utm_.*|si|fbclid|feature)$/i.test(k)) u.searchParams.delete(k);
  }
  return u;
}

function hashtags(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/#([\p{L}\p{N}_]{1,40})/gu)) {
    const t = m[1];
    if (!/^\d+$/.test(t) && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 30);
}

function decode(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => safeChar(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
function safeChar(n) {
  try { return String.fromCodePoint(n); } catch (e) { return ""; }
}

function corsHeaders(origin, env) {
  const list = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const base = { "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
  if (!list.length) return { ...base, "Access-Control-Allow-Origin": "*" };
  if (!origin) return { ...base }; // 브라우저가 아닌 요청(테스트용)
  if (list.includes(origin)) return { ...base, "Access-Control-Allow-Origin": origin };
  return null;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}
