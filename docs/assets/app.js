const STORAGE_KEYS = {
  chapter: 'chanting.selectedChapter',
  fontScale: 'chanting.fontScale.v3',
};

const DEFAULT_FONT_SCALE = 1;
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.3;
const STEP = 0.05;
const MOVE_THRESHOLD = 10;
const TAP_MAX_MS = 280;
const ACTIVE_CHAPTER_OFFSET = 72;
const BASE_ENTRY_SIZE = 1.21;
const BASE_NOTE_SIZE = 0.82;

const GROUP_ORDER = ['morning', 'evening', 'homage', 'other'];
const GROUP_LABELS = {
  morning: 'Morning Chanting',
  evening: 'Evening Chanting',
  homage: 'Homage',
  other: 'Other',
};

let chapterView;
let chapterTemplate;
let entryTemplate;
let chapterMenuToggle;
let chapterDrawer;
let chapterDrawerClose;
let chapterDrawerBackdrop;
let chapterDirectory;
let helpToggle;
let helpModal;
let helpClose;
let helpBackdrop;
let fontDown;
let fontUp;
let fontSizeLabel;
let drawer;
let drawerClose;
let drawerSource;
let drawerTranslation;
let drawerBackdrop;

let chapters = [];
let chapterElements = new Map();
let directoryButtons = new Map();
let directoryGroups = new Map();
let activeEntryElement = null;
let activeChapterId = localStorage.getItem(STORAGE_KEYS.chapter) || '';
let fontScale = clamp(
  Number(localStorage.getItem(STORAGE_KEYS.fontScale)) || DEFAULT_FONT_SCALE,
  MIN_SCALE,
  MAX_SCALE,
);
let scrollFrame = 0;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cacheElements() {
  chapterView = document.querySelector('#chapter-view');
  chapterTemplate = document.querySelector('#chapter-template');
  entryTemplate = document.querySelector('#entry-template');
  chapterMenuToggle = document.querySelector('#chapter-menu-toggle');
  chapterDrawer = document.querySelector('#chapter-drawer');
  chapterDrawerClose = document.querySelector('#chapter-drawer-close');
  chapterDrawerBackdrop = document.querySelector('#chapter-drawer-backdrop');
  chapterDirectory = document.querySelector('#chapter-directory');
  helpToggle = document.querySelector('#help-toggle');
  helpModal = document.querySelector('#help-modal');
  helpClose = document.querySelector('#help-close');
  helpBackdrop = document.querySelector('#help-backdrop');
  fontDown = document.querySelector('#font-down');
  fontUp = document.querySelector('#font-up');
  fontSizeLabel = document.querySelector('#font-size-label');
  drawer = document.querySelector('#translation-drawer');
  drawerClose = document.querySelector('#drawer-close');
  drawerSource = document.querySelector('#drawer-source');
  drawerTranslation = document.querySelector('#drawer-translation');
  drawerBackdrop = document.querySelector('#drawer-backdrop');
}

function getChapterGroup(chapter) {
  const explicitGroup = String(chapter.group || '').trim().toLowerCase();
  if (explicitGroup && GROUP_LABELS[explicitGroup]) {
    return explicitGroup;
  }

  const prefix = String(chapter.id || '').trim().charAt(0).toLowerCase();
  if (prefix === 'm') {
    return 'morning';
  }
  if (prefix === 'e') {
    return 'evening';
  }
  if (prefix === 'h' || prefix === 's') {
    return 'homage';
  }
  return 'other';
}

function groupChaptersBySection(items) {
  const groups = new Map();

  GROUP_ORDER.forEach((key) => {
    groups.set(key, []);
  });

  items.forEach((chapter) => {
    groups.get(getChapterGroup(chapter)).push(chapter);
  });

  return GROUP_ORDER
    .map((key) => ({
      key,
      label: GROUP_LABELS[key],
      chapters: groups.get(key),
    }))
    .filter((group) => group.chapters.length > 0);
}

function saveFontScale(nextScale) {
  fontScale = clamp(Number(nextScale.toFixed(2)), MIN_SCALE, MAX_SCALE);
  document.documentElement.style.setProperty('--entry-size', `${(BASE_ENTRY_SIZE * fontScale).toFixed(3)}rem`);
  document.documentElement.style.setProperty('--note-size', `${(BASE_NOTE_SIZE * fontScale).toFixed(3)}rem`);
  fontSizeLabel.textContent = `${Math.round(fontScale * 100)}%`;
  localStorage.setItem(STORAGE_KEYS.fontScale, String(fontScale));
}

function closeDrawer() {
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  drawerBackdrop.hidden = true;
  if (activeEntryElement) {
    activeEntryElement.classList.remove('highlighted');
    activeEntryElement = null;
  }
}

function openDrawer(entry, element) {
  if (!entry.english) {
    return;
  }

  if (activeEntryElement) {
    activeEntryElement.classList.remove('highlighted');
  }

  activeEntryElement = element;
  activeEntryElement.classList.add('highlighted');
  drawerSource.textContent = entry.pali;
  drawerTranslation.textContent = entry.english;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  drawerBackdrop.hidden = false;
}

