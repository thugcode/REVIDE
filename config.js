// config.js — Revide 설정 (가이드 GUIDE.md 참고)
window.REVIDE_CONFIG = {
  // ① Firebase: 구글 로그인 + 계정 저장
  firebase: {
    apiKey: "AIzaSyDhzUo-3DQZ5xw0lc_Mp8Lfbt2uHh8Xd5Y",
    authDomain: "revide-bb98e.firebaseapp.com",
    projectId: "revide-bb98e",
    storageBucket: "revide-bb98e.firebasestorage.app",
    messagingSenderId: "49569917571",
    appId: "1:49569917571:web:06f3a1a85a7c2cae5389b6"
  },

  // ② Cloudflare Worker 주소 (끝에 / 없이)
  previewUrl: "https://revide-preview.chosuk1324.workers.dev",

  // ③ (선택) 아이폰 단축어 iCloud 링크
  shortcutLink: "https://www.icloud.com/shortcuts/d248563435a44857be1439d1d80d119c"
};
