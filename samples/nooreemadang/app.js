const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const language = document.documentElement.lang === 'en' ? 'en' : 'ko';
const introStorageKey = `nooree-intro-${language}`;
const heroArt = document.querySelector('.hero-art');
const hero = document.querySelector('.hero');
const heroVideo = document.querySelector('[data-motion-video]');
heroVideo?.addEventListener('playing', () => heroVideo.closest('.art-ribbon').classList.add('motion-playing'), { once: true });
let scrollFrame = 0;

function motionPaused() {
  return motionPreference.matches;
}

function updateHeroMotion() {
  scrollFrame = 0;
  const box = hero.getBoundingClientRect();
  const shift = motionPaused() ? 0 : Math.max(-22, Math.min(0, box.top * .045));
  heroArt.style.setProperty('--scroll-shift', `${shift}px`);
}

function syncHeroMotionVideo() {
  if (!heroVideo) return;
  if (motionPaused()) { heroVideo.pause(); return; }
  if (heroVideo.ended) heroVideo.currentTime = 0;
  heroVideo.muted = true;
  heroVideo.play().catch(() => {});
}

function syncMotion() {
  document.body.classList.toggle('motion-paused', motionPaused());
  if (motionPaused()) document.querySelectorAll('.awaiting-reveal').forEach(element => element.classList.remove('awaiting-reveal'));
  syncHeroMotionVideo();
  updateHeroMotion();
}

motionPreference.addEventListener('change', syncMotion);

/* ── 인트로 ────────────────────────────────────────────────────────────
   로고 선 그리기 → 면 채우기 → 전시 제목 → 걷히며 랜딩.
   히어로 영상과 리본 등장은 인트로가 끝난 뒤에 시작한다. 그러지 않으면
   관람객이 문 열리는 장면을 가려진 채로 흘려보낸다.

   헤더의 'Intro 재생' 버튼으로 다시 볼 수 있어야 하므로 .intro 는 DOM 에
   남겨두고 클래스로만 켜고 끈다. */
const root = document.documentElement;
const intro = document.querySelector('.intro');
const replayButton = document.querySelector('.intro-replay');
const PHASES = [[20, 'intro-draw'], [1350, 'intro-ink'], [1700, 'intro-write']];
const INTRO_MS = 3200;
let timers = [];
let introRunning = false;

function clearTimers() { timers.forEach(clearTimeout); timers = []; }

function endIntro() {
  if (!introRunning) return;
  introRunning = false;
  clearTimers();
  try { sessionStorage.setItem(introStorageKey, '1'); } catch (e) {}
  root.classList.add('intro-out');
  timers.push(setTimeout(() => {
    root.classList.remove('intro-on', 'intro-draw', 'intro-ink', 'intro-write', 'intro-out');
  }, 700));
  syncMotion();
  document.body.classList.add('motion-ready');
}

function schedulePhases() {
  introRunning = true;
  for (const [ms, name] of PHASES) timers.push(setTimeout(() => root.classList.add(name), ms));
  timers.push(setTimeout(endIntro, INTRO_MS));
}

function replayIntro() {
  if (!intro) return;
  clearTimers();
  root.classList.remove('intro-on', 'intro-draw', 'intro-ink', 'intro-write', 'intro-out');
  void intro.offsetWidth;          // 클래스를 지운 뒤 리플로를 강제해야 애니메이션이 처음부터 다시 돈다
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (heroVideo) { heroVideo.pause(); heroVideo.currentTime = 0; }
  root.classList.add('intro-on');
  schedulePhases();
}

if (intro) {
  intro.querySelectorAll('.intro-title span').forEach((el, i) => {
    el.style.animationDelay = `${i * 45}ms`;
  });
  // 워드마크 글자는 면이 채워지는 동안 한 글자씩 올라온다.
  intro.querySelectorAll('.il-word').forEach((el, i) => {
    el.style.animationDelay = `${180 + i * 32}ms`;
  });
  intro.querySelector('.intro-skip').addEventListener('click', endIntro);
  intro.addEventListener('click', endIntro);
  addEventListener('keydown', () => { if (introRunning) endIntro(); });
  if (replayButton) {
    replayButton.hidden = false;
    replayButton.addEventListener('click', replayIntro);
  }
}

if (intro && root.classList.contains('intro-on')) {
  schedulePhases();          // 첫 방문 — head 스크립트가 이미 intro-on 을 붙였다
} else {
  syncMotion();
  document.body.classList.add('motion-ready');
}

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.remove('awaiting-reveal');
        revealObserver.unobserve(entry.target);
      }
    }
  }, { threshold: .08 });

  for (const element of document.querySelectorAll('[data-reveal]')) {
    if (!motionPaused() && element.getBoundingClientRect().top > window.innerHeight) element.classList.add('awaiting-reveal');
    revealObserver.observe(element);
  }
}

const chapters = Array.from(document.querySelectorAll('.chapter'));

/* 방문 통계: 섹션 도달을 GA4 section_view 이벤트로 남긴다.
   가상 page_view 를 쓰지 않는 건 페이지 조회수가 부풀지 않게 하기 위해서다.
   빠르게 스크롤해 지나친 섹션은 세지 않도록 1초 머문 뒤에 보내고,
   같은 섹션은 페이지를 열 때마다 한 번만 보낸다. 섹션 이름은 한국어·영문
   페이지가 같은 값으로 묶이도록 언어와 상관없이 고정한다.
   작가 노트는 접혀 있는 맨 끝 구획이라 스크롤 도달로는 잡히지 않으므로,
   펼쳤을 때 보낸다.
   gtag 는 배포 주소에서만 정의되므로 로컬에서는 아무것도 보내지 않는다. */
