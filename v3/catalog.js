/* Everything a customer can choose, and what each choice means for Muse.
   IDs are a contract: a saved order stores catalogVersion and these IDs.
   Bump CATALOG_VERSION when the meaning of an ID changes. */

export const CATALOG_VERSION = '2026-11-v1';

const a = (path) => new URL(`./assets/${path}`, import.meta.url).href;

const work = (id, file, title, year, cat, ratio, alt) => ({ id, src: a(file), title, year, cat, ratio, alt });

export const CONCEPTS = [
  {
    id: 'atelier',
    name: '작업실',
    hint: '작가 · 공방 · 전시',
    site: '윤서현',
    siteEn: 'Seohyun Yoon',
    tagline: '산의 기억, 빛의 기록',
    about: '흙과 물감을 오가며 풍경의 시간을 쌓습니다. 작품과 전시 소식을 이곳에 모읍니다.',
    contactLine: '전시와 소장 문의',
    galleryTitle: '작품',
    tokens: {
      paper: 'oklch(95.5% 0.012 80)',
      paper2: 'oklch(90% 0.018 78)',
      ink: 'oklch(24% 0.018 60)',
      muted: 'oklch(46% 0.02 65)',
      accent: 'oklch(50% 0.13 40)',
      night: 'oklch(24% 0.025 160)',
      onNight: 'oklch(93% 0.012 80)',
      fontDisplay: '"Noto Serif KR", "Apple SD Gothic Neo", serif',
      weightDisplay: 300,
      trackDisplay: '-0.06em',
    },
    works: [
      work('a1', 'atelier/w1.webp', '흙의 기억', '2026', '도예 · 연작', 880 / 588, '흰 유약과 회청이 겹층을 이룬 도자기 항아리'),
      work('a2', 'atelier/w2.webp', '파도의 결', '2025', '회화', 880 / 588, '짙은 파랑과 흰색 물감이 파도처럼 겹친 추상화'),
      work('a3', 'atelier/w3.webp', '지층의 시간', '2025', '회화', 880 / 588, '테라코타와 황토색 층이 수평으로 쌓인 추상화'),
      work('a4', 'atelier/w4.webp', '달항아리, 백', '2024', '도예', 1, '따뜻한 회색 배경 앞의 둥근 백자 달항아리'),
      work('a5', 'atelier/w5.webp', '손의 온도', '2024', '과정 기록', 880 / 588, '물레 위에서 붉은 흙을 빚는 손'),
      work('a6', 'atelier/w6.webp', '청자의 방', '2023', '도예', 880 / 588, '나무 선반 위에 놓인 청자 화병들'),
    ],
    plates: [a('atelier/p1.webp'), a('atelier/p2.webp'), a('atelier/p3.webp'), a('atelier/p4.webp'), a('atelier/p5.webp')],
    film: {
      word: '윤서현',
      lines: [
        { title: '산의 기억', body: '능선 위로 빛이 천천히 내려앉습니다.' },
        { title: '겹치고, 덜어내고', body: '물감과 흙은 시간을 쌓는 같은 재료입니다.' },
        { title: '빛의 기록', body: '2026 개인전' },
      ],
    },
    anchor: {
      center: a('atelier/w4.webp'),
      cutout: false,
      bundles: [
        { word: '흙', bg: 'oklch(84% 0.03 70)', ink: 'oklch(30% 0.05 50)', orbs: [a('atelier/w3.webp'), a('atelier/w5.webp')] },
        { word: '물', bg: 'oklch(82% 0.035 235)', ink: 'oklch(30% 0.08 250)', orbs: [a('atelier/w2.webp'), a('atelier/p4.webp')] },
        { word: '불', bg: 'oklch(72% 0.09 45)', ink: 'oklch(26% 0.07 35)', orbs: [a('atelier/p1.webp'), a('atelier/w3.webp')] },
      ],
    },
    sections: ['hero', 'about', 'gallery', 'history', 'contact'],
    real: ['hansakim', 'artist', 'haru'],
  },
  {
    id: 'brand',
    name: '브랜드',
    hint: '제품 · 상점 · 수공예',
    site: '거품숲',
    siteEn: 'Foam Forest',
    tagline: '씻는 시간을 숲으로',
    about: '식물과 해조로 만든 비누를 작은 단위로 만듭니다. 성분과 과정을 그대로 보여드립니다.',
    contactLine: '구매와 입점 문의',
    galleryTitle: '제품',
    tokens: {
      paper: '#f5f2ea',
      paper2: '#ede8db',
      ink: '#14231c',
      muted: '#44544b',
      accent: '#0b6e57',
      night: '#044e3b',
      onNight: 'oklch(95% 0.02 130)',
      fontDisplay: '"Outfit", "Pretendard Variable", sans-serif',
      weightDisplay: 700,
      trackDisplay: '-0.04em',
    },
    works: [
      work('b1', 'brand/w1.webp', '손 안의 거품', '2026', '사용 장면', 1400 / 1022, '두 손 안에서 거품이 이는 녹색 비누'),
      work('b2', 'brand/w2.webp', '선물 상자', '2026', '패키지', 1400 / 1022, '크라프트 상자 속 대팻밥 위에 놓인 녹색 비누'),
      work('b3', 'brand/w3.webp', '4종 세트', '2026', '패키지', 1400 / 934, '녹색 상자에 담긴 비누 네 가지'),
      work('b4', 'brand/w4.webp', '숲과 바다', '2026', '세트', 1400 / 934, '나무 트레이에 놓인 녹색과 파란색 비누'),
      work('b5', 'brand/w5.webp', '숲 비누', '2026', '제품', 1000 / 736, '허브 조각이 박힌 짙은 녹색 비누'),
      work('b6', 'brand/w6.webp', '바다 비누', '2026', '제품', 1000 / 756, '파도 무늬가 있는 파란색 비누'),
    ],
    plates: [a('brand/w1.webp'), a('brand/w3.webp'), a('brand/w4.webp'), a('brand/w2.webp'), a('brand/w1.webp')],
    film: {
      word: '거품숲',
      lines: [
        { title: '숲에서 온 것', body: '유칼립투스와 타임을 그대로 넣었습니다.' },
        { title: '손으로 자른 한 장', body: '작은 단위로 굳히고 자릅니다.' },
        { title: '씻는 시간', body: '오늘 저녁부터 숲으로.' },
      ],
    },
    anchor: {
      center: a('brand/w5.webp'),
      cutout: true,
      bundles: [
        { word: 'Eucalyptus', bg: 'oklch(90% 0.04 150)', ink: 'oklch(32% 0.07 160)', center: a('brand/w5.webp'), orbs: [a('brand/o1.webp'), a('brand/o3.webp')] },
        { word: 'Seaweed', bg: 'oklch(84% 0.05 235)', ink: 'oklch(30% 0.08 245)', center: a('brand/w6.webp'), orbs: [a('brand/o2.webp'), a('brand/o5.webp')] },
        { word: 'Thyme', bg: 'oklch(92% 0.06 115)', ink: 'oklch(36% 0.08 135)', center: a('brand/w5.webp'), orbs: [a('brand/o4.webp'), a('brand/o6.webp')] },
      ],
    },
    sections: ['hero', 'story', 'gallery', 'process', 'contact'],
    real: ['soap'],
  },
  {
    id: 'studio',
    name: '스튜디오',
    hint: '포트폴리오 · 서비스',
    site: '스튜디오 결',
    siteEn: 'Studio Gyeol',
    tagline: '복잡한 이야기를 한 장의 화면으로',
    about: '브랜드의 첫인상을 정리하는 작은 디자인 스튜디오입니다. 범위와 조건을 먼저 공개합니다.',
    contactLine: '협업 문의',
    galleryTitle: '프로젝트',
    tokens: {
      paper: 'oklch(98.5% 0.002 260)',
      paper2: 'oklch(93% 0.006 260)',
      ink: 'oklch(19% 0.01 265)',
      muted: 'oklch(46% 0.01 265)',
      accent: 'oklch(44% 0.2 264)',
      night: 'oklch(30% 0.16 264)',
      onNight: 'oklch(97% 0.005 260)',
      fontDisplay: '"Archivo", "Pretendard Variable", sans-serif',
      weightDisplay: 700,
      trackDisplay: '-0.035em',
    },
    works: [
      work('s1', 'studio/w1.webp', '붓의 리듬', '2026', '공간 그래픽', 1400 / 934, '어두운 카페 벽에 걸린 파란 붓 그래픽'),
      work('s2', 'studio/w2.webp', '창가의 진열', '2025', '브랜드', 1400 / 934, '파란 그래픽이 걸린 창가의 포장재 진열'),
      work('s3', 'studio/w3.webp', '작업대', '2025', '과정', 1400 / 934, '색 견본표 위에 스케치하는 손'),
      work('s4', 'studio/w4.webp', '패키지 시스템', '2025', '패키지', 1400 / 934, '파우치와 패턴 카드가 격자로 놓인 패키지'),
      work('s5', 'studio/w5.webp', '파우치 세부', '2024', '패키지', 1100 / 734, '크림·녹색·파란색 파우치의 세부'),
      work('s6', 'studio/w6.webp', '획의 세부', '2024', '그래픽', 1100 / 1056, '파란 붓 획을 가까이에서 본 모습'),
    ],
    plates: [a('studio/w1.webp'), a('studio/w2.webp'), a('studio/w3.webp'), a('studio/w4.webp'), a('studio/w1.webp')],
    film: {
      word: 'GYEOL',
      lines: [
        { title: '한 장으로 줄입니다', body: '이야기를 덜어내는 데서 시작합니다.' },
        { title: '공간까지 잇습니다', body: '화면, 패키지, 벽면을 같은 언어로.' },
        { title: '먼저 보여드립니다', body: '범위와 조건은 처음부터 공개합니다.' },
      ],
    },
    anchor: {
      center: a('studio/w4.webp'),
      cutout: false,
      bundles: [
        { word: 'Brand', bg: 'oklch(44% 0.2 264)', ink: 'oklch(97% 0.005 260)', orbs: [a('studio/w5.webp'), a('studio/w6.webp')] },
        { word: 'Space', bg: 'oklch(90% 0.02 80)', ink: 'oklch(30% 0.16 264)', orbs: [a('studio/w2.webp'), a('studio/w1.webp')] },
        { word: 'Print', bg: 'oklch(78% 0.05 160)', ink: 'oklch(24% 0.05 165)', orbs: [a('studio/w3.webp'), a('studio/w5.webp')] },
      ],
    },
    sections: ['hero', 'about', 'gallery', 'services', 'contact'],
    real: ['portfolio'],
  },
];

