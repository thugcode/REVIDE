// store.js — 저장소
// · Firebase 설정이 있고 로그인했으면: 계정(클라우드)에 저장 → 폰·노트북 어디서나 같은 목록
// · 아니면: 이 브라우저(기기)에만 저장. 나중에 로그인하면 계정으로 옮겨 줘요.

const LKEY = "revide.local.v1";
const FB = "https://www.gstatic.com/firebasejs/10.12.2/";

function readLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(LKEY) || "{}");
    return { items: d.items || [], notes: d.notes || [], meta: d.meta || {} };
  } catch (e) {
    return { items: [], notes: [], meta: {} };
  }
}

/** 이 기기에 저장하는 저장소 */
function localBackend(emit) {
  let data = readLocal();
  const save = () => { try { localStorage.setItem(LKEY, JSON.stringify(data)); } catch (e) { /* 저장 공간이 없거나 막힘 */ } };
  const push = () => emit({ items: data.items, notes: data.notes, meta: data.meta, ready: true });
  const up = (list, id, fn) => list.map(x => (x.id === id ? fn(x) : x));
  return {
    kind: "local",
    start() { push(); },
    stop() {},
    async putItem(it) { data.items = [...data.items.filter(x => x.id !== it.id), it]; save(); push(); },
    async patchItem(id, p) { data.items = up(data.items, id, x => ({ ...x, ...p })); save(); push(); },
    async delItem(id) { data.items = data.items.filter(x => x.id !== id); save(); push(); },
    async putNote(n) { data.notes = [...data.notes.filter(x => x.id !== n.id), n]; save(); push(); },
    async patchNote(id, p) { data.notes = up(data.notes, id, x => ({ ...x, ...p })); save(); push(); },
    async delNote(id) { data.notes = data.notes.filter(x => x.id !== id); save(); push(); },
    async setMeta(p) { data.meta = { ...data.meta, ...p }; save(); push(); },
    snapshot() { return readLocal(); },
    clear() { data = { items: [], notes: [], meta: {} }; try { localStorage.removeItem(LKEY); } catch (e) {} }
  };
}

/** 계정(Firestore)에 저장하는 저장소 */
function cloudBackend(fs, db, uid, emit, onError) {
  const { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot } = fs;
  const root = doc(db, "users", uid);
  const links = collection(root, "links");
  const notes = collection(root, "notes");
  let items = null, ns = null, meta = null;
  const unsubs = [];
  const push = () => emit({ items: items || [], notes: ns || [], meta: meta || {}, ready: items !== null && ns !== null && meta !== null });
  const strip = o => { const { id, ...rest } = o; return rest; };
  return {
    kind: "cloud",
    start() {
      unsubs.push(onSnapshot(links, s => { items = s.docs.map(d => ({ id: d.id, ...d.data() })); push(); }, onError));
      unsubs.push(onSnapshot(notes, s => { ns = s.docs.map(d => ({ id: d.id, ...d.data() })); push(); }, onError));
      unsubs.push(onSnapshot(root, s => { meta = s.exists() ? s.data() : {}; push(); }, onError));
    },
    stop() { unsubs.splice(0).forEach(u => u()); },
    putItem: it => setDoc(doc(links, it.id), strip(it)),
    patchItem: (id, p) => updateDoc(doc(links, id), p),
    delItem: id => deleteDoc(doc(links, id)),
    putNote: n => setDoc(doc(notes, n.id), strip(n)),
    patchNote: (id, p) => updateDoc(doc(notes, id), p),
    delNote: id => deleteDoc(doc(notes, id)),
    setMeta: p => setDoc(root, p, { mergeFields: Object.keys(p) })
  };
}

/**
 * 저장소 만들기
 * @param cfg      window.REVIDE_CONFIG
 * @param onData   ({items, notes, meta, ready}) => void
 * @param onAuth   ({available, user}) => void
 */
export function createStore(cfg, onData, onAuth) {
  const local = localBackend(onData);
  let backend = local;
  let auth = null, fbAuth = null, provider = null;
  const available = !!(cfg && cfg.firebase && cfg.firebase.apiKey);

  const api = {
    get kind() { return backend.kind; },
    available,
    user: null,
    putItem: (...a) => backend.putItem(...a),
    patchItem: (...a) => backend.patchItem(...a),
    delItem: (...a) => backend.delItem(...a),
    putNote: (...a) => backend.putNote(...a),
    patchNote: (...a) => backend.patchNote(...a),
    delNote: (...a) => backend.delNote(...a),
    setMeta: (...a) => backend.setMeta(...a),
    async signIn() {
      if (!auth) throw new Error("로그인 기능이 설정되지 않았어요");
      try {
        await fbAuth.signInWithPopup(auth, provider);
      } catch (e) {
        if (e && /popup-blocked|operation-not-supported|popup-closed-by-browser/.test(e.code || "")) {
          await fbAuth.signInWithRedirect(auth, provider);
        } else if (!(e && /popup-closed-by-user|cancelled-popup-request/.test(e.code || ""))) {
          throw e;
        }
      }
    },
    async signOut() { if (auth) await fbAuth.signOut(auth); }
  };

  local.start();
  onAuth({ available, user: null, checking: available });
  if (!available) return api;

  (async () => {
    let fs, db;
    try {
      const [{ initializeApp }, authMod, fsMod] = await Promise.all([
        import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")
      ]);
      fbAuth = authMod; fs = fsMod;
      const app = initializeApp(cfg.firebase);
      auth = authMod.getAuth(app);
      provider = new authMod.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        db = fsMod.initializeFirestore(app, {
          ignoreUndefinedProperties: true,
          localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() })
        });
      } catch (e) {
        db = fsMod.initializeFirestore(app, { ignoreUndefinedProperties: true });
      }
      authMod.getRedirectResult(auth).catch(() => {});
    } catch (e) {
      onAuth({ available: false, user: null, checking: false, error: "로그인 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요." });
      return;
    }

    fbAuth.onAuthStateChanged(auth, async user => {
      api.user = user ? { uid: user.uid, name: user.displayName || "", email: user.email || "", photo: user.photoURL || "" } : null;
      if (backend !== local) backend.stop();
      if (!user) {
        backend = local; local.start();
        onAuth({ available: true, user: null, checking: false });
        return;
      }
      const cloud = cloudBackend(fs, db, user.uid, onData, err => onAuth({ available: true, user: api.user, checking: false, error: "계정 데이터를 불러오지 못했어요 (" + (err && err.code || "오류") + ")" }));
      backend = cloud;
      onAuth({ available: true, user: api.user, checking: false });
      cloud.start();
      // 로그인 전에 이 기기에 담아 둔 것을 계정으로 옮기기
      const pending = local.snapshot();
      if (pending.items.length || pending.notes.length) {
        try {
          for (const it of pending.items) await cloud.putItem(it);
          for (const n of pending.notes) await cloud.putNote(n);
          local.clear();
          onAuth({ available: true, user: api.user, checking: false, moved: pending.items.length + pending.notes.length });
        } catch (e) { /* 다음 로그인 때 다시 시도 */ }
      }
    });
  })();

  return api;
}