function openChapterDrawer() {
  chapterDrawer.classList.add('open');
  chapterDrawer.setAttribute('aria-hidden', 'false');
  chapterDrawerBackdrop.hidden = false;
  chapterMenuToggle.setAttribute('aria-expanded', 'true');
}

function closeChapterDrawer() {
  chapterDrawer.classList.remove('open');
  chapterDrawer.setAttribute('aria-hidden', 'true');
  chapterDrawerBackdrop.hidden = true;
  chapterMenuToggle.setAttribute('aria-expanded', 'false');
}

function openHelpModal() {
  helpModal.classList.add('open');
  helpModal.setAttribute('aria-hidden', 'false');
  helpBackdrop.hidden = false;
  helpToggle.setAttribute('aria-expanded', 'true');
}

function closeHelpModal() {
  helpModal.classList.remove('open');
  helpModal.setAttribute('aria-hidden', 'true');
  helpBackdrop.hidden = true;
  helpToggle.setAttribute('aria-expanded', 'false');
}

function setActiveChapter(chapterId) {
  if (!chapterId) {
    return;
  }

  activeChapterId = chapterId;
  localStorage.setItem(STORAGE_KEYS.chapter, chapterId);

  directoryButtons.forEach((button, id) => {
    button.classList.toggle('active', id === chapterId);
  });

  const chapter = chapters.find((item) => item.id === chapterId);
  if (chapter) {
    const groupKey = getChapterGroup(chapter);
    directoryGroups.forEach((details, key) => {
      details.open = key === groupKey;
    });
  }
}

function scrollToChapter(chapterId, behavior = 'smooth') {
  const element = chapterElements.get(chapterId);
  if (!element) {
    return;
  }

  element.scrollIntoView({ behavior, block: 'start' });
  setActiveChapter(chapterId);
}

function updateActiveChapterFromScroll() {
  const viewportTop = chapterView.getBoundingClientRect().top;
  let nextActiveId = chapters[0]?.id || '';

  chapters.forEach((chapter) => {
    const element = chapterElements.get(chapter.id);
    if (!element) {
      return;
    }

    const distanceFromTop = element.getBoundingClientRect().top - viewportTop;
    if (distanceFromTop <= ACTIVE_CHAPTER_OFFSET) {
      nextActiveId = chapter.id;
    }
  });

  setActiveChapter(nextActiveId);
}

function queueActiveChapterUpdate() {
  if (scrollFrame) {
    return;
  }

  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = 0;
    updateActiveChapterFromScroll();
  });
}

function createEntryElement(entry) {
  const fragment = entryTemplate.content.cloneNode(true);
  const button = fragment.querySelector('.entry');
  const text = fragment.querySelector('.entry-text');

  text.textContent = entry.pali;
  button.dataset.entryId = entry.id;

  if (entry.kind === 'note') {
    button.classList.add('entry-note');
  }

  if (entry.english) {
    button.classList.add('can-translate');
  }

  let startX = 0;
  let startY = 0;
  let touchStartTime = 0;
  let touchMoved = false;

  const beginTouch = (clientX, clientY) => {
    if (!entry.english) {
      return;
    }
    startX = clientX;
    startY = clientY;
    touchStartTime = Date.now();
    touchMoved = false;
  };

  const moveTouch = (clientX, clientY) => {
    if (!touchStartTime) {
      return;
    }
    const moved = Math.hypot(clientX - startX, clientY - startY);
    if (moved > MOVE_THRESHOLD) {
      touchMoved = true;
    }
  };

  const endTouch = () => {
    if (!touchStartTime || !entry.english) {
      touchStartTime = 0;
      return;
    }

    const elapsed = Date.now() - touchStartTime;
    const shouldOpen = !touchMoved && elapsed <= TAP_MAX_MS;
    touchStartTime = 0;

    if (shouldOpen) {
      openDrawer(entry, button);
    }
  };

  button.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    if (touch) {
      beginTouch(touch.clientX, touch.clientY);
    }
  }, { passive: true });

  button.addEventListener('touchmove', (event) => {
    const touch = event.touches[0];
    if (touch) {
      moveTouch(touch.clientX, touch.clientY);
    }
  }, { passive: true });

  button.addEventListener('touchend', () => {
    endTouch();
  });

  button.addEventListener('touchcancel', () => {
    touchStartTime = 0;
    touchMoved = false;
  });

  button.addEventListener('click', (event) => {
    if ('ontouchstart' in window) {
      event.preventDefault();
      return;
    }
    if (entry.english) {
      openDrawer(entry, button);
    }
  });

  return button;
}

