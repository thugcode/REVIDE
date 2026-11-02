// app.js — Revide 화면과 동작
import { createStore } from "./store.js";
import { DEFAULT_CATEGORIES, DEFAULTS_VERSION, NEW_IN_VERSION, INBOX, classify, learnFrom, renameInProfile, hashtagsOf } from "./classify.js";
import { mdToHtml, plainExcerpt, linksIn } from "./markdown.js";

const CFG = window.REVIDE_CONFIG || {};
const PREVIEW = String(CFG.previewUrl || "").replace(/\/+$/, "");
const $ = s => document.querySelector(s);
const TEMPLATE = "## 한 줄 요약\n\n\n## 핵심 내용\n- \n\n## 해 볼 것\n- [ ] \n";

/* ================= 도우미 ================= */
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
function ago(ms) { const d = Math.floor((startOfDay(Date.now()) - startOfDay(ms || Date.now())) / 864e5); return d <= 0 ? "오늘" : d === 1 ? "어제" : d < 30 ? d + "일 전" : d < 365 ? Math.floor(d / 30) + "달 전" : Math.floor(d / 365) + "년 전"; }
function extractUrl(t) { const m = String(t || "").match(/https?:\/\/[^\s<>"']+/i); return m ? m[0].replace(/[).,!?]+$/, "") : ""; }
function cleanUrl(u) {
  try {
    const x = new URL(u);
    if (x.hostname.includes("instagram.com")) x.search = ""; // 인스타 링크 뒤의 추적용 꼬리표(igsh, srtk, exln…)는 모두 떼기
    for (const k of [...x.searchParams.keys()]) if (/^(igsh|igshid|utm_.*|si|fbclid|feature)$/i.test(k)) x.searchParams.delete(k);
    x.hash = "";
    return x.href;
  } catch (e) { return u; }
}
function normUrl(u) {
  try { const x = new URL(cleanUrl(u)); const h = x.hostname.replace(/^(www|m)\./, ""); return h + x.pathname.replace(/\/+$/, "") + (h.includes("youtube") ? x.search : ""); }
  catch (e) { return u; }
}
function sourceOf(u) {
  try {
    const x = new URL(u); const h = x.hostname.replace(/^(www|m)\./, ""); const p = x.pathname;
    if (h.includes("instagram.com")) return p.includes("/reel") ? "인스타 릴스" : p.includes("/p/") ? "인스타 게시물" : "인스타그램";
    if (h === "youtu.be" || h.includes("youtube.com")) return p.startsWith("/shorts") ? "유튜브 쇼츠" : "유튜브";
    if (h.includes("tiktok.com")) return "틱톡";
    if (h.includes("threads.")) return "스레드";
    if (h.includes("naver")) return "네이버";
    return h;
  } catch (e) { return "링크"; }
}
const shortSrc = s => ({ "인스타 릴스": "릴스", "인스타 게시물": "인스타", "인스타그램": "인스타", "유튜브 쇼츠": "쇼츠", "유튜브": "유튜브", "틱톡": "틱톡", "스레드": "스레드" }[s] || "링크");
function firstLine(s) { return String(s || "").replace(/#[\p{L}\p{N}_]+/gu, "").split("\n").map(x => x.trim()).find(Boolean) || ""; }
function titleOf(it) {
  const p = it.preview || {};
  const t = it.memo || firstLine(p.title) || firstLine(p.description);
  if (t) return t.length > 90 ? t.slice(0, 88) + "…" : t;
  if (it.status === "reading") return "미리보기 읽는 중…";
  return `${it.source} 영상`;
}
function toast(t) { const e = $("#toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { e.hidden = true; }, 3200); }
function copyText(text, input) {
  try { navigator.clipboard.writeText(text).then(() => toast("복사했어요"), () => { input && input.select(); toast("길게 눌러 복사해 주세요"); }); }
  catch (e) { input && input.select(); }
}
function download(filename, blob) {
  const a = el("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const ymd = ms => { try { return new Date(ms || Date.now()).toLocaleDateString("sv-SE"); } catch (e) { return ""; } };

/* ================= 상태 ================= */
const state = {
  items: new Map(), notes: new Map(), categories: [...DEFAULT_CATEGORIES], profile: {},
  ready: false, auth: { available: false, user: null, checking: false },
  view: "lib", noteId: null, cat: "__all", filter: "unseen", q: "",
  openMemo: null, skipped: new Set(), shareId: null, detailId: null, descOpen: false, triageTotal: 0,
  noteEditing: false, nextEdit: false, focusTitle: false, noteQ: "", noteTag: null, proposals: [],
  pickerOpen: false, pickerQ: "", pickSel: new Set()
};
const noteDirty = new Set(), noteWrites = new Map();
let dedupePending = false;
const reading = new Set();

let store = null;
let pendingShare = "";
let migratedDefaults = false;

function inboxItems() { return [...state.items.values()].filter(i => (i.category || INBOX) === INBOX).sort((a, b) => b.createdAt - a.createdAt); }

/* ================= 담기 ================= */
async function addLink(raw, { fromShare = false } = {}) {
  const found = extractUrl(raw);
  if (!found) { toast("링크를 찾지 못했어요"); return null; }
  const url = cleanUrl(found);
  const key = normUrl(url);
  const dup = [...state.items.values()].find(i => normUrl(i.url) === key);
  if (dup) {
    if (fromShare) state.shareId = dup.id;
    toast(`이미 담겨 있어요 · ${dup.category === INBOX ? "받은 함" : dup.category}`);
    render(); return null;
  }
  const it = { id: uid(), url, memo: "", source: sourceOf(url), createdAt: Date.now(), seen: false, category: INBOX, catBy: "none", preview: null, status: PREVIEW ? "reading" : "none" };
  try { await store.putItem(it); } catch (e) { toast("담지 못했어요. 잠시 후 다시 시도해 주세요."); return null; }
  if (fromShare) state.shareId = it.id;
  render();
  if (PREVIEW) readPreview(it.id);
  return it;
}

async function fetchPreview(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(PREVIEW + "/?url=" + encodeURIComponent(url), { signal: ctl.signal });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || !d.ok) return null;
    return { site: d.site || "", title: d.title || "", description: d.description || "", author: d.author || "", image: d.image || "", hashtags: d.hashtags || [] };
  } catch (e) { return null; } finally { clearTimeout(t); }
}

async function readPreview(id) {
  if (reading.has(id) || !PREVIEW) return;
  reading.add(id);
  try {
    const it0 = state.items.get(id); if (!it0) return;
    if (it0.status !== "reading") await store.patchItem(id, { status: "reading" });
    const preview = await fetchPreview(it0.url);
    const cur = state.items.get(id); if (!cur) return;
    const patch = { preview: preview || cur.preview || null, status: preview ? "ok" : "fail", readAt: Date.now() };
    const merged = { ...cur, ...patch };
    if (cur.catBy !== "user") {
      const r = classify(merged, state.profile, state.categories);
      if (r.category) { patch.category = r.category; patch.catBy = "auto"; }
    }
    await store.patchItem(id, patch);
  } catch (e) { /* 다음에 다시 */ } finally { reading.delete(id); render(); }
}
let resumed = false;
function resumeReading() {
  if (resumed || !PREVIEW) return;
  if (!store) { setTimeout(resumeReading, 0); return; }
  resumed = true;
  const stuck = [...state.items.values()].filter(i => i.status === "reading" && Date.now() - (i.createdAt || 0) > 20000).slice(0, 6);
  stuck.forEach(i => readPreview(i.id));
}

function setCategory(it, cat, { teach = true } = {}) {
  if (!it || it.category === cat) return;
  store.patchItem(it.id, { category: cat, catBy: cat === INBOX ? "none" : "user" }).catch(() => toast("바꾸지 못했어요"));
  if (!teach || cat === INBOX) return;
  const profile = learnFrom(state.profile, it, cat);
  state.profile = profile;
  store.setMeta({ profile }).catch(() => {});
  // 방금 배운 것으로 받은 함의 비슷한 영상도 같이 정리
  let moved = 0;
  for (const o of inboxItems()) {
    if (o.id === it.id || !o.preview) continue;
    const r = classify(o, profile, state.categories);
    if (r.category === cat) { store.patchItem(o.id, { category: cat, catBy: "auto" }); moved++; }
  }
  if (moved) toast(`비슷한 영상 ${moved}개도 ‘${cat}’(으)로 옮겼어요`);
}

function dedupe() {
  const seen = new Map();
  for (const it of [...state.items.values()].sort((a, b) => a.createdAt - b.createdAt)) {
    const k = normUrl(it.url);
    if (seen.has(k)) store.delItem(it.id).catch(() => {}); else seen.set(k, it);
  }
}

/* ================= 화면 전환 ================= */
function goto(h) { if (location.hash === "#" + h) applyHash(); else location.hash = h; }
function applyHash(initial) {
  const h = location.hash.replace(/^#/, ""); let m;
  const prevNote = state.noteId;
  if (h === "inbox") { state.view = "inbox"; state.noteId = null; }
  else if (h === "notes") { state.view = "notes"; state.noteId = null; }
  else if (h === "settings") { state.view = "settings"; state.noteId = null; }
  else if ((m = h.match(/^note-([a-z0-9]+)$/))) { state.view = "note"; state.noteId = m[1]; }
  else { state.view = "lib"; state.noteId = null; }
  if (state.noteId !== prevNote) { state.pickerOpen = false; state.pickSel = new Set(); state.pickerQ = ""; state.noteEditing = !!state.nextEdit; state.nextEdit = false; }
  if (initial !== true) window.scrollTo(0, 0);
  render();
}
window.addEventListener("hashchange", applyHash);

/* ================= 그리기 ================= */
let pointerDown = false, renderStale = false;
document.addEventListener("pointerdown", () => { pointerDown = true; }, true);
document.addEventListener("pointerup", () => { pointerDown = false; if (renderStale) { renderStale = false; setTimeout(render, 0); } }, true);
document.addEventListener("pointercancel", () => { pointerDown = false; }, true);

let notesByItem = new Map();
function render() {
  // 누르고 있는 버튼이 다시 그려지며 사라지지 않게, 손을 뗀 뒤에 그려요
  if (pointerDown) { renderStale = true; return; }
  notesByItem = new Map();
  for (const n of state.notes.values()) for (const iid of n.itemIds || []) { if (!notesByItem.has(iid)) notesByItem.set(iid, []); notesByItem.get(iid).push(n); }
  const v = state.view;
  const navView = v === "note" ? "notes" : v;
  document.querySelectorAll(".tabbar a").forEach(a => { if (a.dataset.view === navView) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  for (const [id, name] of [["v-lib", "lib"], ["v-inbox", "inbox"], ["v-notes", "notes"], ["v-note", "note"], ["v-settings", "settings"]]) $("#" + id).hidden = v !== name;
  const n = inboxItems().length;
  $("#inboxBadge").hidden = !n; $("#inboxBadge").textContent = n > 99 ? "99+" : String(n);
  if (v === "lib") renderLib();
  if (v === "inbox") renderInbox();
  if (v === "notes") renderNoteList();
  if (v === "note") renderNoteDetail();
  if (v === "settings") renderSettings();
  renderItemSheet();
  renderShareSheet();
}

/* ---------- 보관함 ---------- */
const urlIn = $("#urlIn"), addBtn = $("#addBtn");
urlIn.addEventListener("input", () => { addBtn.disabled = !extractUrl(urlIn.value); });
urlIn.addEventListener("paste", () => setTimeout(async () => {
  if (!extractUrl(urlIn.value)) return;
  const v = urlIn.value; urlIn.value = ""; addBtn.disabled = true;
  const it = await addLink(v); if (it) toast(PREVIEW ? "담았어요. 내용을 읽고 분류하는 중이에요" : "담았어요");
}, 0));
$("#addForm").addEventListener("submit", async e => {
  e.preventDefault(); const v = urlIn.value; urlIn.value = ""; addBtn.disabled = true;
  const it = await addLink(v); if (it) toast(PREVIEW ? "담았어요. 내용을 읽고 분류하는 중이에요" : "담았어요");
});
$("#q").addEventListener("input", e => { state.q = e.target.value; render(); });
$("#seenSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  state.filter = b.dataset.f;
  document.querySelectorAll("#seenSeg button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  render();
});
const matchF = i => state.filter === "all" || (state.filter === "seen") === !!i.seen;

function renderLib() {
  const items = [...state.items.values()];
  const unseen = items.filter(i => !i.seen).length;
  $("#libLede").textContent = items.length ? `안 본 영상 ${unseen}개 · 전체 ${items.length}개` : "링크를 붙여넣으면 알아서 분류해 둘게요.";
  // 안내 띠
  const banners = $("#libBanners"); banners.replaceChildren();
  const inbox = inboxItems().length;
  if (inbox) {
    banners.append(el("div", { class: "band dark" },
      el("div", {}, el("h2", { text: `받은 함에 ${inbox}개가 있어요` }), el("p", { text: "자동으로 분류하지 못한 영상이에요. 한 번씩 누르면 금방 정리돼요." })),
      el("a", { class: "btn", href: "#inbox" }, "정리하기")));
  }
  const a = state.auth;
  if (a.available && !a.user && !a.checking) {
    banners.append(el("div", { class: "band light" },
      el("div", {}, el("h2", { text: "폰·노트북에서 같은 보관함을" }), el("p", { text: "지금은 이 기기에만 저장돼요. 로그인하면 담아 둔 것도 계정으로 옮겨져요." })),
      el("button", { class: "btn line", type: "button", onclick: doSignIn }, "구글로 로그인")));
  }
  // 분류 칩
  const tabs = $("#catTabs"); tabs.replaceChildren();
  const counts = {}; for (const i of items) if (matchF(i)) counts[i.category || INBOX] = (counts[i.category || INBOX] || 0) + 1;
  const total = Object.values(counts).reduce((s, x) => s + x, 0);
  const mk = (key, label, n) => el("button", { type: "button", role: "tab", class: "chip", "aria-pressed": String(state.cat === key), onclick: () => { state.cat = key; render(); } }, label, el("span", { class: "n", text: String(n) }));
  tabs.append(mk("__all", "전체", total));
  const used = new Set(items.map(i => i.category || INBOX));
  for (const c of state.categories) if (used.has(c)) tabs.append(mk(c, c, counts[c] || 0));
  for (const c of used) if (c !== INBOX && !state.categories.includes(c)) tabs.append(mk(c, c, counts[c] || 0));
  if (used.has(INBOX)) tabs.append(mk(INBOX, "받은 함", counts[INBOX] || 0));
  if (state.cat !== "__all" && !used.has(state.cat)) state.cat = "__all";
  // 카드 격자
  const q = state.q.trim().toLowerCase();
  const rows = items.filter(i => (state.cat === "__all" || (i.category || INBOX) === state.cat) && matchF(i) &&
    (!q || [i.memo, i.url, i.category, i.preview && i.preview.title, i.preview && i.preview.description, i.preview && i.preview.author].some(x => String(x || "").toLowerCase().includes(q))))
    .sort((x, y) => state.filter === "seen" ? (y.seenAt || 0) - (x.seenAt || 0) : y.createdAt - x.createdAt);
  const list = $("#list"); list.replaceChildren();
  if (!state.ready && !items.length) { list.append(el("div", { class: "empty" }, el("b", { text: "불러오는 중이에요" }))); return; }
  if (!rows.length) {
    list.append(el("div", { class: "empty" },
      el("b", { text: !items.length ? "아직 담은 영상이 없어요" : state.filter === "unseen" ? "다 봤어요" : "찾는 영상이 없어요" }),
      el("span", { text: !items.length ? "인스타에서 ‘링크 복사’ 후 위 칸에 붙여넣어 보세요. 공유 버튼으로 바로 담는 방법도 있어요." : state.filter === "unseen" ? "안 본 영상이 없어요. ‘본 것’이나 ‘전체’에서 다시 꺼내 볼 수 있어요." : "다른 분류나 낱말로 찾아보세요." }),
      !items.length ? el("a", { class: "btn line", href: "#settings" }, "공유로 담기 설정") : null));
    return;
  }
  for (const it of rows) list.append(itemCard(it));
}

const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M10 8.8v6.4l5.2-3.2z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};
function svg(name) { const s = el("span", { style: "display:inline-flex" }); s.innerHTML = ICON[name]; return s.firstChild; }

/** 썸네일 상자 (사진이 없거나 만료되면 출처 표시로 대신) */
function vthumb(it, { overlays = true } = {}) {
  const box = el("div", { class: "vthumb" });
  const ph = () => { const d = el("div", { class: "ph" }, svg("play"), el("span", { text: it.source })); return d; };
  const img = it.preview && it.preview.image;
  if (img) {
    const i = el("img", { src: img, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
    i.addEventListener("error", () => i.replaceWith(ph()), { once: true });
    box.append(i);
  } else box.append(ph());
  if (overlays) {
    if (it.status === "reading") box.append(el("span", { class: "ov tl reading", text: "읽는 중" }));
    else box.append(el("span", { class: "ov tl", text: shortSrc(it.source) }));
    if (it.seen) { const s = el("span", { class: "ov tr seen", "aria-label": "봤음" }); s.append(svg("check")); box.append(s); }
  }
  return box;
}

function itemCard(it) {
  const p = it.preview || {};
  const cat = it.category || INBOX;
  return el("button", { type: "button", class: "vcard" + (it.seen ? " seen" : ""), "aria-label": titleOf(it), onclick: () => { state.detailId = it.id; state.descOpen = false; render(); } },
    vthumb(it),
    el("div", { class: "vtitle", text: titleOf(it) }),
    el("div", { class: "vmeta" },
      el("span", { class: "cat", text: cat === INBOX ? "받은 함" : cat }),
      el("span", { text: "·" }),
      el("span", { text: p.author ? "@" + p.author : ago(it.createdAt) })));
}

function placeLinks(it) {
  if (!["맛집·카페", "여행"].includes(it.category)) return null;
  const tags = (it.preview && it.preview.hashtags && it.preview.hashtags.length ? it.preview.hashtags : hashtagsOf(it.preview && it.preview.description))
    .filter(t => !/^(카페|맛집|여행|일상|데일리|추천|reels|shorts|instagood|먹스타그램)$/i.test(t));
  const q = tags[0]; if (!q) return null;
  const e = encodeURIComponent(q);
  return el("section", {}, el("b", { text: `지도에서 #${q} 찾기` }), el("div", { class: "row", style: "gap:var(--s2)" },
    el("a", { class: "btn sm line", href: "https://map.naver.com/p/search/" + e, target: "_blank", rel: "noopener" }, "네이버 지도"),
    el("a", { class: "btn sm line", href: "https://map.kakao.com/?q=" + e, target: "_blank", rel: "noopener" }, "카카오맵")));
}

/* ---------- 영상 상세 시트 ---------- */
function closeSheet() { state.detailId = null; render(); }
function renderItemSheet() {
  const box = $("#itemSheet");
  const it = state.detailId && state.items.get(state.detailId);
  if (!it) { box.hidden = true; box.replaceChildren(); document.body.style.overflow = ""; return; }
  // 메모를 쓰는 중이면 다시 그리지 않아요
  if (!box.hidden && box.dataset.id === it.id && box.contains(document.activeElement) && document.activeElement.matches("input,textarea")) return;
  box.hidden = false; box.dataset.id = it.id; box.replaceChildren(); document.body.style.overflow = "hidden";
  const p = it.preview || {};
  const cat = it.category || INBOX;
  // 분류 (한 번 누르면 바뀜)
  const r = classify(it, state.profile, state.categories);
  const cats = el("div", { class: "catgrid" });
  for (const c of state.categories) cats.append(el("button", { type: "button", class: "catbtn" + (c !== cat && r.scores[c] ? " sug" : ""), "aria-pressed": String(c === cat), onclick: () => setCategory(it, c) }, c));
  // 노트
  const inNotes = notesByItem.get(it.id) || [];
  const nsel = el("select", { class: "selpill", "aria-label": "노트에 넣기", onchange: e => { const v = e.target.value; e.target.value = ""; addItemToNote(it, v); } });
  nsel.append(el("option", { value: "", text: "＋ 노트에 넣기" }));
  for (const n of sortedNotes()) nsel.append(el("option", { value: n.id, text: (n.itemIds || []).includes(it.id) ? "✓ " + n.title : n.title }));
  nsel.append(el("option", { value: "__new", text: "새 노트 만들기" }));
  // 메모
  const memo = el("input", { class: "memo-in", id: "memoIn", maxlength: "120", placeholder: "한 줄 메모 (선택)", value: it.memo || "" });
  const saveMemo = () => {
    const v = memo.value.trim(); if (v === (it.memo || "")) return;
    const patch = { memo: v };
    if (it.catBy !== "user") { const rr = classify({ ...it, memo: v }, state.profile, state.categories); if (rr.category) { patch.category = rr.category; patch.catBy = "auto"; } }
    store.patchItem(it.id, patch); toast("메모를 저장했어요");
  };
  memo.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); memo.blur(); } });
  memo.addEventListener("blur", () => { saveMemo(); setTimeout(render, 0); });
  // 삭제
  const del = el("button", { type: "button", class: "btn sm danger" }, "삭제");
  del.addEventListener("click", () => { if (del.dataset.arm) { store.delItem(it.id); state.detailId = null; toast("지웠어요"); render(); } else { del.dataset.arm = "1"; del.textContent = "한 번 더 누르면 삭제"; } });
  const desc = p.description ? el("p", { class: "desc" + (state.descOpen ? " open" : ""), text: p.description }) : null;
  const moreDesc = p.description && p.description.length > 160 && !state.descOpen ? el("button", { type: "button", class: "btn quiet", style: "align-self:flex-start;padding:0;min-height:auto", onclick: () => { state.descOpen = true; render(); } }, "캡션 더 보기") : null;
  const x = el("button", { type: "button", class: "icon-btn x", "aria-label": "닫기", onclick: closeSheet }); x.append(svg("x"));

  box.append(el("div", { class: "sheet-back", onclick: e => { if (e.target === e.currentTarget) closeSheet(); } },
    el("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": titleOf(it) },
      el("div", { class: "grab" }), x,
      el("div", { class: "media" },
        el("a", { href: it.url, target: "_blank", rel: "noopener", "aria-label": "원본 열기" }, vthumb(it, { overlays: false })),
        el("div", { class: "info" },
          el("div", { class: "title", text: titleOf(it) }),
          el("div", { class: "hint", text: [p.author ? "@" + p.author : null, it.source, ago(it.createdAt) + " 담음"].filter(Boolean).join(" · ") }),
          el("div", { class: "row", style: "gap:var(--s2);margin-top:var(--s2)" },
            el("a", { class: "btn", href: it.url, target: "_blank", rel: "noopener", onclick: () => { if (!it.seen) store.patchItem(it.id, { seen: true, seenAt: Date.now() }); } }, "열어서 보기"),
            el("button", { type: "button", class: "btn line", onclick: () => { store.patchItem(it.id, { seen: !it.seen, seenAt: it.seen ? null : Date.now() }); toast(it.seen ? "안 본 것으로 돌렸어요" : "본 것으로 표시했어요"); } }, it.seen ? "안 봄으로" : "봤어요")))),
      desc, moreDesc,
      el("div", { class: "divider" }),
      el("section", {}, el("b", { text: "분류" }), cats, it.catBy === "auto" ? el("p", { class: "hint", text: "자동으로 분류했어요. 다르면 눌러서 바꾸면, 다음부터 비슷한 영상에 반영돼요." }) : null),
      placeLinks(it),
      el("section", {}, el("b", { text: "노트" }), el("div", { class: "row", style: "gap:var(--s2)" }, inNotes.map(n => el("button", { type: "button", class: "notechip", onclick: () => { state.detailId = null; goto("note-" + n.id); } }, n.title)), nsel)),
      el("section", {}, el("b", { text: "메모" }), memo),
      el("div", { class: "row", style: "justify-content:space-between" },
        el("div", { class: "row", style: "gap:var(--s2)" },
          el("button", { type: "button", class: "btn sm quiet", onclick: () => copyText(it.url) }, "링크 복사"),
          PREVIEW ? el("button", { type: "button", class: "btn sm quiet", onclick: () => { readPreview(it.id); toast("미리보기를 다시 읽는 중이에요"); } }, "다시 읽기") : null),
        del))));
}
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (state.detailId) closeSheet(); else if (state.shareId) { state.shareId = null; render(); } } });

/* ---------- 받은 함 정리 ---------- */
function renderInbox() {
  const box = $("#triage"); box.replaceChildren();
  const all = inboxItems();
  const queue = [...all.filter(i => !state.skipped.has(i.id)), ...all.filter(i => state.skipped.has(i.id))];
  if (!queue.length) {
    state.triageTotal = 0;
    box.append(el("div", { class: "empty" }, el("b", { text: "모두 정리했어요" }),
      el("span", { text: "새로 담은 영상은 알아서 분류되고, 애매한 것만 여기로 와요." }),
      el("a", { class: "btn line", href: "#library" }, "보관함 보기")));
    return;
  }
  state.triageTotal = Math.max(state.triageTotal || 0, queue.length);
  const done = state.triageTotal - queue.length;
  const it = queue[0];
  const p = it.preview || {};
  const r = classify(it, state.profile, state.categories);
  const sug = r.suggestions.filter(c => state.categories.includes(c));
  const btns = el("div", { class: "catgrid" });
  sug.forEach((c, i) => btns.append(el("button", { type: "button", class: "catbtn" + (r.scores[c] ? (i === 0 ? " top" : " sug") : ""), onclick: () => setCategory(it, c) }, c)));
  for (const c of state.categories) if (!sug.includes(c)) btns.append(el("button", { type: "button", class: "catbtn", onclick: () => setCategory(it, c) }, c));
  const newIn = el("input", { class: "input", style: "max-width:220px;padding:8px 14px;font-size:15px", maxlength: "12", placeholder: "새 분류 이름", "aria-label": "새 분류 이름" });
  const addNew = () => {
    const v = newIn.value.trim(); if (!v) return;
    if (!state.categories.includes(v)) { const cats = [...state.categories, v]; state.categories = cats; store.setMeta({ categories: cats }); }
    setCategory(it, v);
  };
  newIn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addNew(); } });
  const reason = Object.keys(r.scores).length ? `‘${sug[0]}’ 같아요. 맞으면 파란 버튼을 눌러요.` : it.status === "reading" ? "미리보기를 읽는 중이에요…" : it.status === "fail" ? "이 게시물은 내용을 읽지 못했어요. 원본을 보고 골라 주세요." : !PREVIEW ? "미리보기 서버가 설정되지 않아 직접 골라야 해요." : "내용만으로는 분류를 정하기 어려워요.";
  box.append(el("div", { class: "progress" }, el("div", { class: "bar" }, el("i", { style: `width:${state.triageTotal ? Math.round(done / state.triageTotal * 100) : 0}%` })), el("span", { class: "mono", text: `남은 영상 ${queue.length}개` })),
    el("div", { class: "triage" },
      el("a", { href: it.url, target: "_blank", rel: "noopener", "aria-label": "원본 열기" }, vthumb(it)),
      el("div", { class: "tbody" },
        el("div", { class: "hint", text: [p.author ? "@" + p.author : null, it.source, ago(it.createdAt)].filter(Boolean).join(" · ") }),
        el("h2", { text: titleOf(it) }),
        p.description && firstLine(p.description) !== titleOf(it) ? el("p", { class: "desc", text: p.description }) : null,
        el("p", { class: "reason", text: reason }),
        btns,
        el("div", { class: "row", style: "gap:var(--s2)" }, newIn, el("button", { type: "button", class: "btn sm line", onclick: addNew }, "새 분류로")),
        el("div", { class: "row", style: "gap:var(--s1)" },
          el("a", { class: "btn sm quiet", href: it.url, target: "_blank", rel: "noopener" }, "원본 보기"),
          it.status === "fail" && PREVIEW ? el("button", { type: "button", class: "btn sm quiet", onclick: () => readPreview(it.id) }, "다시 읽기") : null,
          el("button", { type: "button", class: "btn sm quiet", onclick: () => { state.skipped.add(it.id); render(); } }, "나중에"),
          el("button", { type: "button", class: "btn sm danger", onclick: () => { store.delItem(it.id); toast("지웠어요"); } }, "지우기")))));
}

