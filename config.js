// config.js — 배포할 때 이 파일만 고치면 돼요. (가이드 GUIDE.md 참고)
// 비워 두면: 로그인 없이 '이 기기에만 저장' 모드 + 미리보기 없이 동작해요.
window.REVIDE_CONFIG = {
  // ① Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) → 'SDK 설정 및 구성'의 firebaseConfig 내용을 그대로 붙여넣기
  //    예: { apiKey: "AIza...", authDomain: "revide-xxxx.firebaseapp.com", projectId: "revide-xxxx", appId: "1:..." }
  firebase: null,

  // ② Cloudflare Worker 주소 (끝에 / 없이)
  //    예: "https://revide-preview.내이름.workers.dev"
  previewUrl: "",

  // ③ (선택) 아이폰 단축어 iCloud 링크. 직접 만든 단축어를 '공유 → iCloud 링크 복사'로 받아 넣으면
  //    사용자는 설정 화면에서 버튼 한 번으로 단축어를 설치할 수 있어요.
  //    예: "https://www.icloud.com/shortcuts/abcdef..."
  shortcutLink: ""
};
