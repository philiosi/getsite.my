/* ==========================================================================
   Warm Minimal Café — Interactive Logic
   1. Live Open/Closed Status (평일 08:00–20:00 / 주말 09:00–21:00)
   2. Hero CSS Motion Loop Control (Respects prefers-reduced-motion)
   3. 3-Column Gallery Lightbox (Prev / Next / Keyboard Navigation)
   4. Contact Email Copy & Mailto Composer
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     1. Business Hours Schedule & Live Status Indicator
     Order Spec:
     - Weekday (Mon–Fri): 08:00 – 20:00
     - Weekend (Sat–Sun): 09:00 – 21:00
     ------------------------------------------------------------------------ */
  const HOURS_CONFIG = {
    weekday: { open: 8 * 60, close: 20 * 60, label: '평일 08:00–20:00' },
    weekend: { open: 9 * 60, close: 21 * 60, label: '주말 09:00–21:00' },
  };

  const SIM_MODES = [
    { id: 'live', label: '실시간 기준' },
    { id: 'weekday-open', label: '평일 영업 중 미리보기', day: 3, hour: 14, minute: 30 },
    { id: 'weekend-open', label: '주말 영업 중 미리보기', day: 6, hour: 15, minute: 20 },
    { id: 'closed', label: '영업 종료 미리보기', day: 2, hour: 21, minute: 15 },
  ];

  let currentSimIndex = 0;

  function evaluateOpenStatus(dateObj, override) {
    const day = override ? override.day : dateObj.getDay(); // 0: Sun, 6: Sat
    const hour = override ? override.hour : dateObj.getHours();
    const minute = override ? override.minute : dateObj.getMinutes();

    const isWeekend = day === 0 || day === 6;
    const schedule = isWeekend ? HOURS_CONFIG.weekend : HOURS_CONFIG.weekday;
    const totalMinutes = hour * 60 + minute;
    const isOpen = totalMinutes >= schedule.open && totalMinutes < schedule.close;

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const pad = (n) => String(n).padStart(2, '0');
    const timeStr = `${ dayNames[day] }요일 ${ pad(hour) }:${ pad(minute) }`;

    return {
      isOpen,
      isWeekend,
      scheduleLabel: schedule.label,
      timeStr,
      statusText: isOpen ? '영업 중' : '영업 종료',
      detailText: isOpen
        ? `${ schedule.label } · 현재 방문 가능 (${ timeStr })`
        : `${ schedule.label } · 현재 영업시간 외 (${ timeStr })`,
    };
  }

  function renderOpenStatus() {
    const badge = document.getElementById('open-status-badge');
    const statusTextEl = document.getElementById('open-status-text');
    const hoursEl = document.getElementById('open-status-hours');
    const visitStatusEl = document.getElementById('visit-live-status');
    const simBtn = document.getElementById('status-sim-toggle');

    if (!badge || !statusTextEl || !hoursEl) return;

    const mode = SIM_MODES[currentSimIndex];
    const override = mode.id === 'live' ? null : mode;
    const result = evaluateOpenStatus(new Date(), override);

    badge.setAttribute('data-open', String(result.isOpen));
    statusTextEl.textContent = result.statusText;
    hoursEl.textContent = result.detailText;

    if (visitStatusEl) {
      visitStatusEl.textContent = result.isOpen
        ? `현재 영업 중 (${ result.scheduleLabel })`
        : `현재 영업 종료 (${ result.scheduleLabel })`;
      visitStatusEl.style.color = result.isOpen ? 'var(--status-open)' : 'var(--ink-secondary)';
    }

    if (simBtn) {
      const nextMode = SIM_MODES[(currentSimIndex + 1) % SIM_MODES.length];
      simBtn.textContent =
        mode.id === 'live'
          ? `상태 확인: ${ nextMode.label }`
          : `미리보기 중 (${ mode.label }) · 전환`;
    }
  }

  function initStatusIndicator() {
    const simBtn = document.getElementById('status-sim-toggle');
    if (simBtn) {
      simBtn.addEventListener('click', function () {
        currentSimIndex = (currentSimIndex + 1) % SIM_MODES.length;
        renderOpenStatus();
      });
    }
    renderOpenStatus();
    setInterval(renderOpenStatus, 30000);
  }

  /* ------------------------------------------------------------------------
     2. Hero Motion Loop Toggle & Reduced-Motion Synchronization
     ------------------------------------------------------------------------ */
  function initHeroMotion() {
    const frame = document.getElementById('hero-motion-frame');
    const toggleBtn = document.getElementById('hero-motion-toggle');
    if (!frame || !toggleBtn) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    function syncMotionPreference() {
      if (mediaQuery.matches) {
        frame.setAttribute('data-motion', 'paused');
        toggleBtn.textContent = '모션 자동 정지됨 (감소 설정)';
        toggleBtn.setAttribute('aria-pressed', 'true');
      } else {
        frame.setAttribute('data-motion', 'playing');
        toggleBtn.textContent = '모션 일시정지';
        toggleBtn.setAttribute('aria-pressed', 'false');
      }
    }

    syncMotionPreference();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncMotionPreference);
    }

    toggleBtn.addEventListener('click', function () {
      const current = frame.getAttribute('data-motion');
      const next = current === 'paused' ? 'playing' : 'paused';
      frame.setAttribute('data-motion', next);
      toggleBtn.textContent = next === 'paused' ? '모션 다시 재생' : '모션 일시정지';
      toggleBtn.setAttribute('aria-pressed', String(next === 'paused'));
    });
  }

  /* ------------------------------------------------------------------------
     3. Gallery Lightbox (3-Column Desktop / 2-Column Mobile + Prev/Next)
     ------------------------------------------------------------------------ */
  function initGalleryLightbox() {
    const cards = Array.from(document.querySelectorAll('[data-gallery-item]'));
    const lightbox = document.getElementById('gallery-lightbox');
    const lbImg = document.getElementById('lightbox-img');
    const lbTitle = document.getElementById('lightbox-title');
    const lbCaption = document.getElementById('lightbox-caption');
    const lbCounter = document.getElementById('lightbox-counter');
    const prevBtn = document.getElementById('lightbox-prev');
    const nextBtn = document.getElementById('lightbox-next');
    const closeBtn = document.getElementById('lightbox-close');

    if (!cards.length || !lightbox || !lbImg) return;

    const items = cards.map((card) => ({
      button: card.querySelector('.gallery-card__btn'),
      src: card.getAttribute('data-full-src') || card.querySelector('img').src,
      alt: card.querySelector('img').alt,
      title: card.getAttribute('data-title') || '',
      caption: card.getAttribute('data-caption') || '',
    }));

    let activeIndex = 0;
    let lastFocusedEl = null;

    function updateSlide(index) {
      activeIndex = (index + items.length) % items.length;
      const item = items[activeIndex];
      lbImg.src = item.src;
      lbImg.alt = item.alt;
      if (lbTitle) lbTitle.textContent = item.title;
      if (lbCaption) lbCaption.textContent = item.caption;
      if (lbCounter) lbCounter.textContent = `${ activeIndex + 1 } / ${ items.length }`;
    }

    function openLightbox(index, triggerEl) {
      lastFocusedEl = triggerEl || document.activeElement;
      updateSlide(index);
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (closeBtn) closeBtn.focus();
    }

    function closeLightbox() {
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
        lastFocusedEl.focus();
      }
    }

    items.forEach((item, idx) => {
      if (item.button) {
        item.button.addEventListener('click', function () {
          openLightbox(idx, item.button);
        });
      }
    });

    if (prevBtn) {
      prevBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        updateSlide(activeIndex - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        updateSlide(activeIndex + 1);
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', closeLightbox);
    }

    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) {
        closeLightbox();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (lightbox.getAttribute('aria-hidden') !== 'false') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateSlide(activeIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateSlide(activeIndex + 1);
      }
    });
  }

  /* ------------------------------------------------------------------------
     4. Contact Utilities (Email Copy & Mailto Form)
     ------------------------------------------------------------------------ */
  function initContactUtilities() {
    const copyBtn = document.getElementById('copy-email-btn');
    const emailAddress = 'philiosnaz@gmail.com';

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(emailAddress).then(function () {
            copyBtn.textContent = '복사 완료 ✓';
            setTimeout(function () {
              copyBtn.textContent = '이메일 주소 복사';
            }, 2200);
          });
        } else {
          window.prompt('아래 이메일 주소를 복사해 주세요:', emailAddress);
        }
      });
    }

    const form = document.getElementById('inquiry-form');
    const feedback = document.getElementById('inquiry-feedback');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const sender = document.getElementById('inquiry-name').value.trim();
        const topic = document.getElementById('inquiry-topic').value.trim();
        const message = document.getElementById('inquiry-message').value.trim();

        const subject = encodeURIComponent(`[방문·대관 문의] ${ topic || '문의드립니다' } — ${ sender || '방문자' }`);
        const body = encodeURIComponent(
          `보내는 분: ${ sender }\n문의 유형: ${ topic }\n\n내용:\n${ message }\n`
        );

        if (feedback) {
          feedback.hidden = false;
          feedback.textContent = '메일 작성 창을 열었습니다. 기본 메일 앱이 열리지 않으면 philiosnaz@gmail.com 으로 직접 보내주세요.';
        }

        window.location.href = `mailto:${ emailAddress }?subject=${ subject }&body=${ body }`;
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initStatusIndicator();
    initHeroMotion();
    initGalleryLightbox();
    initContactUtilities();
  });
})();