function renderDirectory() {
  const groups = groupChaptersBySection(chapters);
  const fragment = document.createDocumentFragment();

  directoryButtons = new Map();
  directoryGroups = new Map();

  groups.forEach((group, index) => {
    const details = document.createElement('details');
    details.className = 'directory-group';
    details.open = index === 0;
    directoryGroups.set(group.key, details);

    const summary = document.createElement('summary');
    summary.className = 'directory-summary';
    summary.textContent = group.label;
    details.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'directory-list';

    group.chapters.forEach((chapter) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'directory-button';
      button.textContent = `${chapter.id.toUpperCase()}  ${chapter.title}`;
      button.addEventListener('click', () => {
        closeChapterDrawer();
        scrollToChapter(chapter.id);
      });
      list.appendChild(button);
      directoryButtons.set(chapter.id, button);
    });

    details.appendChild(list);
    fragment.appendChild(details);
  });

  chapterDirectory.replaceChildren(fragment);

  if (activeChapterId) {
    setActiveChapter(activeChapterId);
  }
}

function renderChapters() {
  chapterElements = new Map();
  closeDrawer();

  if (!chapters.length) {
    chapterView.innerHTML = '<div class="loading">No chants available.</div>';
    return;
  }

  const stack = document.createElement('div');
  stack.className = 'chapter-stack';

  const hero = document.createElement('header');
  hero.className = 'booklet-hero';

  const kicker = document.createElement('p');
  kicker.className = 'booklet-kicker';
  kicker.textContent = 'Buddhist Chanting';

  const title = document.createElement('h1');
  title.className = 'booklet-title';
  title.textContent = 'Booklet';

  hero.append(kicker, title);
  stack.appendChild(hero);

  let lastGroupKey = '';

  chapters.forEach((chapter) => {
    const groupKey = getChapterGroup(chapter);
    if (groupKey !== lastGroupKey) {
      const groupLabel = document.createElement('div');
      groupLabel.className = 'group-break';
      groupLabel.textContent = GROUP_LABELS[groupKey] || GROUP_LABELS.other;
      stack.appendChild(groupLabel);
      lastGroupKey = groupKey;
    }

    const fragment = chapterTemplate.content.cloneNode(true);
    const article = fragment.querySelector('.chapter');
    article.id = `chapter-${chapter.id}`;
    article.dataset.chapterId = chapter.id;
    article.dataset.groupKey = groupKey;

    fragment.querySelector('.chapter-title').textContent = chapter.title;

    const content = fragment.querySelector('.chapter-content');
    chapter.subsections.forEach((subsection) => {
      const section = document.createElement('section');
      section.className = 'subsection';
      subsection.entries.forEach((entry) => {
        if (!entry.pali) {
          return;
        }
        section.appendChild(createEntryElement(entry));
      });
      if (section.childElementCount) {
        content.appendChild(section);
      }
    });

    chapterElements.set(chapter.id, article);
    stack.appendChild(fragment);
  });

  chapterView.replaceChildren(stack);
  renderDirectory();
  updateActiveChapterFromScroll();
}

async function init() {
  cacheElements();

  if (!chapterView || !chapterTemplate || !entryTemplate) {
    throw new Error('Reader UI failed to initialize.');
  }

  saveFontScale(fontScale);

  const response = await fetch('./data/chapters.json');
  const payload = await response.json();
  chapters = payload.chapters || [];
  renderChapters();

  const storedChapterId = chapters.some((chapter) => chapter.id === activeChapterId)
    ? activeChapterId
    : '';
  const firstChapterId = chapters[0]?.id || '';

  if (storedChapterId && storedChapterId !== firstChapterId) {
    scrollToChapter(storedChapterId, 'auto');
  } else if (firstChapterId) {
    setActiveChapter(firstChapterId);
  }
}

function bindEvents() {
  fontDown?.addEventListener('click', () => saveFontScale(fontScale - STEP));
  fontUp?.addEventListener('click', () => saveFontScale(fontScale + STEP));
  chapterMenuToggle?.addEventListener('click', () => {
    if (chapterDrawer.classList.contains('open')) {
      closeChapterDrawer();
      return;
    }
    openChapterDrawer();
  });
  chapterDrawerClose?.addEventListener('click', closeChapterDrawer);
  chapterDrawerBackdrop?.addEventListener('click', closeChapterDrawer);
  helpToggle?.addEventListener('click', () => {
    if (helpModal.classList.contains('open')) {
      closeHelpModal();
      return;
    }
    openHelpModal();
  });
  helpClose?.addEventListener('click', closeHelpModal);
  helpBackdrop?.addEventListener('click', closeHelpModal);
  drawerClose?.addEventListener('click', closeDrawer);
  drawerBackdrop?.addEventListener('click', closeDrawer);
  chapterView?.addEventListener('scroll', queueActiveChapterUpdate, { passive: true });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (helpModal?.classList.contains('open')) {
        closeHelpModal();
        return;
      }
      if (chapterDrawer?.classList.contains('open')) {
        closeChapterDrawer();
        return;
      }
      closeDrawer();
    }
  });
}

function startApp() {
  cacheElements();
  bindEvents();

  init().catch((error) => {
    const root = chapterView || document.querySelector('#chapter-view');
    if (root) {
      root.innerHTML = `<div class="loading">Unable to load chants. ${error.message}</div>`;
    }
    console.error(error);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp, { once: true });
} else {
  startApp();
}
