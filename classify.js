// classify.js — AI 없이, 게시물 미리보기 글(제목·캡션·해시태그)로 분류합니다.
//
// 세 가지 단서를 점수로 더해요.
//   1) 기본 낱말 사전  : "#홈트", "스트레칭" → 운동
//   2) 내가 고친 기록  : 내가 "필라테스" 영상을 운동으로 옮긴 적이 있으면, 다음엔 알아서 운동
//   3) 같은 계정       : 같은 계정의 영상은 대개 같은 주제
// 점수가 충분히 높고 2등과 차이가 나면 자동으로 분류하고, 애매하면 '분류함'에 남겨 추천만 보여 줘요.

export const DEFAULT_CATEGORIES = [
  "운동", "맛집·카페", "여행", "요리", "쇼핑·뷰티", "패션", "공부·자기계발",
  "IT·테크", "재테크", "꿀팁·생활", "영화·음악", "반려동물", "유머"
];
// 예전 버전에서 분류 목록을 저장해 둔 사용자에게 새로 생긴 기본 분류를 한 번 더해 주기 위한 표시
export const DEFAULTS_VERSION = 2;
export const NEW_IN_VERSION = { 2: ["IT·테크", "반려동물"] };

export const INBOX = "미분류";

// 낱말은 자유롭게 더하거나 빼도 돼요.
// · 한국어는 글 안에 들어 있기만 하면 맞아요. ("성수동맛집" 안의 "맛집"도 찾아요) → 한 글자 낱말은 넣지 마세요.
// · 영어는 소문자로, 낱말 단위로 맞아요. ("run"은 "running"에 맞지 않으니 필요한 형태를 모두 적어요)
export const DICTIONARY = {
  "운동": [
    // 일반
    "운동", "오운완", "운동기록", "운동루틴", "운동일지", "운동하는여자", "운동하는남자", "운스타그램", "헬스", "헬린이", "헬스타그램", "헬창",
    "홈트", "홈트레이닝", "홈짐", "맨몸운동", "근력운동", "근력", "근육", "근성장", "벌크업", "린매스", "커팅", "바프", "바디프로필", "눈바디",
    "체지방", "체중감량", "다이어트", "다이어터", "뱃살", "옆구리살", "팔뚝살", "허벅지살", "살빼기", "살빠지는", "칼로리소모", "유산소", "무산소",
    "인터벌", "타바타", "서킷", "pt", "피티", "트레이너", "1:1pt", "득근", "프로틴", "단백질쉐이크",
    // 부위·동작
    "하체", "상체", "복근", "코어", "등운동", "어깨운동", "팔운동", "가슴운동", "엉덩이", "힙업", "애플힙", "스쿼트", "런지", "데드리프트",
    "벤치프레스", "플랭크", "버피", "푸쉬업", "푸시업", "턱걸이", "풀업", "크런치", "레그레이즈", "힙쓰러스트", "덤벨", "바벨", "케틀벨", "밴드운동",
    // 스트레칭·재활
    "스트레칭", "폼롤러", "마사지볼", "거북목", "일자목", "라운드숄더", "어깨통증", "허리통증", "무릎통증", "골반교정", "자세교정", "체형교정",
    "척추", "디스크", "재활", "도수치료", "굽은등", "목통증", "손목통증",
    // 종목
    "필라테스", "요가", "러닝", "런닝", "달리기", "조깅", "마라톤", "러닝크루", "하프마라톤", "크로스핏", "클라이밍", "볼더링", "수영", "자유형",
    "테니스", "골프", "골린이", "스윙", "배드민턴", "탁구", "축구", "풋살", "농구", "야구", "배구", "복싱", "킥복싱", "주짓수", "태권도",
    "자전거", "라이딩", "등산", "산행", "스키", "스노보드", "서핑", "줄넘기", "계단오르기", "걷기", "만보", "필테", "바레",
    // 영어
    "workout", "workouts", "fitness", "fitspo", "gym", "gymlife", "gymmotivation", "training", "exercise", "exercises", "yoga", "pilates",
    "stretch", "stretching", "mobility", "squat", "squats", "deadlift", "bench", "abs", "core", "glutes", "legday", "cardio", "hiit", "crossfit",
    "running", "runner", "runners", "run", "marathon", "jogging", "climbing", "bouldering", "swimming", "tennis", "golf", "boxing", "cycling",
    "hiking", "bodybuilding", "calisthenics", "weightloss", "fatloss", "physio", "posture", "homeworkout"
  ],
  "맛집·카페": [
    "맛집", "맛집추천", "맛집투어", "맛집탐방", "맛스타그램", "먹스타그램", "먹방", "먹부림", "존맛", "존맛탱", "jmt", "맛있", "핵맛", "인생맛집",
    "내돈내산맛집", "줄서는", "웨이팅", "오픈런", "노포", "숨은맛집", "로컬맛집", "현지인맛집", "동네맛집", "가성비맛집", "데이트맛집", "회식",
    "카페", "카페투어", "카페추천", "신상카페", "감성카페", "대형카페", "베이커리카페", "디저트카페", "카페스타그램", "커피", "라떼", "아메리카노",
    "핸드드립", "디저트", "케이크", "빵집", "빵지순례", "베이커리", "소금빵", "크로플", "크루아상", "베이글", "도넛", "마카롱", "휘낭시에", "스콘",
    "젤라또", "빙수", "브런치", "오마카세", "스시", "초밥", "라멘", "우동", "돈까스", "돈카츠", "파스타", "피자", "버거", "햄버거", "스테이크",
    "고깃집", "삼겹살", "갈비", "곱창", "막창", "한우", "오마카세", "국밥", "냉면", "칼국수", "떡볶이", "분식", "치킨", "족발", "보쌈", "마라탕",
    "훠궈", "쌀국수", "타코", "술집", "이자카야", "와인바", "칵테일바", "하이볼", "포차", "요리주점", "루프탑", "핫플", "핫플레이스", "성수",
    "연남동", "망원", "을지로", "익선동", "한남동", "압구정", "가로수길", "합정", "문래", "용리단길", "송리단길",
    "cafe", "coffee", "latte", "restaurant", "restaurants", "foodie", "foodstagram", "dessert", "desserts", "bakery", "brunch", "eats",
    "delicious", "yummy", "foodporn", "seoulfood", "koreanfood", "streetfood", "bbq", "sushi", "ramen", "pizza", "burger"
  ],
  "여행": [
    "여행", "여행스타그램", "여행추천", "여행코스", "여행지", "여행지추천", "여행브이로그", "국내여행", "해외여행", "혼행", "혼자여행", "가족여행",
    "커플여행", "우정여행", "신혼여행", "허니문", "당일치기", "1박2일", "2박3일", "3박4일", "주말여행", "가볼만한곳", "가볼곳", "놀거리", "볼거리",
    "데이트코스", "데이트장소", "나들이", "드라이브", "드라이브코스", "뷰맛집", "오션뷰", "야경", "일출", "일몰", "포토스팟", "인생샷", "사진명소",
    "숙소", "숙소추천", "호텔", "호캉스", "리조트", "풀빌라", "펜션", "에어비앤비", "게스트하우스", "캠핑", "차박", "글램핑", "캠핑장", "항공권",
    "비행기", "공항", "면세점", "환전", "여권", "기차여행", "ktx",
    // 국내
    "제주", "제주도", "제주여행", "애월", "서귀포", "부산", "부산여행", "해운대", "광안리", "강릉", "속초", "양양", "경주", "여수", "전주", "통영",
    "남해", "거제", "포항", "가평", "춘천", "단양", "인천", "을왕리",
    // 해외
    "일본", "일본여행", "도쿄", "오사카", "교토", "후쿠오카", "삿포로", "오키나와", "나고야", "대만", "타이베이", "홍콩", "마카오", "상하이", "베트남",
    "다낭", "나트랑", "하노이", "호치민", "푸꾸옥", "태국", "방콕", "치앙마이", "푸켓", "발리", "세부", "보라카이", "괌", "사이판", "하와이",
    "싱가포르", "유럽", "유럽여행", "파리", "런던", "로마", "스페인", "바르셀로나", "스위스", "프라하", "뉴욕", "미국여행", "호주", "시드니",
    "travel", "travelgram", "traveling", "travelling", "trip", "vacation", "holiday", "wanderlust", "hotel", "resort", "airbnb", "camping",
    "roadtrip", "japan", "tokyo", "osaka", "bali", "paris", "europe", "beach"
  ],
  "요리": [
    "레시피", "요리", "요리스타그램", "요리레시피", "집밥", "집밥레시피", "자취요리", "자취생요리", "혼밥", "반찬", "밑반찬", "밥반찬", "한그릇요리",
    "간단요리", "초간단", "초간단레시피", "10분요리", "5분요리", "전자레인지요리", "에어프라이어", "만드는법", "만들기", "황금레시피",
    "백종원", "양념", "소스", "드레싱", "볶음밥", "덮밥", "비빔밥", "김밥", "주먹밥", "찌개", "된장찌개", "김치찌개", "국물", "전골",
    "볶음", "조림", "무침", "구이", "튀김", "부침개", "파스타레시피", "샌드위치", "토스트", "샐러드", "계란요리", "계란", "두부요리",
    "닭가슴살", "다이어트식단", "다이어트레시피", "식단", "식단관리", "저탄고지", "키토", "비건", "밀프렙", "도시락", "술안주", "안주",
    "베이킹", "홈베이킹", "쿠키", "브라우니", "케이크만들기", "빵만들기", "디저트만들기", "홈카페", "음료레시피", "에이드", "하이볼레시피",
    "recipe", "recipes", "cooking", "cook", "homecooking", "homemade", "baking", "bake", "easyrecipe", "mealprep", "healthyfood", "vegan",
    "kitchen", "chef", "airfryer", "breakfast", "lunch", "dinner"
  ],
  "쇼핑·뷰티": [
    "추천템", "꿀템", "필수템", "인생템", "꿀템추천", "살림템", "자취템", "아이템", "쇼핑", "쇼핑리스트", "장바구니", "득템", "핫딜", "최저가", "할인",
    "세일", "블프", "블랙프라이데이", "쿠팡", "쿠팡추천", "쿠팡템", "다이소", "다이소추천", "다이소꿀템", "올리브영", "올영", "올영세일", "무신사",
    "이케아", "코스트코", "트레이더스", "알리", "테무", "언박싱", "하울", "리뷰", "내돈내산", "솔직후기", "광고아님", "구매", "구매처",
    "뷰티", "화장품", "코스메틱", "스킨케어", "기초", "토너", "세럼", "앰플", "선크림", "썬크림", "선스틱", "클렌징", "클렌징오일",
    "마스크팩", "메이크업", "쿠션", "파운데이션", "컨실러", "립스틱", "틴트", "아이섀도", "섀도우", "아이라이너", "마스카라",
    "블러셔", "하이라이터", "향수", "바디로션", "헤어", "헤어케어", "샴푸", "트리트먼트", "고데기", "드라이기", "네일", "젤네일", "피부관리",
    "여드름", "모공", "피부과", "미백", "주름", "퍼스널컬러", "웜톤", "쿨톤", "가전", "생활가전",
    "haul", "unboxing", "skincare", "makeup", "beauty", "cosmetics", "kbeauty", "sunscreen", "serum", "lipstick", "perfume", "haircare",
    "nails", "shopping", "musthave", "amazonfinds", "review", "grwm"
  ],
  "패션": [
    "패션", "코디", "코디추천", "데일리룩", "데일리코디", "오오티디", "오늘의코디", "룩북", "스타일링", "출근룩", "하객룩", "데이트룩", "여행룩",
    "캠퍼스룩", "남자코디", "여자코디", "남친룩", "여친룩", "커플룩", "꾸안꾸", "미니멀룩", "스트릿", "스트릿패션", "아메카지", "빈티지", "구제",
    "고프코어", "올드머니", "클래식룩", "캐주얼", "셔츠", "니트", "가디건", "맨투맨", "후드티", "자켓", "블레이저", "코트", "패딩", "점퍼",
    "트렌치코트", "청바지", "데님", "슬랙스", "와이드팬츠", "치마", "스커트", "원피스", "신발", "스니커즈", "로퍼", "부츠", "구두", "운동화",
    "가방", "백팩", "토트백", "에코백", "모자", "볼캡", "액세서리", "목걸이", "반지", "귀걸이", "시계", "안경", "선글라스", "무신사코디",
    "29cm", "지그재그", "에이블리", "유니클로", "자라", "옷추천", "옷잘입는법", "체형별코디", "키작남", "키작녀",
    "ootd", "outfit", "outfits", "outfitideas", "lookbook", "fashion", "style", "styling", "streetwear", "streetstyle", "menswear",
    "womenswear", "vintage", "oldmoney", "minimal", "sneakers"
  ],
  "공부·자기계발": [
    "공부", "공부자극", "공스타그램", "공부법", "공부계획", "공부기록", "스터디", "스터디플래너", "열품타", "뽀모도로", "집중", "암기", "암기법",
    "시험", "시험공부", "중간고사", "기말고사", "수능", "공시", "공무원", "임용", "자격증", "토익", "토플", "오픽", "토스", "아이엘츠", "한능검",
    "컴활", "영어", "영어공부", "영어회화", "회화", "영단어", "영어표현", "원어민", "미드영어", "일본어", "중국어", "스페인어", "외국어",
    "자기계발", "갓생", "갓생살기", "미라클모닝", "루틴", "모닝루틴", "나이트루틴", "습관", "습관만들기", "생산성", "시간관리", "목표", "동기부여",
    "마인드셋", "멘탈", "자존감", "독서", "책추천", "책스타그램", "북스타그램", "독서기록", "필사", "글쓰기", "일기", "다이어리", "플래너",
    "노션", "노션템플릿", "엑셀", "엑셀꿀팁", "ppt", "피피티", "취업", "취준", "취준생", "이직", "면접", "자소서", "포트폴리오", "커리어",
    "직장인", "대학생", "강의", "인강", "세미나", "강연",
    "study", "studygram", "studywithme", "studytips", "english", "learnenglish", "productivity", "notion", "motivation", "selfimprovement",
    "selfcare", "habits", "routine", "morningroutine", "books", "booktok", "bookstagram", "career", "interview", "resume"
  ],
  "IT·테크": [
    "전자기기", "가젯", "아이폰", "아이폰꿀팁", "아이패드", "맥북", "맥미니", "애플워치", "에어팟", "갤럭시", "갤럭시탭", "삼성",
    "노트북", "태블릿", "스마트폰", "데스크셋업", "책상셋업", "데스크테리어", "키보드", "기계식키보드", "마우스", "모니터", "충전기", "보조배터리",
    "앱추천", "어플추천", "유용한앱", "단축어", "단축키", "윈도우", "맥os", "ios", "안드로이드", "크롬", "확장프로그램", "사이트추천", "유용한사이트",
    "ai", "인공지능", "챗gpt", "chatgpt", "gpt", "클로드", "claude", "제미나이", "gemini", "미드저니", "생성형ai", "ai툴", "자동화", "노코드",
    "코딩", "개발", "개발자", "프로그래밍", "파이썬", "자바스크립트", "웹개발", "앱개발", "웹사이트", "홈페이지", "프론트엔드", "백엔드",
    "디자인", "ui", "ux", "피그마", "포토샵", "일러스트", "영상편집", "프리미어", "캡컷", "카메라", "유튜버장비",
    "tech", "gadget", "gadgets", "iphone", "ipad", "macbook", "mac", "macmini", "applewatch", "airpods", "android", "samsung", "laptop",
    "desksetup", "setup", "workspace", "wfh", "keyboard", "mechanicalkeyboard", "apps", "app", "software", "ai", "chatgpt", "openai",
    "coding", "code", "programming", "programmer", "developer", "webdev", "webdeveloper", "webdevelopment", "webdesign", "website",
    "frontend", "backend", "javascript", "python", "design", "uidesign", "uxdesign", "figma", "automation", "nocode", "startup"
  ],
  "재테크": [
    "재테크", "돈관리", "돈모으기", "저축", "절약", "짠테크", "앱테크", "가계부", "월급", "월급관리", "통장쪼개기", "비상금", "종잣돈", "목돈",
    "적금", "예금", "파킹통장", "cma", "주식", "주린이", "국내주식", "미국주식", "해외주식", "투자", "투자공부", "가치투자", "배당", "배당주",
    "etf", "s&p500", "나스닥", "코스피", "isa", "연금저축", "irp", "연금", "부동산", "청약", "내집마련", "전세", "월세", "대출", "금리", "환율",
    "경제", "경제공부", "경제뉴스", "코인", "비트코인", "이더리움", "가상화폐", "부업", "n잡", "투잡", "파이프라인", "수익화", "부수입", "사업",
    "창업", "스마트스토어", "온라인부업", "세금", "연말정산", "절세", "신용카드", "카드추천", "보험",
    "finance", "money", "investing", "invest", "investment", "stock", "stocks", "stockmarket", "dividend", "crypto", "bitcoin", "budget",
    "saving", "savings", "passiveincome", "sidehustle", "realestate", "wealth", "financialfreedom"
  ],
  "꿀팁·생활": [
    "꿀팁", "생활꿀팁", "생활팁", "살림꿀팁", "자취꿀팁", "알아두면좋은", "알아두면", "모르면손해", "유용한정보", "정보공유", "하는법", "하는방법",
    "정리법", "정리정돈", "수납", "수납정리", "청소", "청소꿀팁", "대청소", "세탁", "빨래", "얼룩제거", "살림", "살림스타그램", "주부",
    "자취", "자취생", "자취방", "원룸", "인테리어", "셀프인테리어", "방꾸미기", "집꾸미기", "홈스타일링", "오늘의집", "이사", "이사꿀팁",
    "육아", "육아꿀팁", "아기", "신생아", "임신", "출산", "건강정보", "건강꿀팁", "숙면", "수면", "생활습관", "안전", "응급처치",
    "lifehack", "lifehacks", "tips", "tip", "hack", "hacks", "howto", "diy", "cleaning", "organization", "organizing", "homedecor",
    "interior", "interiordesign", "roomdecor", "parenting", "momlife"
  ],
  "영화·음악": [
    "노래", "음악", "노래추천", "음악추천", "플레이리스트", "플리", "노동요", "감성노래", "커버", "노래커버", "커버곡", "가사", "라이브", "버스킹",
    "콘서트", "페스티벌", "케이팝", "아이돌", "직캠", "안무", "댄스", "챌린지", "피아노", "작곡", "힙합", "밴드", "인디",
    "영화", "영화추천", "인생영화", "명장면", "명대사", "드라마", "드라마추천", "인생드라마", "넷플릭스", "넷플릭스추천", "디즈니플러스", "티빙",
    "쿠팡플레이", "왓챠", "예능", "애니", "애니메이션", "지브리", "웹툰", "만화", "책리뷰", "공연", "뮤지컬", "전시회", "전시",
    "kpop", "playlist", "music", "song", "songs", "cover", "singing", "piano", "guitar", "dance", "dancechallenge", "concert", "movie",
    "movies", "film", "netflix", "kdrama", "drama", "anime", "ghibli"
  ],
  "반려동물": [
    "반려동물", "반려견", "반려묘", "강아지", "댕댕이", "댕스타그램", "멍스타그램", "개스타그램", "퍼피", "강아지산책", "강아지훈련", "강아지간식",
    "고양이", "냥이", "냥스타그램", "고양이스타그램", "집사", "냥집사", "멍집사", "애견", "애묘", "펫", "펫스타그램", "랜선집사", "동물", "귀여운동물",
    "햄스터", "토끼", "앵무새", "고슴도치", "말티즈", "푸들", "포메", "비숑", "시바견", "웰시코기", "골든리트리버", "진돗개", "치와와", "닥스훈트",
    "코숏", "러시안블루", "브리티시숏헤어", "먼치킨", "스코티시폴드", "랙돌",
    "dog", "dogs", "dogsofinstagram", "puppy", "puppies", "cat", "cats", "catsofinstagram", "kitten", "pet", "pets", "petsofinstagram",
    "doglover", "catlover", "animals"
  ],
  "유머": [
    "웃긴", "웃긴영상", "웃음", "개웃", "개웃김", "빵터짐", "웃참", "웃참챌린지", "ㅋㅋㅋ", "ㅋㅋㅋㅋ", "레전드", "레전드영상", "밈", "짤", "짤방",
    "킹받", "킹받네", "공감", "공감짤", "현실고증", "현웃", "드립", "개그", "콩트", "몰카", "상황극", "패러디", "성대모사", "병맛", "어이없",
    "funny", "funnyvideos", "meme", "memes", "comedy", "lol", "lmao", "humor", "joke", "jokes", "relatable", "prank", "skit"
  ]
};