/* ---------- 공유로 들어왔을 때 ---------- */
function renderShareSheet() {
  const box = $("#shareSheet");
  const it = state.shareId && state.items.get(state.shareId);
  if (!it) { box.hidden = true; box.replaceChildren(); return; }
  box.hidden = false; box.replaceChildren();
  const cat = it.category || INBOX;
  const chips = el("div", { class: "catgrid" });
  if (it.status !== "reading") {
    const r = classify(it, state.profile, state.categories);
    for (const c of [...new Set([...r.suggestions, ...state.categories])].filter(c => state.categories.includes(c)))
      chips.append(el("button", { type: "button", class: "catbtn", "aria-pressed": String(c === cat), onclick: () => setCategory(it, c) }, c));
  }
  const status = it.status === "reading" ? "내용을 읽고 분류하는 중이에요…" : cat === INBOX ? "분류를 정하지 못해 받은 함에 넣었어요. 지금 골라도 되고, 나중에 정리해도 돼요." : `‘${cat}’에 넣었어요. 다르면 아래에서 바꿔요.`;
  const close = () => { state.shareId = null; render(); };
  const x = el("button", { type: "button", class: "icon-btn x", "aria-label": "닫기", onclick: close }); x.append(svg("x"));
  box.append(el("div", { class: "sheet-back", onclick: e => { if (e.target === e.currentTarget) close(); } },
    el("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": "담았어요" },
      el("div", { class: "grab" }), x,
      el("h2", { text: "담았어요" }),
      el("div", { class: "media" }, vthumb(it, { overlays: false }), el("div", { class: "info" },
        el("div", { class: "title", text: titleOf(it) }), el("div", { class: "hint", text: it.source }), el("p", { class: "reason", text: status }))),
      chips,
      el("p", { class: "hint", text: "이제 인스타로 돌아가도 돼요. 아이폰은 화면 왼쪽 위 ◀ 표시를 누르세요." }),
      el("div", { class: "row" }, el("button", { type: "button", class: "btn", onclick: close }, "완료"), el("a", { class: "btn line", href: "#library", onclick: close }, "보관함 보기")))));
}