export const SCENES = [
  {
    id: 'film',
    name: '필름',
    hint: '글자가 창이 되어 열립니다',
    impl: 'v3/scenes/film.js',
    spec: {
      summary: '20초 4장면 자동재생 필름. 이름 글자가 굵어지다 사진을 비추는 창이 되고, 바탕이 걷혀 사진 장면으로 이어진다.',
      timing: '20초, 휠·드래그로 스크럽, 재생·정지·건너뛰기, 타임코드 표시',
      materials: '대표 이미지 3~4장, 이름, 장면별 한 줄 문구',
      fallback: '축소 모션 시 마지막 장면 정지 화면',
    },
  },
  {
    id: 'anchor',
    name: '하나를 중심으로',
    hint: '중심은 그대로, 세계가 바뀝니다',
    impl: 'v3/scenes/anchor.js',
    spec: {
      summary: '중앙 대상은 고정하고 대형 단어·배경색·전후경 오브젝트를 한 묶음으로 교체하는 끊김 없는 루프. 아치 틀 안에 대상을 둔다.',
      timing: '묶음당 약 2.4초, 드래그로 넘기면 속도를 이어받음, 포인터를 대면 멈춤',
      materials: '중심 대상 1개(배경 없는 이미지 권장), 묶음 3개(단어, 색, 원형 이미지 2장)',
      fallback: '축소 모션 시 크로스페이드, 자동 전환 없음',
    },
  },
  {
    id: 'glass',
    name: '유리 닦기',
    hint: '직접 닦아서 들여다봅니다',
    impl: 'v3/scenes/glass.js',
    spec: {
      summary: 'WebGL 김 서린 유리창. 포인터로 닦으면 안쪽 사진이 드러나고 천천히 다시 서린다. 버튼으로 스퀴지가 훑어 내려가 전부 걷힌다.',
      timing: '닦은 자리는 수 초에 걸쳐 다시 서림, 스퀴지 약 1.6초',
      materials: '대표 이미지 1장, 큰 한 줄 제목',
      fallback: 'WebGL 불가·축소 모션 시 흐린 이미지와 또렷한 이미지의 크로스페이드',
    },
  },
  {
    id: 'stack',
    name: '쌓고 펼치기',
    hint: '쌓인 작품을 펼치고 던져 봅니다',
    impl: 'v3/scenes/stack.js',
    spec: {
      summary: '작품 카드가 한 장씩 쌓인 뒤 기울며 부채꼴로 펼쳐진다. 드래그로 펼침 정도를 직접 조절하고 던지면 속도를 이어받는다.',
      timing: '쌓임 약 1.2초, 펼침 스프링, 드래그 1:1',
      materials: '이미지 6장',
      fallback: '축소 모션 시 펼친 상태로 정지',
    },
  },
];

