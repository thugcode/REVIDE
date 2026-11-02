# Revide 배포 가이드

처음 한 번만 하면 되는 설정이에요. 전부 무료이고 카드 등록도 필요 없어요. 천천히 따라 하면 1시간 안에 끝나요.

## 전체 그림 먼저

Revide는 세 군데에 나눠서 올라가요.

| 어디 | 하는 일 | 없으면 |
|---|---|---|
| **GitHub Pages** | 사이트 자체(화면)를 인터넷에 올려 둠 | 사이트가 안 열림 |
| **Cloudflare Workers** | 링크를 받아 인스타·유튜브 게시물의 제목·캡션·해시태그를 대신 읽어 옴 → 자동 분류의 재료 | 담은 영상이 전부 '분류함'으로 감 |
| **Firebase** | 구글 로그인과 계정 저장 → 폰·노트북에서 같은 보관함 | 각 기기에만 저장됨 |

순서는 **① GitHub에 올려서 주소 받기 → ② Cloudflare → ③ Firebase → ④ config.js 고쳐서 다시 올리기**예요. ①에서 받은 주소를 ②·③에서 써야 해서 이 순서가 편해요.

> config.js를 비워 둔 채로 올려도 사이트는 동작해요(기기에만 저장, 자동 분류 없음). 하나씩 켜 가며 확인해도 돼요.

---

## ① GitHub Pages에 올리기

