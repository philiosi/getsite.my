/* getsite.my admin page demo: the data contract.
   Which admin menus a site gets follows its sections (the same ids as v5/data/sections.json).
   Everything here is fictional sample data; contacts use .example and districts only.
   admin.js reads this file and never changes it. */

export const STORAGE_KEY = 'getsite-admin-demo:v1';
export const SESSION_KEY = 'getsite-admin-demo:in';
export const IMAGE_MAX_BYTES = 1.5 * 1024 * 1024; // larger files are refused before reading
export const IMAGE_MAX_SIDE = 800; // stored images are scaled down to this longest side

/** Site sections, as the order page names them. */
export const SECTION_LABELS = {
  hero: '첫 장면', about: '소개', story: '브랜드·작가 이야기', gallery: '작품·제품 갤러리', featured: '대표작·대표 제품',
  history: '이력·연혁', process: '작업 과정', services: '서비스·가격 안내', trust: '후기·신뢰 근거', faq: '자주 묻는 질문',
  contact: '연락처·문의', booking: '예약·구매·결제', newsletter: '뉴스레터·소식',
};

/* Field types: text, textarea, number, url, email, select (options), checkbox, image.
   half: true puts two fields on one row on wide screens. readonly: shown, not editable.
   A list module's items each get a string `id` made by admin.js (seedFor makes the seed ids). */