// 이모지 단서 (낱말보다 약하게 점수)
export const EMOJI = {
  "운동": ["🏋", "💪", "🏃", "🧘", "🤸", "🚴", "🏊", "⛹", "🎾", "⛳", "🥊", "🧗", "👟"],
  "맛집·카페": ["☕", "🍰", "🧁", "🍩", "🥐", "🥯", "🍜", "🍣", "🍕", "🍔", "🥩", "🍷", "🍺", "🍸", "🍽"],
  "여행": ["✈", "🏝", "🏖", "🗺", "🧳", "🏕", "⛺", "🗼", "🌅", "🏨", "🚗", "🚄"],
  "요리": ["🍳", "🥘", "🍲", "🥗", "🔪", "🧑‍🍳", "👨‍🍳", "👩‍🍳", "🥄"],
  "쇼핑·뷰티": ["💄", "💅", "🛍", "🧴", "💋", "🛒"],
  "패션": ["👗", "👕", "👖", "🧥", "👜", "👠", "🧢", "👔"],
  "공부·자기계발": ["📚", "📖", "✏", "📝", "🎓", "📒"],
  "IT·테크": ["💻", "📱", "⌨", "🖥", "🤖", "🎧"],
  "재테크": ["💰", "💸", "📈", "📉", "💵", "🏦", "🪙"],
  "꿀팁·생활": ["💡", "🧹", "🧺", "🏠", "🛋"],
  "영화·음악": ["🎵", "🎶", "🎤", "🎸", "🎹", "🎬", "🍿", "🎧"],
  "반려동물": ["🐶", "🐕", "🐱", "🐈", "🐾", "🐹", "🐰", "🦜"],
  "유머": ["😂", "🤣", "😆", "😹"]
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
 *   category가 null이면 자신 없음 → 분류함
 */
export function classify(item, profile = {}, categories = DEFAULT_CATEGORIES) {
  const rawText = textOf(item);
  const text = rawText.toLowerCase();
  const tags = hashtagsOf(text);
  const tagText = tags.join(" ");
  const tokens = tokensOf(text);
  const learn = profile.learn || {};
  const authors = profile.authors || {};
  const author = ((item.preview && item.preview.author) || "").toLowerCase();
  const authorWords = author.split(/[^a-z]+/).filter(w => w.length >= 3);
  const scores = {};

  for (const cat of categories) {
    let sc = 0;
    // 기본 분류는 사전을, 사용자가 만든 분류는 이름 속 낱말을 단서로 써요
    const words = DICTIONARY[cat] ? DICTIONARY[cat] : cat.toLowerCase().split(/[·\s/]+/).filter(w => w.length >= 2);
    const seen = new Set();
    for (const kw of words) {
      if (seen.has(kw)) continue;
      if (tagText && hasWord(tagText, kw)) { sc += 3; seen.add(kw); }
      else if (hasWord(text, kw)) { sc += 1.5; seen.add(kw); }
    }
    for (const em of EMOJI[cat] || []) if (rawText.includes(em)) { sc += 0.75; break; }
    // 계정 이름 속 단어 (예: seoul_cafe_daily → cafe, fit.minji → fit)
    if (authorWords.length) for (const kw of words) if (/^[a-z]{3,}$/.test(kw) && authorWords.includes(kw)) { sc += 1.5; break; }
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