const G = (id, name, core, hint, needs) => ({
  id,
  name,
  core,
  hint,
  impl: 'v3/gallery/layouts.js',
  spec: { needs, fallback: '자료가 부족하면 작품명만 표시하고 없는 정보는 지어내지 않는다.' },
});

export const GALLERIES = [
  G('focus', '한 점씩 크게', true, '한 점씩 크게, 옆으로 넘기기', '이미지, 작품명, 연도'),
  G('film', '옆으로 흘려 보기', true, '끌어서 흘려 보기', '이미지, 작품명'),
  G('masonry', '벽돌처럼 쌓기', true, '크기가 다른 벽돌 쌓기', '비율이 다양한 이미지'),
  G('index', '이름 목록', true, '이름 목록, 올리면 이미지', '작품명, 연도, 분류'),
  G('grid', '고른 격자', false, '고른 격자', '이미지'),
  G('strip', '눌러서 펼치기', false, '누른 칸이 넓어짐', '세로로 잘려도 되는 이미지'),
  G('flow', '이어서 읽기', false, '세로로 이어 읽기', '이미지, 짧은 글'),
  G('timeline', '연도 따라가기', false, '연도를 따라 이동', '연도가 있는 작품·이력'),
  G('coverflow', '돌려 넘기기', false, '다이얼을 돌려 입체로 넘기기', '이미지 5점 이상'),
  G('stack', '던져 넘기기', false, '맨 위 카드를 던지기', '이미지 3점 이상'),
  G('museum', '벽 둘러보기', false, '벽을 끌며 둘러보기', '작품 크기 정보(없으면 비율로 대체)'),
];

