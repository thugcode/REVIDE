// classify.js — AI 없이, 게시물 미리보기 글(제목·캡션·해시태그)로 분류합니다.
//
// 세 가지 단서를 점수로 더해요.
//   1) 기본 낱말 사전  : "#홈트", "스트레칭" → 운동
//   2) 내가 고친 기록  : 내가 "필라테스" 영상을 운동으로 옮긴 적이 있으면, 다음엔 알아서 운동
//   3) 같은 계정       : 같은 계정의 영상은 대개 같은 주제
// 점수가 충분히 높고 2등과 차이가 나면 자동으로 분류하고, 애매하면 '받은 함'에 남겨 추천만 보여 줘요.

export const DEFAULT_CATEGORIES = [
  "운동", "맛집·카페", "여행", "요리", "쇼핑·뷰티", "패션",
  "공부·자기계발", "재테크", "꿀팁·생활", "영화·음악", "유머"
];

export const INBOX = "미분류";

// 낱말은 자유롭게 더하거나 빼도 돼요. 영어는 소문자로 적어요.
export const DICTIONARY = {
  "운동": ["운동", "홈트", "헬스", "스트레칭", "필라테스", "요가", "하체", "상체", "복근", "뱃살", "다이어트", "러닝", "런닝", "마라톤",
    "크로스핏", "스쿼트", "플랭크", "데드리프트", "벤치프레스", "거북목", "어깨통증", "허리통증", "자세교정", "골반", "테니스", "골프", "수영",
    "등운동", "팔운동", "체지방", "근력", "유산소", "폼롤러", "workout", "fitness", "gym", "yoga", "pilates", "stretching", "squat"],
  "맛집·카페": ["맛집", "카페", "디저트", "빵집", "베이커리", "소금빵", "크로플", "웨이팅", "오마카세", "브런치", "술집", "이자카야", "와인바",
    "고깃집", "삼겹살", "국밥", "라멘", "스시", "파스타집", "핫플", "먹방", "맛있", "존맛", "신상카페", "카페투어", "맛집투어", "내돈내산맛집",
    "cafe", "coffee", "restaurant", "foodie", "dessert", "bakery", "brunch"],
  "여행": ["여행", "숙소", "호텔", "펜션", "풀빌라", "캠핑", "글램핑", "제주", "부산여행", "강릉", "경주", "여수", "일본여행", "도쿄", "오사카",
    "후쿠오카", "교토", "방콕", "다낭", "발리", "유럽여행", "파리", "항공권", "비행기", "여행지", "국내여행", "해외여행", "드라이브", "가볼만한곳",
    "데이트코스", "당일치기", "여행코스", "travel", "trip", "hotel", "vacation"],
  "요리": ["레시피", "요리", "집밥", "자취요리", "반찬", "볶음밥", "찌개", "국물", "에어프라이어", "베이킹", "소스", "도시락", "밀프렙",
    "계란요리", "간단요리", "초간단", "만드는법", "양념", "샐러드", "다이어트식단", "식단", "recipe", "cooking", "homecooking", "baking"],
  "쇼핑·뷰티": ["추천템", "꿀템", "쿠팡", "올리브영", "다이소", "언박싱", "하울", "내돈내산", "선크림", "화장품", "스킨케어", "메이크업",
    "쿠션", "립스틱", "틴트", "향수", "가전", "할인", "세일", "구매", "살림템", "쇼핑", "리뷰", "최저가", "핫딜", "haul", "unboxing",
    "skincare", "makeup", "beauty"],
  "패션": ["코디", "룩북", "패션", "데일리룩", "오오티디", "셔츠", "니트", "자켓", "코트", "청바지", "슬랙스", "스니커즈", "운동화", "가방",
    "액세서리", "무신사", "남자코디", "여자코디", "출근룩", "ootd", "outfit", "lookbook", "fashion", "style"],
  "공부·자기계발": ["공부", "영어", "회화", "영단어", "토익", "토플", "자격증", "시험", "노션", "엑셀", "생산성", "습관", "독서", "책추천",
    "강의", "코딩", "개발자", "공부법", "자기계발", "갓생", "미라클모닝", "챗gpt", "chatgpt", "공부자극", "취업", "면접", "자소서", "포트폴리오",
    "study", "english", "productivity", "notion", "coding"],
  "재테크": ["재테크", "주식", "투자", "적금", "예금", "부동산", "청약", "연금", "etf", "코인", "비트코인", "절약", "가계부", "월급", "부업",
    "파이프라인", "배당", "경제", "금리", "환율", "finance", "invest", "stock"],
  "꿀팁·생활": ["꿀팁", "생활팁", "하는법", "정리법", "청소", "살림", "자취", "아이폰", "갤럭시", "단축키", "앱추천", "인테리어", "수납",
    "세탁", "빨래", "설정방법", "알아두면", "모르면손해", "lifehack", "tips", "hack"],
  "영화·음악": ["노래", "음악", "플레이리스트", "플리", "커버", "가사", "영화", "드라마", "넷플릭스", "영화추천", "드라마추천", "애니", "웹툰",
    "콘서트", "kpop", "playlist", "movie", "netflix", "music", "song", "cover"],
  "유머": ["웃긴", "ㅋㅋㅋ", "개웃", "레전드", "밈", "짤", "웃참", "킹받", "funny", "meme", "comedy", "lol"]
};