/* ================= 노트 ================= */
let bodyTimer = null, bodyPending = false, detailStale = false;
const sortedNotes = () => [...state.notes.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
function findNote(title) { const k = String(title).trim().toLowerCase(); for (const n of state.notes.values()) if ((n.title || "").trim().toLowerCase() === k) return n; return null; }
function uniqueTitle(t) { t = (t || "새 노트").trim().slice(0, 40) || "새 노트"; if (!findNote(t)) return t; let i = 2; while (findNote(`${t} ${i}`)) i++; return `${t} ${i}`; }
const noteItems = n => (n.itemIds || []).map(id => state.items.get(id)).filter(Boolean);
function parseTags(s) { const out = []; String(s || "").replace(/#?([^\s#,]+)/g, (m, t) => { if (!out.includes(t)) out.push(t.slice(0, 20)); return m; }); return out.slice(0, 8); }
const isBlankBody = b => { const t = String(b || "").trim(); return !t || t === TEMPLATE.trim(); };
function noteMsg(t) { const m = $("#noteMsg"); if (m) { m.textContent = t; clearTimeout(noteMsg.t); noteMsg.t = setTimeout(() => { m.textContent = ""; }, 4500); } if (state.view !== "notes") toast(t); }

async function newNote({ title, tags = [], itemIds = [], body } = {}) {
  const now = Date.now();
  const n = { id: uid(), title: uniqueTitle(title), body: body == null ? TEMPLATE : body, tags, itemIds: [...new Set(itemIds)], createdAt: now, updatedAt: now };
  state.notes.set(n.id, n);
  try { await store.putNote(n); } catch (e) { toast("노트를 저장하지 못했어요"); }
  return n;
}
function writeNote(id, patch) {
  const n = state.notes.get(id); if (!n) return Promise.resolve();
  const full = { ...patch, updatedAt: Date.now() };
  state.notes.set(id, { ...n, ...full });
  noteDirty.add(id);
  const prev = noteWrites.get(id) || Promise.resolve();
  const p = prev.then(() => store.patchNote(id, full)).catch(() => toast("노트를 저장하지 못했어요"))
    .finally(() => { if (noteWrites.get(id) === p) { noteWrites.delete(id); noteDirty.delete(id); } });
  noteWrites.set(id, p);
  return p;
}
async function addItemToNote(it, noteId) {
  if (!noteId) return;
  if (noteId === "__new") {
    const c = it.category && it.category !== INBOX ? it.category : "";
    const n = await newNote({ title: c || "새 노트", tags: c ? [c] : [], itemIds: [it.id] });
    state.nextEdit = true; goto("note-" + n.id); return;
  }
  const n = state.notes.get(noteId); if (!n) return;
  if ((n.itemIds || []).includes(it.id)) { toast(`이미 ‘${n.title}’ 노트에 있어요`); return; }
  await writeNote(n.id, { itemIds: [...(n.itemIds || []), it.id] });
  toast(`‘${n.title}’ 노트에 넣었어요`); render();
}
function renameLinks(oldT, newT) {
  const re = new RegExp("\\[\\[\\s*" + oldT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*(\\|[^\\]]+)?\\]\\]", "gi");
  for (const n of state.notes.values()) { if (re.test(n.body || "")) writeNote(n.id, { body: n.body.replace(re, (m, a) => `[[${newT}${a || ""}]]`) }); re.lastIndex = 0; }
}
async function openOrCreate(title) {
  const ex = findNote(title); if (ex) { goto("note-" + ex.id); return; }
  const n = await newNote({ title, body: "" }); toast(`‘${n.title}’ 노트를 새로 만들었어요`); state.nextEdit = true; goto("note-" + n.id);
}

function renderNoteList() {
  renderProposals();
  const tagCount = new Map(); for (const n of state.notes.values()) for (const t of n.tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  if (state.noteTag && !tagCount.has(state.noteTag)) state.noteTag = null;
  const bar = $("#tagBar"); bar.replaceChildren();
  if (tagCount.size) {
    const mk = (t, label, n) => el("button", { type: "button", class: "chip", "aria-pressed": String(state.noteTag === t), onclick: () => { state.noteTag = t; render(); } }, label, el("span", { class: "n", text: String(n) }));
    bar.append(mk(null, "모든 노트", state.notes.size));
    for (const [t, n] of [...tagCount].sort((a, b) => b[1] - a[1])) bar.append(mk(t, "#" + t, n));
  }
  const q = state.noteQ.trim().toLowerCase();
  const notes = sortedNotes().filter(n => (!state.noteTag || (n.tags || []).includes(state.noteTag)) &&
    (!q || (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q) || (n.tags || []).some(t => t.toLowerCase().includes(q)) || noteItems(n).some(i => titleOf(i).toLowerCase().includes(q))));
  const grid = $("#noteGrid"); grid.replaceChildren();
  if (!state.notes.size) {
    grid.append(el("div", { class: "card empty", style: "grid-column:1/-1" }, el("b", { text: "아직 노트가 없어요" }),
      el("span", { text: state.items.size ? "‘분류별로 묶기’는 같은 분류끼리, ‘해시태그로 묶기’는 같은 해시태그가 달린 영상끼리 노트를 만들어 줘요." : "보관함에 영상을 먼저 담아 보세요." })));
    return;
  }
  if (!notes.length) { grid.append(el("div", { class: "empty", style: "grid-column:1/-1" }, el("b", { text: "찾는 노트가 없어요" }))); return; }
  for (const n of notes) {
    const ex = plainExcerpt(n.body);
    const tv = noteItems(n).slice(0, 4);
    grid.append(el("a", { class: "ncard", href: "#note-" + n.id },
      tv.length ? el("div", { class: "thumbs" }, tv.map(i => i.preview && i.preview.image ? el("img", { src: i.preview.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: e => e.target.replaceWith(el("span")) }) : el("span"))) : null,
      el("h3", { text: n.title || "제목 없음" }),
      (n.tags || []).length ? el("div", { class: "tagrow" }, n.tags.map(t => el("span", { class: "tag", text: "#" + t }))) : null,
      ex ? el("p", { class: "ex", text: ex }) : null,
      el("div", { class: "foot", text: `영상 ${noteItems(n).length}개 · ${ago(n.updatedAt || n.createdAt)} 수정` })));
  }
}
$("#nq").addEventListener("input", e => { state.noteQ = e.target.value; render(); });
$("#newNoteBtn").addEventListener("click", async () => { const n = await newNote({ title: "새 노트" }); state.nextEdit = true; state.focusTitle = true; goto("note-" + n.id); });

$("#catGroupBtn").addEventListener("click", async () => {
  const byCat = new Map();
  for (const i of state.items.values()) { const c = i.category || INBOX; if (c === INBOX) continue; if (!byCat.has(c)) byCat.set(c, []); byCat.get(c).push(i.id); }
  let made = 0, grown = 0;
  for (const [c, ids] of byCat) {
    const ex = findNote(c);
    if (ex) { const add = ids.filter(id => !(ex.itemIds || []).includes(id)); if (add.length) { await writeNote(ex.id, { itemIds: [...(ex.itemIds || []), ...add] }); grown++; } }
    else if (ids.length >= 2) { await newNote({ title: c, tags: [c.replace(/\s+/g, "_")], itemIds: ids }); made++; }
  }
  noteMsg(made || grown ? `노트 ${made}개를 만들고, ${grown}개 노트에 영상을 더했어요.` : "묶을 영상이 없어요. 같은 분류의 영상이 2개 이상이면 노트가 돼요.");
  render();
});

const GENERIC_TAGS = /^(reels|reel|shorts|short|fyp|foryou|viral|explore|instagood|instadaily|daily|일상|데일리|추천|좋아요|좋반|팔로우|선팔|맞팔|소통|인스타|릴스|쇼츠|유튜브|틱톡|광고|협찬|ad)$/i;
$("#tagGroupBtn").addEventListener("click", () => {
  const byTag = new Map();
  for (const i of state.items.values()) {
    const tags = (i.preview && i.preview.hashtags && i.preview.hashtags.length ? i.preview.hashtags : hashtagsOf(i.preview && i.preview.description)).map(t => t.toLowerCase());
    for (const t of new Set(tags)) { if (GENERIC_TAGS.test(t)) continue; if (!byTag.has(t)) byTag.set(t, []); byTag.get(t).push(i.id); }
  }
  const props = [];
  const ranked = [...byTag].filter(([, ids]) => ids.length >= 2).sort((a, b) => b[1].length - a[1].length);
  const seenSets = [];
  for (const [t, ids] of ranked) {
    const key = [...ids].sort().join(",");
    if (seenSets.includes(key)) continue; seenSets.push(key);
    const ex = findNote(t);
    const ids2 = ex ? ids.filter(id => !(ex.itemIds || []).includes(id)) : ids;
    if (!ids2.length) continue;
    props.push({ pid: uid(), title: t, tags: [t], itemIds: ids2, existingNoteId: ex ? ex.id : null });
    if (props.length >= 8) break;
  }
  state.proposals = props;
  noteMsg(props.length ? `같은 해시태그가 달린 묶음 ${props.length}개를 찾았어요. 원하는 것만 노트로 만드세요.` : "같은 해시태그가 달린 영상이 2개 이상인 경우가 없어요. 영상이 더 모이면 다시 눌러 보세요.");
  render();
});
function renderProposals() {
  const box = $("#proposals"); box.replaceChildren();
  if (!state.proposals.length) return;
  box.append(el("div", { class: "backrow" }, el("b", { text: `찾은 묶음 ${state.proposals.length}개` }),
    el("div", { class: "row" },
      el("button", { type: "button", class: "btn sm", onclick: async () => { const ps = [...state.proposals]; for (const p of ps) await acceptProposal(p, true); noteMsg(`묶음 ${ps.length}개를 노트로 만들었어요.`); render(); } }, "모두 노트로 만들기"),
      el("button", { type: "button", class: "btn sm quiet", onclick: () => { state.proposals = []; render(); } }, "닫기"))));
  for (const p of state.proposals) {
    const ex = p.existingNoteId ? state.notes.get(p.existingNoteId) : null;
    const its = p.itemIds.map(id => state.items.get(id)).filter(Boolean);
    box.append(el("div", { class: "prop" },
      el("h3", { text: ex ? `‘${ex.title}’ 노트에 더하기` : "#" + p.title }),
      el("ul", {}, its.slice(0, 5).map(i => el("li", { text: `${titleOf(i)} · ${i.source}` })), its.length > 5 ? el("li", { text: `외 ${its.length - 5}개` }) : null),
      el("div", { class: "row" },
        el("button", { type: "button", class: "btn sm", onclick: () => acceptProposal(p) }, ex ? `영상 ${its.length}개 더하기` : `노트로 만들기 (영상 ${its.length}개)`),
        el("button", { type: "button", class: "btn sm quiet", onclick: () => { state.proposals = state.proposals.filter(x => x.pid !== p.pid); render(); } }, "빼기"))));
  }
}
async function acceptProposal(p, quiet) {
  state.proposals = state.proposals.filter(x => x.pid !== p.pid);
  const ex = p.existingNoteId ? state.notes.get(p.existingNoteId) : null;
  if (ex) { await writeNote(ex.id, { itemIds: [...new Set([...(ex.itemIds || []), ...p.itemIds])] }); if (!quiet) noteMsg(`‘${ex.title}’ 노트에 영상을 더했어요.`); }
  else { const n = await newNote({ title: p.title, tags: p.tags, itemIds: p.itemIds }); if (!quiet) noteMsg(`‘${n.title}’ 노트를 만들었어요.`); }
  if (!quiet) render();
}

function renderNoteDetail() {
  const box = $("#v-note");
  const ae = document.activeElement;
  if (box.dataset.nid === state.noteId && ae && box.contains(ae) && ae.matches("textarea,input:not([type]),input[type=text],input[type=search]")) { detailStale = true; return; }
  detailStale = false;
  const n = state.notes.get(state.noteId);
  box.dataset.nid = state.noteId || "";
  box.replaceChildren();
  const back = el("button", { type: "button", class: "btn quiet", onclick: () => goto("notes") }, "‹ 노트");
  if (!n) {
    box.append(el("div", { class: "backrow" }, back), el("div", { class: "card empty" }, el("b", { text: state.ready ? "노트를 찾을 수 없어요" : "불러오는 중이에요" })));
    return;
  }
  const vids = noteItems(n);
  const del = el("button", { type: "button", class: "btn quiet sm" }, "노트 삭제");
  del.addEventListener("click", async () => {
    if (del.dataset.arm) { state.notes.delete(n.id); try { await store.delNote(n.id); } catch (e) { toast("지우지 못했어요"); } goto("notes"); }
    else { del.dataset.arm = "1"; del.textContent = "정말 삭제? 영상은 남아요"; del.style.fontWeight = "600"; }
  });
  box.append(el("div", { class: "backrow" }, back, el("div", { class: "row" }, el("button", { type: "button", class: "btn sm line", onclick: () => saveOneNote(n.id) }, ".md로 저장"), del)));

  const title = el("input", { class: "title-in", id: "noteTitle", "aria-label": "노트 제목", maxlength: "40", value: n.title || "" });
  title.addEventListener("change", () => {
    const cur = state.notes.get(n.id); const v = title.value.trim() || "제목 없음";
    if (cur && v !== cur.title) {
      const other = findNote(v); if (other && other.id !== n.id) { toast("같은 제목의 노트가 있어요"); title.value = cur.title; return; }
      renameLinks(cur.title, v); writeNote(n.id, { title: v });
    }
  });
  title.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); title.blur(); } });
  const tags = el("input", { class: "tags-in", id: "noteTags", "aria-label": "태그", placeholder: "#태그 (띄어서 여러 개)", value: (n.tags || []).map(t => "#" + t).join(" ") });
  tags.addEventListener("change", () => { const t = parseTags(tags.value); writeNote(n.id, { tags: t }); tags.value = t.map(x => "#" + x).join(" "); });
  tags.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); tags.blur(); } });
  const mode = el("div", { class: "seg" },
    el("button", { type: "button", "aria-pressed": String(!state.noteEditing), onclick: () => { flushBody(); state.noteEditing = false; render(); } }, "보기"),
    el("button", { type: "button", "aria-pressed": String(state.noteEditing), onclick: () => { state.noteEditing = true; render(); setTimeout(() => $("#noteBody")?.focus(), 0); } }, "편집"));
  let bodyEl;
  if (state.noteEditing) {
    const ta = el("textarea", { class: "editor", id: "noteBody", "aria-label": "노트 내용 (마크다운)", spellcheck: "false" });
    ta.value = n.body || "";
    ta.addEventListener("input", () => {
      const cur = state.notes.get(n.id); if (cur) state.notes.set(n.id, { ...cur, body: ta.value });
      noteDirty.add(n.id); bodyPending = true; clearTimeout(bodyTimer);
      bodyTimer = setTimeout(() => { bodyPending = false; writeNote(n.id, { body: ta.value }); }, 700);
    });
    ta.addEventListener("blur", () => { flushBody(); if (detailStale) setTimeout(render, 0); });
    bodyEl = el("div", { class: "view", style: "gap:var(--s1)" }, ta, el("p", { class: "hint", text: "마크다운으로 적어요. ## 제목, - 목록, - [ ] 체크리스트, **굵게**, [[노트 제목]]으로 다른 노트와 연결." }));
  } else {
    const md = el("div", { class: "md" });
    if (isBlankBody(n.body)) md.append(el("p", { class: "none", text: "아직 적은 내용이 없어요. ‘편집’을 눌러 이 영상들에서 얻은 걸 적어 보세요." }));
    else md.innerHTML = mdToHtml(n.body, t => !!findNote(t));
    md.addEventListener("click", e => { const a = e.target.closest("a.wikilink"); if (a) { e.preventDefault(); openOrCreate(a.dataset.note); } });
    md.addEventListener("change", e => {
      const cb = e.target.closest("input[type=checkbox][data-line]"); if (!cb) return;
      const cur = state.notes.get(n.id); const lines = (cur.body || "").split("\n"); const i = +cb.dataset.line;
      if (lines[i] != null) { lines[i] = lines[i].replace(/\[([ xX])\]/, cb.checked ? "[x]" : "[ ]"); writeNote(n.id, { body: lines.join("\n") }); render(); }
    });
    bodyEl = md;
  }
  box.append(el("article", { class: "detail" }, title, tags,
    el("div", { class: "row", style: "justify-content:space-between" }, el("span", { class: "msg", text: `영상 ${vids.length}개 · ${ago(n.updatedAt || n.createdAt)} 수정` }), mode),
    bodyEl));

  const vsec = el("article", { class: "detail" },
    el("div", { class: "row", style: "justify-content:space-between" }, el("h2", { class: "sub-h", text: `묶인 영상 ${vids.length}개` }),
      el("button", { type: "button", class: "btn sm" + (state.pickerOpen ? " line" : ""), onclick: () => { state.pickerOpen = !state.pickerOpen; state.pickSel = new Set(); state.pickerQ = ""; render(); } }, state.pickerOpen ? "닫기" : "영상 추가")));
  if (state.pickerOpen) vsec.append(buildPicker(n));
  if (vids.length) {
    vsec.append(el("div", { class: "vlist" }, vids.map(it => {
      const rm = el("button", { type: "button", class: "icon-btn rm", "aria-label": "노트에서 빼기", onclick: e => { e.stopPropagation(); writeNote(n.id, { itemIds: (state.notes.get(n.id).itemIds || []).filter(x => x !== it.id) }); render(); } });
      rm.append(svg("x"));
      const card = itemCard(it); card.prepend(rm);
      return card;
    })));
  } else if (!state.pickerOpen) {
    vsec.append(el("p", { class: "none", text: "아직 묶인 영상이 없어요. ‘영상 추가’로 보관함의 영상을 넣어 보세요." }));
  }
  box.append(vsec);

  const key = (n.title || "").trim().toLowerCase();
  const backs = sortedNotes().filter(o => o.id !== n.id && linksIn(o.body).has(key));
  const outs = [...linksIn(n.body)].map(t => ({ t, note: findNote(t) }));
  const sameTag = sortedNotes().filter(o => o.id !== n.id && (o.tags || []).some(t => (n.tags || []).includes(t)) && !backs.includes(o));
  const chipList = (arr, empty) => arr.length ? el("div", { class: "notechips" }, arr) : el("p", { class: "none", text: empty });
  box.append(el("article", { class: "detail" }, el("h2", { class: "sub-h", text: "연결된 노트" }),
    el("div", { class: "links-grid" },
      el("div", {}, el("h4", { text: "이 노트를 언급한 노트" }), chipList(backs.map(o => el("button", { type: "button", class: "notechip", onclick: () => goto("note-" + o.id) }, o.title)), `다른 노트에 [[${n.title || ""}]]라고 적으면 여기 나타나요.`)),
      el("div", {}, el("h4", { text: "이 노트가 연결한 노트" }), chipList(outs.map(({ t, note }) => el("button", { type: "button", class: "notechip", onclick: () => openOrCreate(note ? note.title : t) }, note ? note.title : t + " (새로 만들기)")), "본문에 [[노트 제목]]을 적으면 연결돼요.")),
      el("div", {}, el("h4", { text: "같은 태그의 노트" }), chipList(sameTag.slice(0, 8).map(o => el("button", { type: "button", class: "notechip", onclick: () => goto("note-" + o.id) }, o.title)), "같은 태그를 단 노트가 없어요.")))));
  if (state.focusTitle) { state.focusTitle = false; setTimeout(() => { const t = $("#noteTitle"); if (t) { t.focus(); t.select(); } }, 0); }
}
function flushBody() {
  const ta = $("#noteBody"); if (!ta || !state.noteId || !bodyPending) return;
  clearTimeout(bodyTimer); bodyTimer = null; bodyPending = false;
  writeNote(state.noteId, { body: ta.value });
}
function buildPicker(n) {
  const q = el("input", { type: "search", class: "search", id: "pickQ", "aria-label": "보관함에서 찾기", placeholder: "보관함에서 찾기", value: state.pickerQ });
  const listBox = el("div", { class: "picklist" });
  const addBtn = el("button", { type: "button", class: "btn sm" }, "선택한 영상 넣기");
  const fill = () => {
    listBox.replaceChildren();
    const have = new Set(n.itemIds || []); const k = state.pickerQ.trim().toLowerCase();
    const cats = new Set(noteItems(n).map(i => i.category));
    const tagSet = new Set((n.tags || []).map(t => t.toLowerCase()));
    const score = i => (cats.has(i.category) || tagSet.has((i.category || "").toLowerCase()) || (i.preview && (i.preview.hashtags || []).some(t => tagSet.has(t.toLowerCase())))) ? 0 : 1;
    const rows = [...state.items.values()].filter(i => !have.has(i.id) && (!k || titleOf(i).toLowerCase().includes(k) || (i.category || "").toLowerCase().includes(k) || String(i.preview && i.preview.description || "").toLowerCase().includes(k)))
      .sort((a, b) => score(a) - score(b) || b.createdAt - a.createdAt).slice(0, 80);
    if (!rows.length) listBox.append(el("p", { class: "none", text: state.items.size ? "넣을 영상이 없어요." : "보관함이 비어 있어요." }));
    for (const i of rows) {
      const cb = el("input", { type: "checkbox" }); cb.checked = state.pickSel.has(i.id);
      cb.addEventListener("change", () => { cb.checked ? state.pickSel.add(i.id) : state.pickSel.delete(i.id); addBtn.disabled = !state.pickSel.size; addBtn.textContent = state.pickSel.size ? `선택한 영상 ${state.pickSel.size}개 넣기` : "선택한 영상 넣기"; });
      const pimg = i.preview && i.preview.image ? el("img", { src: i.preview.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: e => e.target.replaceWith(el("span", { class: "pthumb" })) }) : el("span", { class: "pthumb" });
      listBox.append(el("label", { class: "pickrow" }, cb, pimg, el("span", { style: "min-width:0" }, el("b", { text: titleOf(i) }), el("br"), el("span", { class: "muted", text: `${i.category === INBOX ? "받은 함" : i.category} · ${ago(i.createdAt)}` }))));
    }
  };
  q.addEventListener("input", () => { state.pickerQ = q.value; fill(); });
  addBtn.disabled = !state.pickSel.size;
  addBtn.addEventListener("click", async () => {
    if (!state.pickSel.size) return;
    const cur = state.notes.get(n.id); const ids = [...new Set([...(cur.itemIds || []), ...state.pickSel])];
    const added = state.pickSel.size; state.pickSel = new Set(); state.pickerOpen = false;
    await writeNote(n.id, { itemIds: ids }); toast(`영상 ${added}개를 넣었어요`); render();
  });
  fill();
  return el("div", { class: "picker" }, q, listBox, el("div", { class: "row" }, addBtn, el("span", { class: "hint", text: "같은 분류·태그의 영상이 위에 먼저 나와요." })));
}