export const SECTION_LABELS = {
  hero: '첫 장면',
  about: '소개',
  story: '브랜드 이야기',
  gallery: '갤러리',
  history: '이력',
  process: '과정',
  services: '서비스와 조건',
  contact: '문의',
};

/* Real sites this service made. Shown as proof, opened in a new tab. */
export const REAL_SITES = {
  hansakim: { name: '도예가 김한사', url: 'https://hansakim.com/', label: '실제 운영 중' },
  artist: { name: '윤서현', url: 'https://getsite-artist.web.app/', label: '샘플' },
  haru: { name: '그림공방 하루', url: 'https://getsite-haru.web.app/', label: '샘플' },
  soap: { name: '거품숲', url: 'https://getsite-soap.web.app/', label: '샘플' },
  portfolio: { name: '브랜드 디자이너', url: 'https://getsite-portfolio.web.app/', label: '샘플' },
};

/* Published prices on the current site. */
export const PRICE = {
  base: 500000,
  baseLabel: '기본 50만 원',
  vat: 'VAT 별도',
  includes: '첫 장면 모션(20초 이내), 원페이지, 한국어·영어, 배포와 도메인 연결, 유지보수 1년',
  extras: [
    ['추가 페이지', '장당 10만 원'],
    ['실제 영상 작업 30초', '20만 원'],
    ['추가 수정(2회 포함 이후)', '회당 5만 원'],
  ],
  payment: '샘플을 보고 결정한 뒤 계약금 50%, 납품 전 잔금 50%',
};

export const byId = (list, id) => list.find((x) => x.id === id);