const STOP = new Set(["instagram", "reels", "reel", "shorts", "short", "youtube", "tiktok", "릴스", "쇼츠", "인스타", "인스타그램", "유튜브",
  "틱톡", "좋아요", "댓글", "팔로우", "선팔", "맞팔", "follow", "like", "likes", "comments", "공유", "저장", "영상", "오늘", "진짜", "너무",
  "정말", "그리고", "이거", "우리", "여러분", "추천", "fyp", "foryou", "viral", "explore", "daily", "일상", "the", "and", "for", "with",
  "you", "this", "that"]);
const JOSA = ["에서", "으로", "에게", "까지", "부터", "처럼", "보다", "하고", "이랑", "이에요", "예요", "입니다", "은", "는", "이", "가",
  "을", "를", "에", "의", "도", "로", "과", "와", "만", "요"];

/** 글에서 해시태그를 뽑아요. */
export function hashtagsOf(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/#([\p{L}\p{N}_]{1,40})/gu)) {
    const t = m[1].toLowerCase();
    if (!/^\d+$/.test(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

/** 배울 때 쓰는 낱말 목록 (해시태그 + 2~12자 낱말, 조사는 떼고). */
export function tokensOf(text) {
  const set = new Set(hashtagsOf(text));
  const words = String(text || "").toLowerCase().replace(/https?:\/\/\S+/g, " ").split(/[^\p{L}\p{N}]+/u);
  for (let w of words) {
    if (!w) continue;
    if (/^[a-z]+$/.test(w)) { if (w.length >= 3 && w.length <= 20) set.add(w); continue; }
    if (/^\d+$/.test(w)) continue;
    for (const j of JOSA) { if (w.length > j.length + 1 && w.endsWith(j)) { w = w.slice(0, -j.length); break; } }
    if (w.length >= 2 && w.length <= 12) set.add(w);
  }
  for (const s of STOP) set.delete(s);
  return [...set].slice(0, 60);
}

/** 분류에 쓸 글: 메모 + 미리보기 제목·설명 */
export function textOf(item) {
  const p = item.preview || {};
  return [item.memo, p.title, p.description].filter(Boolean).join("\n");
}

function hasWord(hay, kw) {
  if (/^[a-z0-9]+$/.test(kw)) return new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`).test(hay);
  return hay.includes(kw);
}

/**
 * 분류하기
 * @returns {{category: string|null, suggestions: string[], scores: Object}}
 *   category가 null이면 자신 없음 → 받은 함
 */
export function classify(item, profile = {}, categories = DEFAULT_CATEGORIES) {
  const text = textOf(item).toLowerCase();
  const tags = hashtagsOf(text);
  const tagText = tags.join(" ");
  const tokens = tokensOf(text);
  const learn = profile.learn || {};
  const authors = profile.authors || {};
  const author = ((item.preview && item.preview.author) || "").toLowerCase();
  const scores = {};

  for (const cat of categories) {
    let sc = 0;
    const words = [...(DICTIONARY[cat] || []), ...cat.toLowerCase().split(/[·\s/]+/).filter(w => w.length >= 2)];
    const seen = new Set();
    for (const kw of words) {
      if (seen.has(kw)) continue;
      if (tagText && hasWord(tagText, kw)) { sc += 3; seen.add(kw); }
      else if (hasWord(text, kw)) { sc += 1.5; seen.add(kw); }
    }
    const lc = learn[cat] || {};
    // 해시태그로 배운 낱말이 이번에도 해시태그로 나오면 더 강한 단서
    for (const t of tokens) if (lc[t]) sc += Math.min(lc[t], 5) * (tags.includes(t) ? 2 : 1.2);
    if (author && authors[author] && authors[author][cat]) sc += 2 + Math.min(authors[author][cat], 3);
    if (sc > 0) scores[cat] = Math.round(sc * 10) / 10;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  let category = null;
  if (first && first[1] >= 1.5 && (!second || first[1] - second[1] >= 1.5)) category = first[0];

  // 추천: 점수 순 → 자주 쓰는 분류 순으로 채워 최대 4개
  const suggestions = ranked.map(r => r[0]);
  const usage = profile.usage || {};
  for (const c of [...categories].sort((a, b) => (usage[b] || 0) - (usage[a] || 0))) {
    if (suggestions.length >= 4) break;
    if (!suggestions.includes(c)) suggestions.push(c);
  }
  return { category, suggestions: suggestions.slice(0, 4), scores };
}

/**
 * 사용자가 분류를 고르거나 고쳤을 때 배우기. 새 profile 객체를 돌려줘요.
 */
export function learnFrom(profile = {}, item, cat) {
  if (!cat || cat === INBOX) return profile;
  const next = {
    learn: { ...(profile.learn || {}) },
    authors: { ...(profile.authors || {}) },
    usage: { ...(profile.usage || {}) }
  };
  const lc = { ...(next.learn[cat] || {}) };
  for (const t of tokensOf(textOf(item))) lc[t] = (lc[t] || 0) + 1;
  // 분류마다 300낱말까지만 (많이 나온 것 위주로)
  const entries = Object.entries(lc);
  next.learn[cat] = entries.length > 300 ? Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, 300)) : lc;
  const author = ((item.preview && item.preview.author) || "").toLowerCase();
  if (author) next.authors[author] = { ...(next.authors[author] || {}), [cat]: ((next.authors[author] || {})[cat] || 0) + 1 };
  const authorKeys = Object.keys(next.authors);
  if (authorKeys.length > 500) for (const k of authorKeys.slice(0, authorKeys.length - 500)) delete next.authors[k];
  next.usage[cat] = (next.usage[cat] || 0) + 1;
  return next;
}

/** 분류 이름이 바뀌거나 지워질 때 배운 기록 정리 */
export function renameInProfile(profile = {}, from, to) {
  const next = { learn: { ...(profile.learn || {}) }, authors: {}, usage: { ...(profile.usage || {}) } };
  if (to) {
    const a = next.learn[from] || {}, b = next.learn[to] || {};
    const merged = { ...b };
    for (const [k, v] of Object.entries(a)) merged[k] = (merged[k] || 0) + v;
    next.learn[to] = merged;
    next.usage[to] = (next.usage[to] || 0) + (next.usage[from] || 0);
  }
  delete next.learn[from]; delete next.usage[from];
  for (const [au, m] of Object.entries(profile.authors || {})) {
    const mm = { ...m };
    if (from in mm) { if (to) mm[to] = (mm[to] || 0) + mm[from]; delete mm[from]; }
    next.authors[au] = mm;
  }
  return next;
}
