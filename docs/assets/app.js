const STORAGE_KEYS = {
  chapter: 'chanting.selectedChapter',
  fontScale: 'chanting.fontScale',
};

const MIN_SCALE = 0.85;
const MAX_SCALE = 1.45;
const STEP = 0.05;
const MOVE_THRESHOLD = 10;
const TAP_MAX_MS = 280;

const chapterSelect = document.querySelector('#chapter-select');
const chapterView = document.querySelector('#chapter-view');
const chapterTemplate = document.querySelector('#chapter-template');
const entryTemplate = document.querySelector('#entry-template');
const fontDown = document.querySelector('#font-down');
const fontUp = document.querySelector('#font-up');
const fontSizeLabel = document.querySelector('#font-size-label');
const drawer = document.querySelector('#translation-drawer');
const drawerClose = document.querySelector('#drawer-close');
const drawerSource = document.querySelector('#drawer-source');
const drawerTranslation = document.querySelector('#drawer-translation');
const drawerBackdrop = document.querySelector('#drawer-backdrop');

let chapters = [];
let selectedChapterIndex = 0;
let activeEntryElement = null;
let fontScale = Number(localStorage.getItem(STORAGE_KEYS.fontScale)) || 1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function saveFontScale(nextScale) {
  fontScale = clamp(Number(nextScale.toFixed(2)), MIN_SCALE, MAX_SCALE);
  document.documentElement.style.setProperty('--entry-size', `${(1.55 * fontScale).toFixed(3)}rem`);
  document.documentElement.style.setProperty('--note-size', `${(1.05 * fontScale).toFixed(3)}rem`);
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

function renderChapter(index) {
  selectedChapterIndex = index;
  const chapter = chapters[index];
  if (!chapter) {
    return;
  }

  localStorage.setItem(STORAGE_KEYS.chapter, chapter.id);
  chapterSelect.value = chapter.id;
  closeDrawer();

  const fragment = chapterTemplate.content.cloneNode(true);
  fragment.querySelector('.chapter-id').textContent = chapter.id.toUpperCase();
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

  const prevButton = fragment.querySelector('.prev-button');
  const nextButton = fragment.querySelector('.next-button');
  prevButton.disabled = index === 0;
  nextButton.disabled = index === chapters.length - 1;
  prevButton.addEventListener('click', () => renderChapter(index - 1));
  nextButton.addEventListener('click', () => renderChapter(index + 1));

  chapterView.replaceChildren(fragment);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function init() {
  saveFontScale(fontScale);

  const response = await fetch('./data/chapters.json');
  const payload = await response.json();
  chapters = payload.chapters;

  chapterSelect.innerHTML = '';
  chapters.forEach((chapter) => {
    const option = document.createElement('option');
    option.value = chapter.id;
    option.textContent = `${chapter.id.toUpperCase()} · ${chapter.title}`;
    chapterSelect.appendChild(option);
  });

  chapterSelect.addEventListener('change', () => {
    const nextIndex = chapters.findIndex((chapter) => chapter.id === chapterSelect.value);
    renderChapter(nextIndex === -1 ? 0 : nextIndex);
  });

  const storedChapter = localStorage.getItem(STORAGE_KEYS.chapter);
  const initialIndex = chapters.findIndex((chapter) => chapter.id === storedChapter);
  renderChapter(initialIndex >= 0 ? initialIndex : 0);
}

fontDown.addEventListener('click', () => saveFontScale(fontScale - STEP));
fontUp.addEventListener('click', () => saveFontScale(fontScale + STEP));
drawerClose.addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeDrawer();
  }
});

init().catch((error) => {
  chapterView.innerHTML = `<div class="loading">Unable to load chants. ${error.message}</div>`;
  console.error(error);
});