/* ---------- 옵시디언·마크다운 내보내기 ---------- */
function fname(s) { return String(s || "").replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 60) || "제목 없음"; }
const yamlTags = arr => "[" + arr.map(t => JSON.stringify(String(t).replace(/\s+/g, "_"))).join(", ") + "]";
function buildVault() {
  const used = new Set(["revide 홈"]);
  const uniq = base => { let n = base, i = 2; while (used.has(n.toLowerCase())) n = `${base} ${i++}`; used.add(n.toLowerCase()); return n; };
  const notes = sortedNotes();
  const noteName = new Map(notes.map(n => [n.id, uniq(fname(n.title))]));
  const items = [...state.items.values()].sort((a, b) => b.createdAt - a.createdAt);
  const vidName = new Map(items.map(i => [i.id, uniq(fname(titleOf(i)))]));
  const byTitle = new Map(notes.map(n => [(n.title || "").trim().toLowerCase(), noteName.get(n.id)]));
  const fixLinks = body => String(body || "").replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (m, t, a) => { const f = byTitle.get(t.trim().toLowerCase()); return f && f !== t.trim() ? `[[${f}${a || "|" + t.trim()}]]` : m; });
  const itemNotes = new Map(); for (const n of notes) for (const id of n.itemIds || []) { if (!itemNotes.has(id)) itemNotes.set(id, []); itemNotes.get(id).push(n); }
  const files = [];
  for (const n of notes) {
    const vids = noteItems(n);
    let md = `---\ntags: ${yamlTags(["revide/노트", ...(n.tags || [])])}\ncreated: ${ymd(n.createdAt)}\nupdated: ${ymd(n.updatedAt)}\n---\n`;
    md += isBlankBody(n.body) ? "" : fixLinks(n.body).replace(/\s+$/, "") + "\n";
    md += "\n## 영상\n" + (vids.length ? vids.map(i => { const f = vidName.get(i.id), lab = titleOf(i).replace(/[|\]]/g, " ").trim(); return `- [[${f === lab ? f : f + "|" + lab}]] · ${i.source} · [원본](${i.url})`; }).join("\n") : "- (아직 없음)") + "\n";
    files.push([`노트/${noteName.get(n.id)}.md`, md]);
  }
  for (const i of items) {
    const p = i.preview || {}; const ns = itemNotes.get(i.id) || [];
    let md = `---\nurl: ${JSON.stringify(i.url)}\nsource: ${JSON.stringify(i.source || "")}\nauthor: ${JSON.stringify(p.author || "")}\ncategory: ${JSON.stringify(i.category === INBOX ? "미분류" : i.category)}\nsaved: ${ymd(i.createdAt)}\nseen: ${!!i.seen}\ntags: ${yamlTags(["revide/영상", i.category === INBOX ? "미분류" : i.category, ...(p.hashtags || []).slice(0, 8)])}\n---\n`;
    md += `# ${titleOf(i)}\n\n[원본 열기](${i.url})\n`;
    if (i.memo) md += `\n> ${i.memo}\n`;
    if (p.description) md += `\n${p.description}\n`;
    if (ns.length) md += "\n## 들어간 노트\n" + ns.map(n => `- [[${noteName.get(n.id)}]]`).join("\n") + "\n";
    files.push([`영상/${vidName.get(i.id)}.md`, md]);
  }
  const cats = new Map(); for (const i of items) { const c = i.category === INBOX ? "미분류" : i.category; if (!cats.has(c)) cats.set(c, []); cats.get(c).push(i); }
  let home = `---\ntags: ${yamlTags(["revide"])}\nexported: ${ymd()}\n---\n# Revide\n\nRevide에서 내보낸 노트 ${notes.length}개와 영상 ${items.length}개예요. 그래프 보기를 열면 노트와 영상이 어떻게 이어져 있는지 보여요.\n\n## 노트\n`;
  home += (notes.length ? notes.map(n => `- [[${noteName.get(n.id)}]] · 영상 ${noteItems(n).length}개`).join("\n") : "- (아직 없음)") + "\n\n## 분류별 영상\n";
  for (const [c, list] of cats) home += `\n### ${c}\n` + list.map(i => `- [[${vidName.get(i.id)}]]`).join("\n") + "\n";
  files.push(["Revide 홈.md", home]);
  return files;
}
function loadZip() {
  return new Promise((res, rej) => {
    if (window.JSZip) return res(window.JSZip);
    const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    sc.onload = () => window.JSZip ? res(window.JSZip) : rej(new Error("JSZip")); sc.onerror = rej; document.head.append(sc);
  });
}
async function exportVault(btn) {
  if (!state.notes.size && !state.items.size) { toast("내보낼 노트나 영상이 없어요"); return; }
  const label = btn ? btn.textContent : ""; if (btn) { btn.disabled = true; btn.textContent = "파일 만드는 중…"; }
  try {
    const JSZip = await loadZip(); const zip = new JSZip(); const root = zip.folder("Revide");
    for (const [path, md] of buildVault()) root.file(path, md);
    download(`Revide-obsidian-${ymd()}.zip`, await zip.generateAsync({ type: "blob" }));
    toast("zip 파일을 저장했어요. 압축을 풀어 옵시디언에서 폴더로 여세요.");
  } catch (e) { toast("파일을 만들지 못했어요. 인터넷 연결을 확인해 주세요."); }
  finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
}
$("#vaultBtn").addEventListener("click", e => exportVault(e.currentTarget));
function saveOneNote(id) {
  const n = state.notes.get(id); if (!n) return; flushBody();
  const vids = noteItems(n);
  let md = `---\ntags: ${yamlTags(n.tags || [])}\ncreated: ${ymd(n.createdAt)}\nupdated: ${ymd(n.updatedAt)}\n---\n# ${n.title}\n\n`;
  md += isBlankBody(n.body) ? "" : n.body.replace(/\s+$/, "") + "\n";
  md += "\n## 영상\n" + (vids.length ? vids.map(i => `- [${titleOf(i).replace(/[[\]]/g, " ")}](${i.url}) · ${i.source}`).join("\n") : "- (아직 없음)") + "\n";
  download(`${fname(n.title)}.md`, new Blob([md], { type: "text/markdown;charset=utf-8" }));
}