1. [github.com](https://github.com)에 로그인 → 오른쪽 위 **+** → **New repository**
2. Repository name: `revide` / **Public** 선택 → **Create repository**
3. 만들어진 페이지에서 **uploading an existing file** 링크를 누르기
4. 압축을 푼 `revide-web` 폴더 **안의 내용물**(index.html, app.js, config.js, icons 폴더 등)을 전부 끌어다 놓기
   - `worker` 폴더와 `GUIDE.md`, `firestore.rules`는 올려도 되고 안 올려도 돼요.
5. 아래 **Commit changes** 누르기
6. 저장소 위쪽 **Settings** → 왼쪽 **Pages** → Branch를 **main**, 폴더 **/(root)** 로 고르고 **Save**
7. 1~2분 뒤 같은 화면 위쪽에 주소가 나와요: `https://내아이디.github.io/revide/`
   - 이 주소를 메모해 두세요. 아래에서 계속 써요.

## ② Cloudflare Workers (미리보기 서버)

1. [dash.cloudflare.com](https://dash.cloudflare.com) 가입·로그인 (이메일만 있으면 돼요)
2. 왼쪽 **Workers & Pages** → **Create** → **Create Worker** (Hello World 템플릿) → 이름 `revide-preview` → **Deploy**
3. **Edit code** → 원래 코드를 전부 지우고 `worker/preview-worker.js` 내용을 붙여넣기 → 오른쪽 위 **Deploy**
4. Worker 화면 → **Settings** → **Variables and Secrets** → **Add**
   - 이름 `ALLOWED_ORIGINS`, 값 `https://내아이디.github.io` (뒤에 /revide 없이!) → **Deploy**
   - 이렇게 해야 다른 사이트가 내 서버를 몰래 쓰지 못해요.
5. Worker 주소를 메모: `https://revide-preview.내이름.workers.dev`
6. 확인: 브라우저 주소창에 아래를 넣었을 때 제목이 담긴 글자가 나오면 성공이에요.
   `https://revide-preview.내이름.workers.dev/?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ`

무료 한도는 하루 10만 번이고, 같은 링크는 7일 동안 다시 읽지 않아서 넉넉해요.

## ③ Firebase (구글 로그인 + 계정 저장)

1. [console.firebase.google.com](https://console.firebase.google.com) → **프로젝트 추가** → 이름 `revide` → (Google 애널리틱스는 꺼도 돼요) → 만들기
2. 프로젝트 첫 화면의 **웹(</>)** 아이콘 → 앱 닉네임 `revide` → **앱 등록**
   - 나오는 코드 중 `const firebaseConfig = { ... }`의 **중괄호 부분**을 복사해 두세요. (Firebase Hosting은 체크하지 않아요)
3. 왼쪽 **빌드 → Authentication** → **시작하기** → 로그인 방법에서 **Google** → 사용 설정 → 지원 이메일 고르고 저장
4. 같은 Authentication → **설정** 탭 → **승인된 도메인** → **도메인 추가** → `내아이디.github.io` 입력
   - 이걸 빼먹으면 로그인할 때 "unauthorized-domain" 오류가 나요.
5. 왼쪽 **빌드 → Firestore Database** → **데이터베이스 만들기** → 위치 **asia-northeast3 (서울)** → **프로덕션 모드**로 시작
6. Firestore → **규칙** 탭 → 원래 내용을 지우고 `firestore.rules` 내용을 붙여넣기 → **게시**
   - 각자 자기 데이터만 보고 쓸 수 있게 막는 규칙이에요. 꼭 해 주세요.

무료(Spark) 요금제는 카드 없이 쓰고, 하루 쓰기 2만 번·읽기 5만 번까지 무료예요.

> firebaseConfig의 apiKey는 공개돼도 괜찮은 값이에요. 데이터는 6번의 규칙이 지켜 줘요.

## ④ config.js 고쳐서 다시 올리기

`config.js`를 메모장으로 열어 이렇게 바꿔요.

```js
window.REVIDE_CONFIG = {
  firebase: {
    apiKey: "AIza....",
    authDomain: "revide-xxxx.firebaseapp.com",
    projectId: "revide-xxxx",
    storageBucket: "revide-xxxx.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef"
  },
  previewUrl: "https://revide-preview.내이름.workers.dev",
  shortcutLink: ""
};
```

GitHub 저장소 → `config.js` 클릭 → 연필(✏️) 아이콘 → 내용 바꾸기 → **Commit changes**. 1~2분 뒤 사이트에 반영돼요.

## ⑤ 확인하기

1. `https://내아이디.github.io/revide/` 접속 → **설정** → 계정에서 **구글로 로그인**
2. 설정 → 자동 분류 상태 → **연결 확인**이 "잘 연결돼 있어요"면 성공
3. 인스타 릴스 링크를 복사해 보관함 칸에 붙여넣기 → 몇 초 뒤 제목과 분류가 붙으면 완성!

## ⑥ 아이폰 단축어를 모두에게 나눠 주기 (선택이지만 추천)

사용자가 단축어를 직접 만들지 않아도 되게, 내가 한 번 만들어서 링크로 나눠 줄 수 있어요.

1. 내 아이폰에서 사이트 **설정 → 공유 버튼으로 담기 → 단축어 만들기** 순서대로 단축어를 만들기
2. 단축어 앱에서 'Revide에 담기'를 길게 누르기 → **공유** → **iCloud 링크 복사**
3. 그 링크를 config.js의 `shortcutLink`에 넣고 다시 올리기
4. 이제 사용자 설정 화면에 **단축어 바로 설치** 버튼이 생겨요.

## ⑦ 안드로이드

Chrome으로 사이트 접속 → 메뉴(⋮) → **홈 화면에 추가** 또는 **앱 설치**. 그러면 인스타 공유 목록에 Revide가 앱처럼 떠요.

## 자동 분류는 어떻게 동작하나요?

1. 링크를 담으면 미리보기 서버가 게시물의 제목·캡션·해시태그를 읽어 와요.
2. `classify.js`의 낱말 사전으로 점수를 매겨요. 예: `#홈트`, `스트레칭` → 운동 / `#성수카페`, `웨이팅` → 맛집·카페
3. 점수가 충분하면 자동으로 넣고, 애매하면 **분류함**에 넣어요.
4. 분류함에서 사용자가 분류를 고르면 그 영상의 단어와 **계정**을 기억해요. 다음에 비슷한 단어나 같은 계정의 영상이 오면 알아서 분류하고, 분류함에 있던 비슷한 영상도 같이 옮겨요.

낱말 사전은 `classify.js`의 `DICTIONARY`에서 자유롭게 고칠 수 있어요.

## 알아 둘 점

- **인스타 캡션은 항상 읽히지는 않아요.** 비공개 계정이거나 인스타가 막는 경우엔 제목·캡션이 비어서 분류함으로 가요. 써 보면서 얼마나 잘 읽히는지 확인해 주세요.
- 인스타 썸네일 주소는 며칠 뒤 만료돼요. 썸네일이 안 보이면 영상의 **더보기 → 미리보기 다시 읽기**를 누르면 돼요.
- 파일을 고치고 다시 올렸는데 예전 화면이 보이면, 새로고침을 두 번 하면 돼요. (오프라인용으로 저장해 둔 파일 때문이에요)

## 막혔을 때

| 증상 | 원인과 해결 |
|---|---|
| 로그인 창이 안 뜸 / unauthorized-domain | ③-4 승인된 도메인에 `내아이디.github.io` 추가 |
| "계정 데이터를 불러오지 못했어요 (permission-denied)" | ③-6 규칙을 게시했는지 확인 |
| 연결 확인 실패 | config.js의 previewUrl 오타, 또는 ②-4 ALLOWED_ORIGINS가 `https://내아이디.github.io`와 정확히 같은지 확인 |
| 담은 영상이 전부 분류함으로 감 | 미리보기 서버가 연결 안 됨 → 위 '연결 확인' 실패와 같은 원인 |
| 404 페이지 | GitHub Pages 설정 후 1~2분 기다리기, 파일이 저장소 맨 위(폴더 안이 아니라)에 있는지 확인 |