const SECTION_NAMES = {
  hello: '01 반가워', family: '02 나의 소개', favorites: '03 좋아하는 것들',
  visit: '04 전시 안내', 'artist-note': '05 작가 노트',
};
const sentSections = new Set();
let sectionViewTimer;

function sendSectionView(id) {
  if (sentSections.has(id) || typeof window.gtag !== 'function') return;
  sentSections.add(id);
  window.gtag('event', 'section_view', { section_id: id, section_name: SECTION_NAMES[id] });
}

function scheduleSectionView(id) {
  clearTimeout(sectionViewTimer);
  if (sentSections.has(id) || !SECTION_NAMES[id] || id === 'artist-note') return;
  sectionViewTimer = setTimeout(() => { if (currentChapter === id) sendSectionView(id); }, 1000);
}
const navLinks = Array.from(document.querySelectorAll('.site-header nav a'));
let currentChapter = '';

function updateCurrentChapter() {
  const marker = document.querySelector('.site-header').offsetHeight + window.innerHeight * .3;
  const chapter = [...chapters].reverse().find(section => section.getBoundingClientRect().top <= marker) || chapters[0];
  if (chapter.id === currentChapter) return;
  currentChapter = chapter.id;
  scheduleSectionView(chapter.id);
  for (const link of navLinks) {
    if (link.hash === `#${currentChapter}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

function scheduleScrollUpdate() {
  if (scrollFrame) return;
  scrollFrame = window.requestAnimationFrame(() => { updateHeroMotion(); updateCurrentChapter(); });
}
window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
window.addEventListener('resize', scheduleScrollUpdate, { passive: true });
updateCurrentChapter();

const noteDeck = document.querySelector('[data-note-deck]');
const noteCount = document.querySelector('.note-count');
const noteDisclosure = document.querySelector('.artist-note-disclosure');
const noteNavLink = document.querySelector('.nav-note');
let selectNote = () => {};
let openPhotoModal = () => {};

if (noteDeck) {
  const noteItems = Array.from(noteDeck.querySelectorAll('.note-item'));
  // 각 카드의 현재 위치(x, y, r)와 드래그 및 레이어 관리
  const notePositions = new Map();
  let topZIndex = 100;

  let moveTimer = null;
  selectNote = index => {
    topZIndex += 2;
    noteDeck.classList.toggle('has-selection', index !== null);
    if (moveTimer) {
      clearTimeout(moveTimer);
      moveTimer = null;
    }

    noteItems.forEach((candidate, candidateIndex) => {
      const selected = candidateIndex === index;
      candidate.classList.toggle('is-selected', selected);
      if (!selected) {
        candidate.classList.remove('show-open-btn', 'is-moving');
      } else {
        candidate.classList.remove('show-open-btn');
        candidate.classList.add('is-moving');
      }
      candidate.querySelector('.note-card').setAttribute('aria-pressed', String(selected));
      candidate.querySelector('.note-open').hidden = !selected;
      if (selected) {
        candidate.style.zIndex = String(topZIndex);
      }
    });

    if (index !== null) {
      noteCount.textContent = `${String(index + 1).padStart(2, '0')} / ${String(noteItems.length).padStart(2, '0')}`;
      // 중앙 이동(420ms)이 끝나기 전에는 버튼을 숨긴다. 안착 뒤의 노출은
      // 데스크톱 hover/focus 또는 터치 사용자의 명시적인 탭으로 결정한다.
      moveTimer = setTimeout(() => {
        noteItems[index]?.classList.remove('is-moving');
        moveTimer = null;
      }, 450);
    }
  };
  selectNote(null);

  // 2차원 공간 분산(Scatter) 배치.
  function layoutNoteDeck() {
    const rect = noteDeck.getBoundingClientRect();
    const deckWidth = rect.width;
    const deckHeight = rect.height;
    const cardRect = noteItems[0]?.getBoundingClientRect();
    if (!deckWidth || !deckHeight || !cardRect?.width) return;

    const n = noteItems.length;
    const cardW = cardRect.width;
    const cardH = cardRect.height;

    // 카드 면적의 약 90% 이상이 항상 섹션 내에 보이도록 최대 이탈 한계를 계산한다.
    const maxOutX = cardW * 0.10;
    const maxOutY = cardH * 0.10;

    // 중심(0, 0) 기준으로 카드의 중심점이 위치할 수 있는 최대 범위
    const limitX = (deckWidth - cardW) / 2 + maxOutX;
    const limitY = (deckHeight - cardH) / 2 + maxOutY;

    const baseSpanX = limitX * 2;
    const baseSpanY = limitY * 2;

    const cols = deckWidth < 500 ? 3 : deckWidth < 800 ? 4 : 5;
    const rows = Math.ceil(n / cols);

    function pseudoRandom(seed) {
      const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
      return x - Math.floor(x);
    }

    noteItems.forEach((item, i) => {
      // 이미 사용자가 직접 드래그해서 옮겨놓은 위치가 있다면 유지
      if (item.dataset.dragged === 'true' && notePositions.has(item)) {
        return;
      }
      const col = i % cols;
      const row = Math.floor(i / cols);

      const baseNormX = cols > 1 ? (col / (cols - 1)) - 0.5 : 0;
      const baseNormY = rows > 1 ? (row / (rows - 1)) - 0.5 : 0;

      const jitterX = (pseudoRandom(i * 3 + 1) - 0.5) * (baseSpanX / (cols + 0.8));
      const jitterY = (pseudoRandom(i * 3 + 2) - 0.5) * (baseSpanY / (rows + 0.8));

      // 원점 기준 계산 후 한계치(-limit ~ +limit) 안으로 클램핑하여 90% 이상 노출 보장
      let rawX = baseNormX * baseSpanX + jitterX;
      let rawY = baseNormY * baseSpanY + jitterY;

      const r = (pseudoRandom(i * 5 + 3) - 0.5) * 20;
      const angle = Math.abs(r) * Math.PI / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rotatedW = Math.abs(cardW * cos) + Math.abs(cardH * sin);
      const rotatedH = Math.abs(cardH * cos) + Math.abs(cardW * sin);
      const rotatedLimitX = (deckWidth - rotatedW) / 2 + rotatedW * 0.10;
      const rotatedLimitY = (deckHeight - rotatedH) / 2 + rotatedH * 0.10;
      const x = Math.max(-rotatedLimitX, Math.min(rotatedLimitX, rawX));
      const y = Math.max(-rotatedLimitY, Math.min(rotatedLimitY, rawY));
      const baseZ = 2 + (i % 6);

      notePositions.set(item, { x, y, r });

      item.style.setProperty('--note-x', `${x.toFixed(1)}px`);
      item.style.setProperty('--note-y', `${y.toFixed(1)}px`);
      item.style.setProperty('--note-r', `${r.toFixed(2)}deg`);
      if (!item.classList.contains('is-selected')) {
        item.style.zIndex = String(baseZ);
      }
    });
  }

  // --- 드래그(Drag) & 3D 틸트(Tilt) 인터랙션 구현 ---
  noteItems.forEach((item, index) => {
    let startX = 0;
    let startY = 0;
    let origX = 0;
    let origY = 0;
    let isDragging = false;
    let dragThresholdPassed = false;

    // 마우스 호버 시 실시간 3D 틸트 효과 (선택된 카드는 안정적으로 고정)
    item.addEventListener('pointermove', e => {
      if (isDragging || item.classList.contains('is-selected')) return;
      const rect = item.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 ~ +0.5
      const relY = (e.clientY - rect.top) / rect.height - 0.5; // -0.5 ~ +0.5
      const tiltX = (-relY * 16).toFixed(1);
      const tiltY = (relX * 16).toFixed(1);
      item.style.setProperty('--tilt-x', `${tiltX}deg`);
      item.style.setProperty('--tilt-y', `${tiltY}deg`);
    });

    item.addEventListener('pointerleave', () => {
      if (!isDragging) {
        item.style.setProperty('--tilt-x', '0deg');
        item.style.setProperty('--tilt-y', '0deg');
      }
    });

    const openBtn = item.querySelector('.note-open');
    openBtn?.addEventListener('pointerdown', e => {
      e.stopPropagation();
    });

    item.addEventListener('pointerdown', e => {
      // 크게 보기 링크 클릭 시 드래그 방지
      if (e.target.closest('.note-open')) return;
      // 마우스 좌클릭 또는 터치만 처리
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      // 이미 선택된 카드는 드래그하지 않고 중앙에 머무름
      if (item.classList.contains('is-selected')) {
        if (e.pointerType === 'touch' && !item.classList.contains('is-moving')) {
          item.classList.toggle('show-open-btn');
        }
        return;
      }

      const pos = notePositions.get(item) || { x: 0, y: 0, r: 0 };
      startX = e.clientX;
      startY = e.clientY;
      origX = pos.x;
      origY = pos.y;
      isDragging = true;
      dragThresholdPassed = false;

      // 드래그 중인 카드는 임시로 최상단으로 올림
      topZIndex += 1;
      item.style.zIndex = String(topZIndex);

      function onPointerMove(moveEvent) {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        if (!dragThresholdPassed && Math.hypot(dx, dy) > 4) {
          dragThresholdPassed = true;
          item.classList.add('is-dragging');
          item.setPointerCapture(e.pointerId);
        }

        if (dragThresholdPassed) {
          const currentX = origX + dx;
          const currentY = origY + dy;
          item.style.setProperty('--note-x', `${currentX.toFixed(1)}px`);
          item.style.setProperty('--note-y', `${currentY.toFixed(1)}px`);
          // 드래그 속도에 따른 약간의 기울임
          const dragTilt = Math.max(-15, Math.min(15, dx * 0.15));
          item.style.setProperty('--tilt-y', `${dragTilt.toFixed(1)}deg`);
        }
      }

      function onPointerUp(upEvent) {
        if (!isDragging) return;
        isDragging = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        if (dragThresholdPassed) {
          try { item.releasePointerCapture(e.pointerId); } catch (_) {}
          item.classList.remove('is-dragging');
          item.dataset.dragged = 'true';
          const dx = upEvent.clientX - startX;
          const dy = upEvent.clientY - startY;
          const finalX = origX + dx;
          const finalY = origY + dy;
          const currentPos = notePositions.get(item) || { r: 0 };
          notePositions.set(item, { x: finalX, y: finalY, r: currentPos.r });
          item.style.setProperty('--tilt-x', '0deg');
          item.style.setProperty('--tilt-y', '0deg');
        } else {
          // 단순 클릭/터치였던 경우: 선택되지 않은 카드를 누르면 중앙으로 배치 및 선택
          selectNote(index);
        }
      }

      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    });
  });

  // 아코디언이 펼쳐질 때 바로 높이와 폭을 다시 측정해 렌더링하도록 지원
  noteDisclosure?.addEventListener('toggle', () => {
    if (noteDisclosure.open) {
      sendSectionView('artist-note');
      requestAnimationFrame(layoutNoteDeck);
    }
  });

  layoutNoteDeck();
  let deckLayoutFrame = 0;
  addEventListener('resize', () => {
    if (deckLayoutFrame) return;
    deckLayoutFrame = requestAnimationFrame(() => { deckLayoutFrame = 0; layoutNoteDeck(); });
  }, { passive: true });
}

noteNavLink?.addEventListener('click', () => {
  noteDisclosure.open = true;
  requestAnimationFrame(layoutNoteDeck);
});
if (location.hash === '#artist-note' && noteDisclosure) {
  noteDisclosure.open = true;
  requestAnimationFrame(layoutNoteDeck);
}

const dialog = document.querySelector('.photo-dialog');
const dialogImage = dialog.querySelector('.dialog-image');
const caption = document.querySelector('#photo-caption');
const dialogPrev = dialog.querySelector('.dialog-prev');
const dialogNext = dialog.querySelector('.dialog-next');
const notePhotoLinks = Array.from(document.querySelectorAll('.note-open[data-photo]'));
let previousTrigger;
let activeNoteIndex = -1;

if (typeof dialog.showModal === 'function') {
  // 작품 캡션은 국립현대미술관 출판 지침 순서를 따른다:
  // 작가명, 〈작품명〉, 제작연도, 매체 및 기법, / 규격. 영문은 작품명을 기울임으로 쓴다.
  // 작품명이 없는 작품은 설명을 첫 줄에 두고 그 아래 작가명부터 이어 쓴다.
  // 작품 정보가 없는 사진(작가 노트·포스터 등)은 설명 한 줄만 보인다.
  function showCaption(link, description) {
    const { artist, title, year, medium, size } = link.dataset;
    caption.classList.toggle('is-artwork', Boolean(artist));
    if (!artist) { caption.textContent = description; return; }
    const credit = document.createElement('span');
    credit.className = 'artwork-credit';
    if (title) {
      const titleEl = document.createElement(language === 'en' ? 'i' : 'span');
      titleEl.className = 'artwork-title';
      titleEl.textContent = language === 'en' ? title : `〈${title}〉`;
      credit.append(`${artist}, `, titleEl, ...[year, medium].filter(Boolean).map(part => `, ${part}`), ',');
    } else {
      credit.append([artist, year, medium].filter(Boolean).join(', ') + ',');
    }
    const sizeEl = document.createElement('span');
    sizeEl.className = 'artwork-size';
    sizeEl.textContent = size;
    const label = document.createElement('span');
    label.className = 'artwork-label';
    if (!title) {
      const lead = document.createElement('span');
      lead.className = 'artwork-lead';
      lead.textContent = description;
      label.append(lead);
    }
    label.append(credit, sizeEl);
    caption.replaceChildren(label);
  }

  // 캡션 틀을 실제로 그려진 작품 폭에 맞춘다 (object-fit: contain 이라 상자 폭과 다르다).
  function fitCaptionToArt() {
    const { naturalWidth: w, naturalHeight: h, clientWidth: boxW, clientHeight: boxH } = dialogImage;
    if (!w || !h) return;
    caption.style.setProperty('--art-width', `${Math.min(boxW, boxH * w / h)}px`);
  }
  dialogImage.addEventListener('load', fitCaptionToArt);
  addEventListener('resize', () => { if (dialog.open) fitCaptionToArt(); });

  function showPhoto(link) {
    const description = link.dataset.caption || link.querySelector('img')?.alt || (language === 'en' ? 'Exhibition artwork' : '전시 작품');
    activeNoteIndex = notePhotoLinks.indexOf(link);
    dialogImage.alt = description;
    dialogImage.src = link.href;
    showCaption(link, description);
    dialog.querySelector('.dialog-toolbar > span').textContent = link.dataset.dialogLabel || (new URL(link.href).pathname.endsWith('poster.webp')
      ? (language === 'en' ? 'Exhibition poster' : '전시 포스터')
      : (language === 'en' ? 'Artwork' : '작품'));
    dialogPrev.hidden = activeNoteIndex < 0;
    dialogNext.hidden = activeNoteIndex < 0;
    if (activeNoteIndex >= 0) selectNote(activeNoteIndex);
  }

  function moveNote(direction) {
    if (activeNoteIndex < 0) return;
    const nextIndex = (activeNoteIndex + direction + notePhotoLinks.length) % notePhotoLinks.length;
    previousTrigger = notePhotoLinks[nextIndex];
    showPhoto(previousTrigger);
  }

  openPhotoModal = link => {
    previousTrigger = link;
    showPhoto(link);
    dialog.showModal();
  };

  document.querySelectorAll('[data-photo]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openPhotoModal(link);
    });
  });
  dialogPrev.addEventListener('click', () => moveNote(-1));
  dialogNext.addEventListener('click', () => moveNote(1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' && activeNoteIndex >= 0) moveNote(-1);
    if (event.key === 'ArrowRight' && activeNoteIndex >= 0) moveNote(1);
  });
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    activeNoteIndex = -1;
    previousTrigger?.focus({ preventScroll: true });
  });
  dialogImage.addEventListener('error', () => { caption.textContent = language === 'en' ? 'The image could not be loaded. Close this window and try again.' : '사진을 불러오지 못했어요. 창을 닫고 다시 열어주세요.'; });
}

// 장소 안내. JS가 없으면 링크 그대로 네이버 지도로 넘어간다.
const venueDialog = document.querySelector('.venue-dialog');
if (venueDialog && typeof venueDialog.showModal === 'function') {
  let venueTrigger;
  document.querySelectorAll('[data-venue]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      venueTrigger = link;
      venueDialog.showModal();
    });
  });
  venueDialog.querySelector('.dialog-close').addEventListener('click', () => venueDialog.close());
  venueDialog.addEventListener('click', event => {
    const bounds = venueDialog.getBoundingClientRect();
    if (event.target === venueDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) venueDialog.close();
  });
  venueDialog.addEventListener('close', () => venueTrigger?.focus({ preventScroll: true }));
}

// 관람객이 좋아하는 사진을 마당에 더한다.
// 사진은 objectURL로만 다루므로 기기 밖으로 나가지 않고, 새로고침하면 사라진다.
const favoriteStage = document.querySelector('.favorite-motion-stage');
const favoriteInput = document.querySelector('.favorite-add-input');
const favoriteAddButton = document.querySelector('[data-add-favorite]');
if (favoriteStage && favoriteInput && favoriteAddButton) {
  const scene = favoriteStage.querySelector('.favorite-motion-scene');
  const guestLayer = favoriteStage.querySelector('.favorite-guest-layer');
  const hint = document.querySelector('.favorite-add-hint');
  const MAX_BYTES = 20 * 1024 * 1024;
  const BUBBLE_PX = 512;
  const guests = [];

  // 사진이 들어갈 자리. 첫 장은 강아지, 둘째 장은 빈 자리, 나머지 세 장은
  // 고양이·토끼·호랑이·사자 중 이번 방문에서 무작위로 고른 세 마리 자리다.
  // 동물 자리에 들어간 사진은 그 동물의 위치·크기·등장 순서를 그대로 물려받는다.
  const shuffle = list => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const animalSlot = name => ({ className: `favorite-bubble-${name}`, original: scene.querySelector(`.favorite-bubble-${name}`) });
  const slots = [
    animalSlot('dog'),
    { className: 'favorite-bubble-guest-1', original: null },
    ...shuffle(['cat', 'rabbit', 'tiger', 'lion']).slice(0, 3).map(animalSlot),
  ];
  const MAX_GUESTS = slots.length;

  // 안내 줄을 잠시 빌려 쓴다. 자리를 따로 만들면 문구가 떴다 사라질 때마다
  // 아래 내용이 밀렸다 돌아온다.
  const hintDefault = hint?.textContent ?? '';
  let sayTimer;
  const say = message => {
    if (!hint) return;
    clearTimeout(sayTimer);
    hint.textContent = message || hintDefault;
    if (message) sayTimer = setTimeout(() => { hint.textContent = hintDefault; }, 4000);
  };
  const t = (ko, en) => (language === 'en' ? en : ko);
  const cycleOf = element => element.getAnimations?.().find(a => a.animationName === 'favorite-bubble-cycle');

  // 폰 사진은 1200만 화소가 예사다. 그대로 두면 지름 150px짜리 동그라미를
  // 원본 해상도 비트맵으로 계속 애니메이션하게 되어 느려지고 버벅인다.
  // 화면에 필요한 크기로 미리 줄이고 동그라미에 맞춰 정사각으로 잘라 둔다.
  async function shrink(file) {
    if (typeof createImageBitmap !== 'function') return file;
    let source;
    try {
      source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      return file;
    }
    const side = Math.min(source.width, source.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(BUBBLE_PX, side);
    canvas.getContext('2d').drawImage(
      source, (source.width - side) / 2, (source.height - side) / 2, side, side,
      0, 0, canvas.width, canvas.height);
    source.close();
    const small = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
    return small || file;
  }

  // 사진이 드나들면 군집 전체를 처음부터 다시 돌린다. 돌던 자리에 끼워 넣으면
  // 새 사진이 사라지는 구간에 걸려 나타나자마자 없어지거나, 들어오는 동작 없이
  // 그냥 튀어나온다. 다 같이 다시 모이는 편이 맥락도 살고 방금 더한 사진도 보인다.
  function restartCycle() {
    favoriteStage.querySelectorAll('.favorite-bubble').forEach(bubble => {
      const cycle = cycleOf(bubble);
      if (cycle) cycle.currentTime = 0;
    });
  }

  /* ── 저장하기 ─────────────────────────────────────────────────────────
     사진이 한 장이라도 있으면 저장하기를 보여 주고, 한 번 더 묻고 나서
     지금 마당의 모습을 포토카드 한 장으로 그린다. */
  const saveRow = document.querySelector('.favorite-save');
  const saveButton = saveRow?.querySelector('[data-save-favorite]');
  const saveConfirm = saveRow?.querySelector('.favorite-save-confirm');
  const saveYes = saveRow?.querySelector('[data-save-yes]');
  const saveNo = saveRow?.querySelector('[data-save-no]');
  const cardDialog = document.querySelector('.card-dialog');
  const canSave = Boolean(saveRow && saveButton && saveConfirm && saveYes && saveNo
    && cardDialog && typeof cardDialog.showModal === 'function');
  let cardJob = 0;          // 늦게 끝난 이전 작업이 새 카드를 덮어쓰거나, 취소한 카드를 띄우지 않게 한다

  function closeSaveConfirm({ focus = true } = {}) {
    if (!canSave || saveConfirm.hidden) return;
    // 카드를 만드는 도중 아니오를 누르거나 사진을 다 빼면 그 작업은 버린다.
    if (saveYes.disabled) {
      cardJob += 1;
      saveYes.disabled = false;
      say('');
    }
    saveConfirm.hidden = true;
    saveButton.hidden = false;
    if (focus) saveButton.focus({ preventScroll: true });
  }

  function syncSaveRow() {
    if (!canSave) return;
    const empty = guests.length === 0;
    saveRow.toggleAttribute('data-empty', empty);
    if (empty) closeSaveConfirm({ focus: false });
  }

  function removeGuest(entry) {
    URL.revokeObjectURL(entry.url);
    entry.element.remove();
    entry.slot.original?.classList.remove('is-replaced');
    guests.splice(guests.indexOf(entry), 1);
    restartCycle();
    syncSaveRow();
    say('');
    favoriteAddButton.focus({ preventScroll: true });
  }

  favoriteAddButton.addEventListener('click', () => {
    // 사진을 고르는 수고를 한 뒤에 거절하지 않도록, 파일 선택창을 열기 전에 막는다.
    if (guests.length >= MAX_GUESTS) {
      say(t('사진은 다섯 장까지 더할 수 있어요. 하나를 빼고 다시 올려봐.', 'You can add up to five photos. Remove one to add another.'));
      return;
    }
    say('');
    favoriteInput.click();
  });

  // 사진 한 장을 줄여 빈 자리에 넣는다. 넣지 못하면 안내 문구를 돌려준다.
  async function addGuest(file) {
    if (!file.type.startsWith('image/')) return t('사진 파일만 더할 수 있어요.', 'Only image files can be added.');
    if (file.size > MAX_BYTES) return t('20MB보다 작은 사진으로 골라주세요.', 'Please choose an image smaller than 20MB.');

    const image = document.createElement('img');
    image.alt = '';
    let url;
    // 줄인 뒤 다 그려질 때까지 기다렸다 넣어야, 빈 동그라미가 먼저 떴다가
    // 그림이 뒤늦게 튀어 들어오지 않는다.
    try {
      url = URL.createObjectURL(await shrink(file));
      image.src = url;
      await image.decode();
    } catch {
      if (url) URL.revokeObjectURL(url);
      return t('사진을 불러오지 못했어요. 다른 사진으로 골라주세요.', 'That photo could not be opened. Please choose another one.');
    }

    // 사진을 빼면 그 자리만 비므로, 비어 있는 가장 앞 자리부터 채운다.
    const slot = slots.find(candidate => !guests.some(entry => entry.slot === candidate));
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `favorite-bubble favorite-bubble-guest ${slot.className}`;
    element.setAttribute('aria-label', t('내가 더한 사진 빼기', 'Remove the photo I added'));
    element.append(image);
    guestLayer.append(element);
    slot.original?.classList.add('is-replaced');

    const entry = { element, url, slot, image };
    guests.push(entry);
    element.addEventListener('click', () => removeGuest(entry));
    return '';
  }

  favoriteInput.addEventListener('change', async () => {
    const picked = Array.from(favoriteInput.files ?? []);
    favoriteInput.value = '';
    if (!picked.length) return;
    const room = MAX_GUESTS - guests.length;
    if (room <= 0) {
      say(t('사진은 다섯 장까지 더할 수 있어요.', 'You can add up to five photos.'));
      return;
    }
    // 남은 자리보다 많이 고르면 고른 순서대로 앞에서부터 채우고 나머지는 버린다.
    const files = picked.slice(0, room);
    const overflow = picked.length > room
      ? t(`사진은 다섯 장까지 더할 수 있어서, 고른 순서대로 ${room}장만 넣었어요.`,
        `You can add up to five photos, so only the first ${room} you picked ${room === 1 ? 'was' : 'were'} added.`)
      : '';

    say(t('사진을 넣는 중…', files.length > 1 ? 'Adding your photos…' : 'Adding your photo…'));
    favoriteAddButton.disabled = true;
    let failure = '';
    let added = 0;
    for (const file of files) {
      const problem = await addGuest(file);
      if (problem) failure ||= problem;
      else added += 1;
    }
    favoriteAddButton.disabled = false;
    if (added) {
      restartCycle();
      syncSaveRow();
    }
    say(overflow || failure);
    favoriteAddButton.focus({ preventScroll: true });
  });

  // 뒤로 가기 캐시에서 되살아날 수 있는 페이지는 사진을 그대로 둔다.
  window.addEventListener('pagehide', event => {
    if (!event.persisted) guests.forEach(entry => URL.revokeObjectURL(entry.url));
  });

  if (canSave) {
    const cardImage = cardDialog.querySelector('.card-image');
    const cardDownload = cardDialog.querySelector('.card-download');
    const themeButtons = Array.from(cardDialog.querySelectorAll('[data-card-theme]'));
    const CARD_THEMES = {
      // 자화상의 파란 바탕과 같은 결의 톤온톤
      blue: { frame: '#a9c3c6', panel: '#d8e5e6', title: '#345c66', sub: '#cd6e38', tile: '#b9cfd2', mark: '#f8f5ed', date: '#345c66' },
      // 사이트 바탕 종이색과 주황 제목
      paper: { frame: '#eee9dd', panel: '#f8f5ed', title: '#cd6e38', sub: '#345c66', tile: '#f1da86', mark: '#fffaf0', date: '#686b60' },
    };
    const W = 1080, H = 1350, FRAME = 36, PANEL_R = 40;
    const GRID_X = 120, GRID_Y = 330, GAP = 10, CELL = (W - GRID_X * 2 - GAP * 2) / 3;
    const PORTRAIT_CELL = 5;   // 위→오른쪽으로 셌을 때 6번째 칸
    const TITLE = t('내가 좋아하는 것들!', 'My favorite things!');
    const HEADER = t('누리마당 · 내 친구 누렁이를 소개합니다', 'Nooree Madang · Meet My Friend Nureongi');
    const SITE = 'nooreemadang.com';
    let card = null;        // 지금 보여 주는 카드의 배치와 색
    let cardUrl = '';

    const pad = number => String(number).padStart(2, '0');
    const today = () => {
      const d = new Date();
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    // 저장하는 순간의 날짜·시각을 파일 이름에 넣어, 여러 장을 받아도 서로 덮어쓰지 않게 한다.
    const fileStamp = () => {
      const d = new Date();
      return `${today()}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    };
    cardDownload.addEventListener('click', () => {
      cardDownload.download = `nureongi-favorites-${fileStamp()}.png`;
    });

    async function ready(image) {
      // 아직 내려받지 않은 lazy 이미지는 decode가 끝없이 기다릴 수 있다.
      image.loading = 'eager';
      if (!image.complete || !image.naturalWidth) await image.decode();
      return image;
    }

    // 영문 페이지는 HTML 안의 경로만 ../assets 로 바뀌므로, 페이지에 이미 있는
    // 자화상 링크의 (해석이 끝난) 주소를 빌려 쓴다.
    function loadPortrait() {
      const href = document.querySelector('.art-ribbon.ribbon-left')?.href;
      if (!href) return Promise.resolve(null);
      const image = new Image();
      image.src = href;
      return image.decode().then(() => image, () => null);
    }

    // 빈 칸끼리 위아래·좌우로 붙으면 한쪽이 휑해 보여서, 떨어질 때까지 다시 섞는다.
    function arrange(items) {
      const filled = [...items, ...Array(8 - items.length).fill(null)];
      const cells = [0, 1, 2, 3, 4, 6, 7, 8];
      const touching = order => order.some((item, i) => {
        if (item) return false;
        const at = cells[i];
        return order.some((other, k) => {
          if (other || k === i) return false;
          const to = cells[k];
          return Math.abs(at % 3 - to % 3) + Math.abs(Math.floor(at / 3) - Math.floor(to / 3)) === 1;
        });
      });
      let order = shuffle(filled);
      for (let tries = 0; tries < 200 && touching(order); tries += 1) order = shuffle(filled);
      return order;
    }

    function drawCover(ctx, image, x, y, size, focusY) {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) * focusY, side, side, x, y, size, size);
    }

    function sparkle(ctx, cx, cy, r, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx + r, cy);
      for (let k = 1; k <= 4; k += 1) {
        const a = k * Math.PI / 2;
        ctx.quadraticCurveTo(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.fill();
    }

    function drawCard({ portrait, order, date }, themeName) {
      const theme = CARD_THEMES[themeName];
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = theme.frame;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = theme.panel;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(FRAME, FRAME, W - FRAME * 2, H - FRAME * 2, PANEL_R);
      else ctx.rect(FRAME, FRAME, W - FRAME * 2, H - FRAME * 2);
      ctx.fill();

      ctx.fillStyle = theme.sub;
      ctx.font = '400 34px Gaegu';
      ctx.fillText(HEADER, GRID_X + 6, 150);
      ctx.fillStyle = theme.title;
      let size = 150;
      ctx.font = `700 ${size}px Gaegu`;
      while (size > 40 && ctx.measureText(TITLE).width > W - GRID_X * 2 - 60) {
        size -= 2;
        ctx.font = `700 ${size}px Gaegu`;
      }
      ctx.fillText(TITLE, GRID_X, 280);
      sparkle(ctx, W - GRID_X - 14, 150, 30, theme.title);
      sparkle(ctx, W - GRID_X - 60, 112, 13, theme.title);

      let next = 0;
      for (let n = 0; n < 9; n += 1) {
        const x = GRID_X + (n % 3) * (CELL + GAP);
        const y = GRID_Y + Math.floor(n / 3) * (CELL + GAP);
        const image = n === PORTRAIT_CELL ? portrait : order[next++];
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, CELL, CELL);
        ctx.clip();
        if (image) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(x, y, CELL, CELL);
          drawCover(ctx, image, x, y, CELL, n === PORTRAIT_CELL ? .45 : .5);
        } else {
          ctx.fillStyle = theme.tile;
          ctx.fillRect(x, y, CELL, CELL);
          sparkle(ctx, x + CELL * .42, y + CELL * .55, CELL * .2, theme.mark);
          sparkle(ctx, x + CELL * .72, y + CELL * .28, CELL * .07, theme.mark);
        }
        ctx.restore();
      }

      // 날짜는 격자 오른쪽 여백에 아래에서 위로 읽히게 세운다.
      ctx.save();
      ctx.fillStyle = theme.date;
      ctx.font = '400 30px Gaegu';
      ctx.textBaseline = 'middle';
      ctx.translate(W - GRID_X / 2 + 2, GRID_Y + CELL * 3 + GAP * 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(date, 0, 0);
      ctx.restore();

      ctx.fillStyle = theme.sub;
      ctx.font = '400 28px Gaegu';
      ctx.fillText(SITE, GRID_X, GRID_Y + CELL * 3 + GAP * 2 + 70);
      return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }

    async function showCard(themeName, job) {
      const blob = await drawCard(card, themeName);
      if (job !== cardJob) return false;
      if (!blob) throw new Error('card');
      if (cardUrl) URL.revokeObjectURL(cardUrl);
      cardUrl = URL.createObjectURL(blob);
      cardImage.src = cardUrl;
      cardDownload.href = cardUrl;
      cardDownload.download = `nureongi-favorites-${fileStamp()}.png`;
      card.theme = themeName;
      themeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.cardTheme === themeName)));
      return true;
    }

    async function makeCard() {
      const job = ++cardJob;
      // ‘예’를 누른 순간의 마당을 붙잡아 둔다. 기다리는 사이 사진을 빼도
      // 이미 그려진 이미지 요소는 그대로 쓸 수 있다.
      const pictures = [
        ...guests.map(entry => entry.image),
        ...slots.filter(slot => slot.original && !guests.some(entry => entry.slot === slot)).map(slot => slot.original.querySelector('img')),
        ...['cat', 'rabbit', 'tiger', 'lion']
          .map(name => scene.querySelector(`.favorite-bubble-${name}`))
          .filter(bubble => !slots.some(slot => slot.original === bubble))
          .map(bubble => bubble.querySelector('img')),
      ].filter(Boolean);
      saveYes.disabled = true;
      say(t('포토카드를 만드는 중…', 'Making your photo card…'));
      try {
        await Promise.all([
          document.fonts?.load('700 100px Gaegu', TITLE),
          document.fonts?.load('400 30px Gaegu', `${HEADER}${SITE}0123456789-`),
        ]).catch(() => {});
        const [portrait, ...loaded] = await Promise.all([loadPortrait(), ...pictures.map(image => ready(image).catch(() => null))]);
        if (job !== cardJob) return;
        if (!portrait) throw new Error('portrait');
        card = { portrait, order: arrange(loaded.filter(Boolean)), date: today(), theme: 'blue' };
        if (!await showCard('blue', job)) return;
        saveYes.disabled = false;
        closeSaveConfirm({ focus: false });
        say('');
        cardDialog.showModal();
      } catch {
        if (job === cardJob) say(t('포토카드를 만들지 못했어요. 다시 한 번 눌러 주세요.', 'The photo card could not be made. Please try again.'));
      } finally {
        if (job === cardJob) saveYes.disabled = false;
      }
    }

    saveButton.addEventListener('click', () => {
      saveButton.hidden = true;
      saveConfirm.hidden = false;
      saveYes.focus({ preventScroll: true });
    });
    saveNo.addEventListener('click', () => closeSaveConfirm());
    saveYes.addEventListener('click', makeCard);

    // 그리는 중에 다른 색을 또 누를 수 있으므로, 마지막으로 누른 색을 따로 기억한다.
    const cardTip = cardDialog.querySelector('.card-tip');
    const tipDefault = cardTip?.textContent ?? '';
    themeButtons.forEach(button => button.addEventListener('click', async () => {
      const themeName = button.dataset.cardTheme;
      if (!card || themeName === (card.wanted ?? card.theme)) return;
      card.wanted = themeName;
      const job = ++cardJob;
      if (cardTip) cardTip.textContent = tipDefault;
      try {
        await showCard(themeName, job);
      } catch {
        if (job === cardJob && cardTip) {
          card.wanted = card.theme;
          cardTip.textContent = t('카드 색을 바꾸지 못했어요. 다시 한 번 눌러 주세요.', 'The card colors could not be changed. Please try again.');
        }
      }
    }));

    cardDialog.querySelector('.dialog-close').addEventListener('click', () => cardDialog.close());
    cardDialog.addEventListener('click', event => {
      const bounds = cardDialog.getBoundingClientRect();
      if (event.target === cardDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) cardDialog.close();
    });
    cardDialog.addEventListener('close', () => {
      cardJob += 1;   // 닫은 뒤 끝난 색 바꾸기가 카드를 다시 띄우지 않게
      if (card) card.wanted = card.theme;
      if (cardTip) cardTip.textContent = tipDefault;
      saveButton.focus({ preventScroll: true });
    });
  }
}