/* ================= 설정 ================= */
async function doSignIn() {
  try { await store.signIn(); } catch (e) { toast("로그인하지 못했어요. " + (e && e.code === "auth/unauthorized-domain" ? "Firebase에 이 사이트 주소를 등록해야 해요." : "잠시 후 다시 시도해 주세요.")); }
}
function renderSettings() {
  const box = $("#settings");
  if (box.contains(document.activeElement) && document.activeElement.matches("input")) return;
  box.replaceChildren();
  const a = state.auth;
  // 계정
  const acct = el("div", { class: "card" }, el("h2", { text: "계정" }));
  if (!a.available) acct.append(el("p", { class: "none", text: a.error || "로그인 기능이 꺼져 있어요. 지금은 이 기기에만 저장돼요. (사이트 관리자가 config.js에 Firebase를 설정하면 켜져요)" }));
  else if (a.checking) acct.append(el("p", { class: "none", text: "확인하는 중이에요…" }));
  else if (a.user) acct.append(el("div", { class: "row" }, a.user.photo ? el("img", { class: "avatar", src: a.user.photo, alt: "", referrerpolicy: "no-referrer" }) : null,
      el("div", {}, el("b", { text: a.user.name || "로그인됨" }), el("p", { class: "hint", text: a.user.email })),),
    el("p", { class: "none", text: "폰·노트북 어디서든 같은 계정으로 로그인하면 같은 보관함이 보여요." }),
    el("div", { class: "row" }, el("button", { class: "btn sm line", type: "button", onclick: () => store.signOut() }, "로그아웃")));
  else acct.append(el("p", { class: "none", text: "로그인하면 폰·노트북에서 같은 보관함을 쓰고, 기기를 바꿔도 사라지지 않아요." }),
    el("div", { class: "row" }, el("button", { class: "btn", type: "button", onclick: doSignIn }, "구글로 로그인")));
  // 공유로 담기
  const base = location.origin + location.pathname;
  const shortcutUrl = base + "?add=";
  const sIn = el("input", { readonly: true, value: shortcutUrl, "aria-label": "단축어에 넣을 주소" });
  const share = el("div", { class: "card" }, el("h2", { text: "공유 버튼으로 담기" }),
    el("p", { class: "none", text: "인스타·유튜브에서 공유를 누르고 Revide를 고르면, 링크를 붙여넣지 않아도 자동으로 담기고 분류돼요." }),
    el("b", { text: "아이폰" }),
    /^https:\/\/(www\.)?icloud\.com\/shortcuts\//.test(CFG.shortcutLink || "")
      ? el("div", { class: "view", style: "gap:var(--s2)" },
          el("div", { class: "row" }, el("a", { class: "btn sm", href: CFG.shortcutLink, target: "_blank", rel: "noopener" }, "단축어 바로 설치")),
          el("p", { class: "hint", text: "설치한 뒤 인스타에서 공유 → ‘공유’(또는 ‘더 보기’) → 목록 아래쪽의 ‘Revide에 담기’를 누르면 돼요." }))
      : null,
    el("details", {}, el("summary", { text: CFG.shortcutLink ? "직접 만들기 (2분)" : "단축어 만들기 (처음 한 번, 2분)" }),
      el("ol", { style: "margin-top:var(--s2)" },
        el("li", { text: "‘단축어’ 앱 → 오른쪽 위 + → 이름을 ‘Revide에 담기’로 바꾸기" }),
        el("li", { text: "아래쪽 ⓘ → ‘공유 시트에서 보기’ 켜기. 맨 위 ‘공유 시트에서 … 입력 받기’의 항목을 눌러 ‘URL’과 ‘텍스트’만 남기기" }),
        el("li", { text: "동작 추가 → ‘URL 인코딩’ (입력은 ‘단축어 입력’)" }),
        el("li", { text: "동작 추가 → ‘텍스트’ → 아래 주소를 붙여넣고, 바로 뒤에 변수 ‘URL 인코딩된 텍스트’ 넣기" }),
        el("li", { text: "동작 추가 → ‘URL 열기’ (입력은 ‘텍스트’) → 완료" }),
        el("li", { text: "인스타에서 공유 → ‘공유’(또는 ‘더 보기’) → 목록 아래쪽 ‘Revide에 담기’" })),
      el("div", { class: "copyrow", style: "margin-top:var(--s2)" }, sIn, el("button", { type: "button", class: "btn sm", onclick: () => copyText(shortcutUrl, sIn) }, "복사"))),
    el("p", { class: "hint", text: "단축어는 Safari로 Revide를 열어요. 아이폰에서는 홈 화면 앱 대신 Safari에서 로그인해 두면 편해요." }),
    el("b", { text: "안드로이드" }),
    el("ol", {},
      el("li", { text: "Chrome으로 이 사이트를 열고 메뉴(⋮) → ‘홈 화면에 추가’ 또는 ‘앱 설치’" }),
      el("li", { text: "이제 인스타 공유 목록에 Revide가 앱처럼 나타나요. 누르면 바로 담겨요." })));
  // 분류
  const counts = {}; for (const i of state.items.values()) counts[i.category || INBOX] = (counts[i.category || INBOX] || 0) + 1;
  const catList = el("div", { class: "catlist" });
  for (const c of state.categories) {
    const inp = el("input", { value: c, maxlength: "12", "aria-label": c + " 이름 바꾸기" });
    inp.addEventListener("change", () => renameCategory(c, inp.value.trim()));
    inp.addEventListener("keydown", e => { if (e.key === "Enter") inp.blur(); });
    const delB = el("button", { type: "button", class: "btn sm quiet" }, "지우기");
    delB.addEventListener("click", () => { if (delB.dataset.arm) renameCategory(c, null); else { delB.dataset.arm = "1"; delB.textContent = "영상은 받은 함으로"; delB.style.fontWeight = "600"; } });
    catList.append(el("div", { class: "catrow" }, inp, el("span", { class: "mono hint", text: `${counts[c] || 0}개` }), delB));
  }
  const newCat = el("input", { class: "input", maxlength: "12", placeholder: "새 분류 이름", "aria-label": "새 분류 이름", style: "padding:var(--s2) var(--s4)" });
  const addCat = () => { const v = newCat.value.trim(); if (!v || state.categories.includes(v)) return; const cats = [...state.categories, v]; state.categories = cats; store.setMeta({ categories: cats }); newCat.value = ""; render(); };
  newCat.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addCat(); } });
  const learned = Object.values(state.profile.learn || {}).reduce((s, m) => s + Object.keys(m).length, 0);
  const forget = el("button", { type: "button", class: "btn sm quiet" }, "배운 기록 지우기");
  forget.addEventListener("click", () => { if (forget.dataset.arm) { store.setMeta({ profile: {} }); toast("배운 기록을 지웠어요"); } else { forget.dataset.arm = "1"; forget.textContent = "정말 지울까요?"; forget.style.fontWeight = "600"; } });
  const cats = el("div", { class: "card" }, el("h2", { text: "분류" }),
    el("p", { class: "none", text: "이름을 눌러 바로 고칠 수 있어요. 받은 함에서 분류를 고를 때마다 그 영상의 단어와 계정을 기억해서 다음 분류에 써요." }),
    catList, el("div", { class: "row" }, newCat, el("button", { type: "button", class: "btn sm line", onclick: addCat }, "추가")),
    el("div", { class: "row", style: "justify-content:space-between" }, el("span", { class: "hint", text: `배운 낱말 ${learned}개 · 기억한 계정 ${Object.keys(state.profile.authors || {}).length}개` }), forget));
  // 백업
  const file = el("input", { type: "file", accept: "application/json,.json", hidden: true });
  file.addEventListener("change", () => { const f = file.files && file.files[0]; if (f) restoreBackup(f); file.value = ""; });
  const backup = el("div", { class: "card" }, el("h2", { text: "백업·내보내기" }),
    el("p", { class: "none", text: "백업 파일로 다른 기기나 계정에 옮길 수 있어요. 옵시디언으로 내보내면 노트와 영상이 서로 링크된 .md 파일 묶음이 돼요." }),
    el("div", { class: "row" },
      el("button", { type: "button", class: "btn sm", onclick: saveBackup }, "백업 파일 저장"),
      el("button", { type: "button", class: "btn sm line", onclick: () => file.click() }, "백업 불러오기"),
      el("button", { type: "button", class: "btn sm line", onclick: e => exportVault(e.currentTarget) }, "옵시디언으로 내보내기")), file);
  // 상태
  const sys = el("div", { class: "card" }, el("h2", { text: "자동 분류 상태" }),
    el("p", { class: "none", text: PREVIEW ? "미리보기 서버가 연결되어 있어요. 링크를 담으면 제목·캡션·해시태그를 읽고 분류해요." : "미리보기 서버가 설정되지 않았어요. 지금은 담은 영상이 모두 받은 함으로 가요. (config.js의 previewUrl)" }),
    PREVIEW ? el("div", { class: "row" }, el("button", { type: "button", class: "btn sm line", onclick: testPreview }, "연결 확인")) : null);
  box.append(share, cats, acct, backup, sys);
}
async function testPreview() {
  toast("확인하는 중…");
  const d = await fetchPreview("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  toast(d ? "잘 연결돼 있어요" : "미리보기 서버에 연결하지 못했어요. 주소와 ALLOWED_ORIGINS를 확인해 주세요.");
}
async function renameCategory(from, to) {
  if (to === from) return;
  if (to && state.categories.includes(to)) { toast("같은 이름의 분류가 있어요"); render(); return; }
  const cats = to ? state.categories.map(c => c === from ? to : c) : state.categories.filter(c => c !== from);
  state.categories = cats;
  const profile = renameInProfile(state.profile, from, to);
  store.setMeta({ categories: cats, profile });
  for (const it of state.items.values()) if (it.category === from) store.patchItem(it.id, to ? { category: to } : { category: INBOX, catBy: "none" });
  toast(to ? `‘${from}’을(를) ‘${to}’(으)로 바꿨어요` : `‘${from}’을(를) 지웠어요`);
  render();
}
function saveBackup() {
  const data = { app: "revide", v: 2, exportedAt: Date.now(), categories: state.categories, profile: state.profile, items: [...state.items.values()], notes: [...state.notes.values()] };
  download(`Revide-backup-${ymd()}.json`, new Blob([JSON.stringify(data)], { type: "application/json" }));
}
async function restoreBackup(f) {
  try {
    const d = JSON.parse(await f.text());
    if (!d || d.app !== "revide" || !Array.isArray(d.items)) throw new Error("bad");
    const have = new Set([...state.items.values()].map(i => normUrl(i.url)));
    let ni = 0, nn = 0;
    for (const it of d.items) { if (!it || !it.url || have.has(normUrl(it.url))) continue; have.add(normUrl(it.url)); await store.putItem({ ...it, id: it.id || uid() }); ni++; }
    for (const n of d.notes || []) { if (!n || state.notes.has(n.id)) continue; await store.putNote({ ...n, id: n.id || uid() }); nn++; }
    const cats = [...new Set([...state.categories, ...(d.categories || [])])];
    await store.setMeta({ categories: cats, ...(Object.keys(state.profile).length ? {} : { profile: d.profile || {} }) });
    toast(`영상 ${ni}개, 노트 ${nn}개를 불러왔어요`);
  } catch (e) { toast("Revide 백업 파일이 아니에요"); }
}

/* ================= 시작 ================= */
// 공유로 들어온 링크 (아이폰 단축어: ?add=, 안드로이드 공유: ?url= / ?text=)
{
  const ps = new URLSearchParams(location.search);
  const shared = [ps.get("add"), ps.get("url"), ps.get("text"), ps.get("title")].find(v => v && extractUrl(v)) || "";
  if (shared) {
    pendingShare = shared;
    history.replaceState(null, "", location.pathname + (location.hash || ""));
    // 계정 데이터를 기다리다 너무 오래 걸리면 그냥 담기
    setTimeout(() => maybeProcessShare(true), 6000);
  }
}
function maybeProcessShare(force) {
  if (!pendingShare) return;
  if (!store) { setTimeout(() => maybeProcessShare(force), 0); return; }
  if (!force) {
    if (state.auth.checking) return;
    if (state.auth.user && store.kind !== "cloud") return;
    if (!state.ready) return;
  }
  const s = pendingShare; pendingShare = "";
  addLink(s, { fromShare: true });
}
applyHash(true);
store = createStore(CFG,
  data => {
    state.items = new Map(data.items.map(i => [i.id, i]));
    const next = new Map(data.notes.map(n => [n.id, n]));
    for (const [id, n] of state.notes) if (noteDirty.has(id) && next.has(id)) next.set(id, n);
    state.notes = next;
    state.categories = Array.isArray(data.meta.categories) && data.meta.categories.length ? data.meta.categories : [...DEFAULT_CATEGORIES];
    state.profile = data.meta.profile || {};
    state.ready = data.ready;
    if (data.ready && dedupePending) { dedupePending = false; dedupe(); }
    // 예전에 분류 목록을 저장해 둔 사용자에게 새 기본 분류(IT·테크, 반려동물 등) 한 번 더해 주기
    if (data.ready && store && Array.isArray(data.meta.categories) && (data.meta.defaultsV || 1) < DEFAULTS_VERSION && !migratedDefaults) {
      migratedDefaults = true;
      const add = [];
      for (let v = (data.meta.defaultsV || 1) + 1; v <= DEFAULTS_VERSION; v++) for (const c of NEW_IN_VERSION[v] || []) if (!data.meta.categories.includes(c)) add.push(c);
      store.setMeta({ categories: [...data.meta.categories, ...add], defaultsV: DEFAULTS_VERSION }).catch(() => {});
    }
    if (data.ready) resumeReading();
    render();
    maybeProcessShare();
  },
  a => {
    const prevUser = state.auth.user && state.auth.user.uid;
    if ((a.user && a.user.uid) !== prevUser) state.ready = false;
    state.auth = a;
    if (a.moved) { dedupePending = true; toast(`이 기기에 담아 둔 ${a.moved}개를 계정으로 옮겼어요`); }
    if (a.error) toast(a.error);
    render();
    maybeProcessShare();
  });


render();