export const MODULES = [
  { id: 'basic', title: '기본 정보', kind: 'form', always: true, hint: '사이트 이름, 소개 한 줄, 연락처처럼 모든 페이지에 쓰이는 정보입니다.',
    fields: [
      { key: 'siteName', label: '사이트 이름', type: 'text', required: true, half: true },
      { key: 'siteNameEn', label: '사이트 이름 (영문)', type: 'text', half: true },
      { key: 'tagline', label: '소개 한 줄', type: 'text', required: true },
      { key: 'email', label: '문의 이메일', type: 'email', required: true, half: true },
      { key: 'instagram', label: '인스타그램 주소', type: 'url', half: true },
      { key: 'area', label: '지역 (구·동까지)', type: 'text', half: true },
      { key: 'hours', label: '운영 시간', type: 'text', half: true },
    ] },
  { id: 'hero', title: '첫 장면', kind: 'form', sections: ['hero'], hint: '사이트를 열면 처음 보이는 제목과 대표 이미지입니다.',
    fields: [
      { key: 'title', label: '큰 제목', type: 'text', required: true },
      { key: 'subtitle', label: '작은 설명', type: 'textarea' },
      { key: 'image', label: '대표 이미지', type: 'image' },
      { key: 'button', label: '버튼 문구', type: 'text', half: true },
    ] },
  { id: 'intro', title: '소개·이야기', kind: 'form', sections: ['about', 'story'], hint: '소개 문단과 이야기 문단입니다. 영문은 비워 두면 영문 페이지에서 숨깁니다.',
    fields: [
      { key: 'bodyKo', label: '소개 (한글)', type: 'textarea', required: true },
      { key: 'bodyEn', label: '소개 (영문)', type: 'textarea' },
      { key: 'portrait', label: '소개 사진', type: 'image' },
    ] },
  { id: 'works', title: '작품·제품', kind: 'list', sections: ['gallery', 'featured'], hint: '갤러리에 보이는 항목입니다. "대표"를 켜면 대표작 영역에도 나옵니다.', addLabel: '새 항목 등록',
    columns: ['image', 'titleKo', 'year', 'featured'],
    fields: [
      { key: 'image', label: '사진', type: 'image' },
      { key: 'titleKo', label: '이름 (한글)', type: 'text', required: true, half: true },
      { key: 'titleEn', label: '이름 (영문)', type: 'text', half: true },
      { key: 'year', label: '연도', type: 'number', half: true },
      { key: 'size', label: '크기·규격', type: 'text', half: true },
      { key: 'material', label: '재료·설명', type: 'text' },
      { key: 'price', label: '가격 (원, 판매할 때만)', type: 'number', half: true },
      { key: 'featured', label: '대표 항목으로 보이기', type: 'checkbox', half: true },
      { key: 'order', label: '정렬 순서', type: 'number', half: true },
    ] },
  { id: 'history', title: '이력·연혁', kind: 'list', sections: ['history'], hint: '전시, 수상, 경력처럼 연도별로 쌓이는 기록입니다.', addLabel: '새 이력 등록',
    columns: ['year', 'titleKo', 'place'],
    fields: [
      { key: 'year', label: '연도', type: 'number', required: true, half: true },
      { key: 'kind', label: '구분', type: 'select', options: ['개인전', '단체전', '수상', '경력', '기타'], half: true },
      { key: 'titleKo', label: '제목 (한글)', type: 'text', required: true },
      { key: 'titleEn', label: '제목 (영문)', type: 'text' },
      { key: 'place', label: '장소', type: 'text', half: true },
      { key: 'order', label: '정렬 순서', type: 'number', half: true },
    ] },
  { id: 'process', title: '작업 과정', kind: 'list', sections: ['process'], hint: '작업이 어떻게 진행되는지 단계별로 보여줍니다.', addLabel: '새 단계 등록',
    columns: ['order', 'title'],
    fields: [
      { key: 'order', label: '단계 번호', type: 'number', required: true, half: true },
      { key: 'title', label: '단계 이름', type: 'text', required: true, half: true },
      { key: 'body', label: '설명', type: 'textarea' },
      { key: 'image', label: '사진', type: 'image' },
    ] },
  { id: 'services', title: '서비스·가격', kind: 'list', sections: ['services'], hint: '메뉴, 수업, 상품 구성처럼 가격과 함께 안내하는 항목입니다.', addLabel: '새 항목 등록',
    columns: ['name', 'price', 'visible'],
    fields: [
      { key: 'name', label: '이름', type: 'text', required: true, half: true },
      { key: 'price', label: '가격 (원)', type: 'number', half: true },
      { key: 'desc', label: '설명', type: 'textarea' },
      { key: 'visible', label: '사이트에 보이기', type: 'checkbox', half: true },
      { key: 'order', label: '정렬 순서', type: 'number', half: true },
    ] },
  { id: 'reviews', title: '후기', kind: 'list', sections: ['trust'], hint: '받은 후기 중 사이트에 보일 것을 고릅니다.', addLabel: '새 후기 등록',
    columns: ['name', 'body', 'visible'],
    fields: [
      { key: 'name', label: '작성자 표시', type: 'text', required: true, half: true },
      { key: 'visible', label: '사이트에 보이기', type: 'checkbox', half: true },
      { key: 'body', label: '후기 내용', type: 'textarea', required: true },
    ] },
  { id: 'faq', title: '자주 묻는 질문', kind: 'list', sections: ['faq'], hint: '질문과 답을 순서대로 보여줍니다.', addLabel: '새 질문 등록',
    columns: ['q', 'order'],
    fields: [
      { key: 'q', label: '질문', type: 'text', required: true },
      { key: 'a', label: '답변', type: 'textarea', required: true },
      { key: 'order', label: '정렬 순서', type: 'number', half: true },
    ] },
  { id: 'inbox', title: '문의함', kind: 'list', sections: ['contact'], hint: '사이트 문의 양식으로 들어온 글입니다. 처리 상태만 바꿀 수 있습니다.', canCreate: false,
    columns: ['date', 'name', 'status'],
    fields: [
      { key: 'date', label: '받은 날짜', type: 'text', readonly: true, half: true },
      { key: 'name', label: '보낸 사람', type: 'text', readonly: true, half: true },
      { key: 'body', label: '내용', type: 'textarea', readonly: true },
      { key: 'status', label: '처리 상태', type: 'select', options: ['새 문의', '답변함', '보관'], half: true },
    ] },
  { id: 'bookings', title: '예약·주문', kind: 'list', sections: ['booking'], hint: '들어온 예약과 주문의 상태를 관리합니다.', canCreate: false,
    columns: ['date', 'name', 'item', 'status'],
    fields: [
      { key: 'date', label: '날짜', type: 'text', readonly: true, half: true },
      { key: 'name', label: '이름', type: 'text', readonly: true, half: true },
      { key: 'item', label: '예약·주문 내용', type: 'text', readonly: true },
      { key: 'status', label: '상태', type: 'select', options: ['확인 전', '확정', '완료', '취소'], half: true },
    ] },
  { id: 'news', title: '소식', kind: 'list', sections: ['newsletter'], hint: '소식 페이지와 구독 메일에 쓰는 글입니다.', addLabel: '새 소식 쓰기',
    columns: ['date', 'title', 'visible'],
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'date', label: '날짜 (예: 2026-11-09)', type: 'text', required: true, half: true },
      { key: 'visible', label: '사이트에 보이기', type: 'checkbox', half: true },
      { key: 'body', label: '내용', type: 'textarea', required: true },
    ] },
  { id: 'backup', title: '백업·내보내기', kind: 'backup', always: true, hint: '데이터 상태를 확인하고, 파일로 내보내거나 다시 불러옵니다.' },
];

const img = (sample, name) => `/v5/assets/samples/${sample}/${name}-640.webp`;

/** A site type: its sections and fictional starting data. Keys of `data` are module ids. */
export const PRESETS = [
  { id: 'artist', name: '작가·전시', sample: '화가 윤서현',
    sections: ['hero', 'about', 'gallery', 'featured', 'history', 'contact'],
    data: {
      basic: { siteName: '윤서현', siteNameEn: 'Yoon Seohyun', tagline: '기억 속 풍경을 그리는 화가', email: 'studio@yoon.example', instagram: '', area: '서울 성북구', hours: '' },
      hero: { title: '기억의 풍경', subtitle: '2026 개인전, 11월 한 달 동안', image: img('artist', 'hero'), button: '작품 보기' },
      intro: { bodyKo: '오래 머문 장소의 빛과 색을 기억으로 다시 그립니다.', bodyEn: 'Painting light and colour of places remembered.', portrait: '' },
      works: [
        { titleKo: '오후의 언덕', titleEn: 'Afternoon Hill', year: 2026, size: '72.7×60.6cm', material: '캔버스에 유채', price: '', featured: true, order: 1, image: img('artist', 'hero') },
        { titleKo: '바다 쪽 창', titleEn: 'Window to the Sea', year: 2025, size: '53×45.5cm', material: '캔버스에 유채', price: '', featured: false, order: 2, image: '' },
        { titleKo: '겨울 정원', titleEn: 'Winter Garden', year: 2025, size: '40.9×31.8cm', material: '종이에 과슈', price: '', featured: false, order: 3, image: '' },
      ],
      history: [
        { year: 2026, kind: '개인전', titleKo: '기억의 풍경', titleEn: 'Landscapes of Memory', place: '예시 갤러리', order: 1 },
        { year: 2025, kind: '단체전', titleKo: '봄의 색', titleEn: 'Colours of Spring', place: '예시 미술관', order: 2 },
      ],
      inbox: [
        { date: '2026-11-07', name: '예시 방문자', body: '작품 구매 문의드립니다.', status: '새 문의' },
      ],
    } },
  { id: 'place', name: '카페·공간', sample: '카페 느린오후',
    sections: ['hero', 'story', 'services', 'gallery', 'faq', 'contact', 'booking'],
    data: {
      basic: { siteName: '느린오후', siteNameEn: 'Slow Afternoon', tagline: '천천히 머무는 동네 카페', email: 'hello@slow.example', instagram: '', area: '서울 마포구 망원동', hours: '매일 11:00–21:00, 화요일 휴무' },
      hero: { title: '오후를 천천히', subtitle: '직접 굽는 디저트와 핸드드립', image: img('cafe', 'hero'), button: '메뉴 보기' },
      intro: { bodyKo: '골목 안쪽 작은 카페입니다.', bodyEn: '', portrait: img('cafe', 'story') },
      services: [
        { name: '핸드드립', price: 6000, desc: '그날의 원두로 내립니다.', visible: true, order: 1 },
        { name: '바스크 치즈케이크', price: 7000, desc: '매일 오전에 굽습니다.', visible: true, order: 2 },
      ],
      works: [
        { titleKo: '창가 자리', titleEn: '', year: '', size: '', material: '', price: '', featured: true, order: 1, image: img('cafe', 'gallery') },
      ],
      faq: [
        { q: '주차할 수 있나요?', a: '주차 공간은 없습니다. 근처 공영주차장을 이용해 주세요.', order: 1 },
        { q: '단체 예약이 되나요?', a: '8명까지 예약을 받습니다.', order: 2 },
      ],
      inbox: [{ date: '2026-11-08', name: '예시 손님', body: '대관이 가능한가요?', status: '새 문의' }],
      bookings: [{ date: '2026-11-12', name: '예시 손님', item: '토요일 15시, 6명', status: '확인 전' }],
    } },
  { id: 'class', name: '클래스·교육', sample: '그림공방 하루',
    sections: ['hero', 'about', 'services', 'trust', 'faq', 'contact', 'booking'],
    data: {
      basic: { siteName: '그림공방 하루', siteNameEn: 'Haru Drawing Studio', tagline: '처음 그리는 사람을 위한 그림 수업', email: 'class@haru.example', instagram: '', area: '경기 성남시 분당구', hours: '평일 10:00–20:00' },
      hero: { title: '하루 한 장, 그림 수업', subtitle: '재료는 모두 준비되어 있어요', image: img('haru', 'hero'), button: '수업 보기' },
      intro: { bodyKo: '소수 정원으로 천천히 배우는 공방입니다.', bodyEn: '', portrait: '' },
      services: [
        { name: '원데이 드로잉', price: 45000, desc: '2시간, 재료 포함', visible: true, order: 1 },
        { name: '4주 수채화', price: 160000, desc: '주 1회 2시간', visible: true, order: 2 },
      ],
      reviews: [{ name: '예시 수강생', body: '처음인데도 한 장을 끝까지 그렸어요.', visible: true }],
      faq: [{ q: '준비물이 있나요?', a: '없습니다. 앞치마만 챙기셔도 됩니다.', order: 1 }],
      bookings: [{ date: '2026-11-15', name: '예시 수강생', item: '원데이 드로잉, 2명', status: '확정' }],
    } },
  { id: 'product', name: '제품·브랜드', sample: '친환경 비누 거품숲',
    sections: ['hero', 'story', 'gallery', 'trust', 'faq', 'booking', 'newsletter'],
    data: {
      basic: { siteName: '거품숲', siteNameEn: 'Bubble Forest', tagline: '손으로 만드는 친환경 비누', email: 'shop@bubble.example', instagram: '', area: '', hours: '' },
      hero: { title: '숲에서 온 거품', subtitle: '플라스틱 없는 포장', image: img('soap', 'hero'), button: '제품 보기' },
      intro: { bodyKo: '저온 숙성으로 4주 동안 만듭니다.', bodyEn: '', portrait: '' },
      works: [
        { titleKo: '쑥 비누', titleEn: 'Mugwort Soap', year: '', size: '100g', material: '쑥, 올리브유', price: 9000, featured: true, order: 1, image: img('soap', 'hero') },
        { titleKo: '라벤더 비누', titleEn: 'Lavender Soap', year: '', size: '100g', material: '라벤더, 코코넛유', price: 9000, featured: false, order: 2, image: '' },
      ],
      reviews: [{ name: '예시 구매자', body: '향이 순하고 오래가요.', visible: true }],
      faq: [{ q: '배송은 얼마나 걸리나요?', a: '주문 후 2–3일 안에 보냅니다.', order: 1 }],
      bookings: [{ date: '2026-11-08', name: '예시 구매자', item: '쑥 비누 3개', status: '확인 전' }],
      news: [{ title: '겨울 한정 비누 출시', date: '2026-11-01', visible: true, body: '유자 향 비누를 한정으로 만듭니다.' }],
    } },
  { id: 'studio', name: '포트폴리오·스튜디오', sample: '브랜드 디자이너 김지우',
    sections: ['hero', 'about', 'featured', 'process', 'services', 'contact'],
    data: {
      basic: { siteName: '김지우 디자인', siteNameEn: 'Jiwoo Kim Design', tagline: '작은 브랜드의 첫 인상을 만듭니다', email: 'work@jiwoo.example', instagram: '', area: '서울 성동구', hours: '' },
      hero: { title: '브랜드의 첫 인상', subtitle: '로고, 패키지, 웹', image: img('portfolio', 'hero'), button: '작업 보기' },
      intro: { bodyKo: '10년 동안 작은 브랜드와 일했습니다.', bodyEn: '', portrait: '' },
      works: [
        { titleKo: '예시 베이커리 브랜딩', titleEn: 'Bakery Branding', year: 2026, size: '', material: '로고, 패키지', price: '', featured: true, order: 1, image: img('portfolio', 'hero') },
      ],
      process: [
        { order: 1, title: '인터뷰', body: '브랜드의 이야기를 듣습니다.', image: '' },
        { order: 2, title: '시안', body: '세 가지 방향을 보여드립니다.', image: '' },
      ],
      services: [{ name: '로고 디자인', price: 1500000, desc: '시안 3종, 수정 2회', visible: true, order: 1 }],
      inbox: [{ date: '2026-11-06', name: '예시 의뢰인', body: '패키지 디자인 견적 문의', status: '답변함' }],
    } },
];

/** Admin modules shown for a set of sections, in MODULES order. */
export function modulesFor(sections) {
  const on = new Set(sections);
  return MODULES.filter((m) => m.always || (m.sections || []).some((s) => on.has(s)));
}

/** A fresh state for a preset: deep-copied data, every module present (lists empty when the preset has none). */
export function seedFor(presetId) {
  const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0];
  const data = JSON.parse(JSON.stringify(p.data));
  for (const m of MODULES) {
    if (m.kind === 'list') data[m.id] = (data[m.id] || []).map((it, i) => ({ id: `${m.id}-${i + 1}`, ...it }));
    else if (m.kind === 'form' && !data[m.id]) data[m.id] = {};
  }
  return { version: 1, preset: p.id, sections: [...p.sections], data, savedAt: null };
}
