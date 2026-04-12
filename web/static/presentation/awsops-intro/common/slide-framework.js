/**
 * Reactive Presentation - Slide Navigation Framework
 * Keyboard (←→, Space, F, Esc) + button navigation, progress bar, slide transitions
 */
class SlideFramework {
  constructor(options = {}) {
    this.currentSlide = 0;
    this.slides = [];
    this.totalSlides = 0;
    this.transitioning = false;
    this.onSlideChange = options.onSlideChange || null;
    this.footer = options.footer || null;
    this.logoSrc = options.logoSrc || null;
    this.presenterNotes = options.presenterNotes || {};
    this.presenterView = null;
    this.slideActions = {};  // { slideIndex: { up: fn, down: fn } }
    this.pagination = options.pagination || false;
    // Fragment system
    this.fragmentState = {};  // { slideIndex: { fragments: [], currentIndex: -1 } }
    // Overview mode
    this.overviewMode = false;
    // Sidebar
    this.sidebarEnabled = options.sidebar !== false;
    this.sidebarVisible = false;
    this.sidebarWasVisible = false; // track state across fullscreen
    this.sidebar = null;
    // Custom key mappings
    this.keyMappings = {};
    this.init();
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.slides = Array.from(document.querySelectorAll('.slide'));
      this.totalSlides = this.slides.length;
      if (this.totalSlides === 0) return;

      // Load custom key mappings from window.__remarpKeys
      if (window.__remarpKeys && typeof window.__remarpKeys === 'object') {
        this.keyMappings = window.__remarpKeys;
      }

      // Read theme config
      if (window.__remarpTheme) {
        if (!this.footer && window.__remarpTheme.footer) this.footer = window.__remarpTheme.footer;
        if (window.__remarpTheme.pagination !== undefined) this.pagination = window.__remarpTheme.pagination;
      }

      this.createProgressBar();
      if (!this.pagination) this.createSlideCounter();
      this.createNavHint();
      if (this.pagination) this.createSlideNumber();
      this.createRefContainer();
      if (this.sidebarEnabled) {
        this.createSidebar();
        this.bindSidebarFullscreen();
        if (!document.fullscreenElement) {
          this.showSidebar();
        }
      }
      this.bindKeys();
      this.bindTouch();
      this.handleHash();
      if (this.footer) this.createFooter();
      if (this.logoSrc) this.createLogo();
      this.initFragments(this.currentSlide);
      this.showSlide(this.currentSlide, false);
    });
  }

  // Fragment system methods
  initFragments(slideIndex) {
    const slide = this.slides[slideIndex];
    if (!slide) return;

    const fragments = Array.from(slide.querySelectorAll('.fragment'));
    // Sort by data-fragment-index if present, otherwise use DOM order
    fragments.sort((a, b) => {
      const aIdx = parseInt(a.dataset.fragmentIndex, 10) || 0;
      const bIdx = parseInt(b.dataset.fragmentIndex, 10) || 0;
      return aIdx - bIdx;
    });

    this.fragmentState[slideIndex] = {
      fragments: fragments,
      currentIndex: -1
    };
  }

  revealNextFragment() {
    const state = this.fragmentState[this.currentSlide];
    if (!state || state.fragments.length === 0) return false;

    if (state.currentIndex < state.fragments.length - 1) {
      state.currentIndex++;
      const fragment = state.fragments[state.currentIndex];
      const targetIndex = fragment.dataset.fragmentIndex;
      fragment.classList.add('visible');
      // Reveal all fragments sharing the same index
      while (state.currentIndex + 1 < state.fragments.length) {
        const next = state.fragments[state.currentIndex + 1];
        if (next.dataset.fragmentIndex === targetIndex) {
          state.currentIndex++;
          next.classList.add('visible');
        } else { break; }
      }
      return true; // Fragment revealed, don't advance slide
    }
    return false; // All fragments revealed, can advance slide
  }

  revealPrevFragment() {
    const state = this.fragmentState[this.currentSlide];
    if (!state || state.fragments.length === 0) return false;

    if (state.currentIndex >= 0) {
      const fragment = state.fragments[state.currentIndex];
      const targetIndex = fragment.dataset.fragmentIndex;
      fragment.classList.remove('visible');
      // Hide all fragments sharing the same index (backwards)
      while (state.currentIndex - 1 >= 0) {
        const prev = state.fragments[state.currentIndex - 1];
        if (prev.dataset.fragmentIndex === targetIndex) {
          state.currentIndex--;
          prev.classList.remove('visible');
        } else { break; }
      }
      state.currentIndex--;
      return true; // Fragment hidden, don't go back slide
    }
    return false; // No fragments to hide, can go back slide
  }

  resetFragments(slideIndex) {
    const state = this.fragmentState[slideIndex];
    if (!state) return;

    state.fragments.forEach(f => f.classList.remove('visible'));
    state.currentIndex = -1;
  }

  hasUnrevealedFragments() {
    const state = this.fragmentState[this.currentSlide];
    if (!state || state.fragments.length === 0) return false;
    return state.currentIndex < state.fragments.length - 1;
  }

  // Overview mode methods
  toggleOverview() {
    this.overviewMode = !this.overviewMode;
    const deck = this.getDeck();
    if (!deck) return;

    if (this.overviewMode) {
      deck.classList.add('overview-mode');
      this.slides.forEach((slide, idx) => {
        slide.classList.add('overview-visible');
        slide.classList.toggle('current', idx === this.currentSlide);
        slide.onclick = () => {
          this.goTo(idx);
          this.toggleOverview();
        };
      });
    } else {
      deck.classList.remove('overview-mode');
      this.slides.forEach(slide => {
        slide.classList.remove('overview-visible', 'current');
        slide.onclick = null;
      });
      this.showSlide(this.currentSlide, false);
    }
  }

  // Sidebar methods
  createSidebar() {
    const sidebar = document.createElement('div');
    sidebar.className = 'slide-sidebar';

    this.slides.forEach((slide, idx) => {
      const thumb = document.createElement('div');
      thumb.className = 'sidebar-thumb';
      thumb.dataset.index = idx;

      const content = document.createElement('div');
      content.className = 'sidebar-thumb-content';
      content.innerHTML = slide.innerHTML;

      // Calculate scale after layout: thumbWidth / 1920
      // Use a fixed approximation; actual width is ~196px (220 - 2*10 padding - 2*2 border)
      const thumbWidth = 196;
      const scale = thumbWidth / 1920;
      content.style.transform = `scale(${scale})`;

      const number = document.createElement('span');
      number.className = 'sidebar-thumb-number';
      number.textContent = idx + 1;

      thumb.appendChild(content);
      thumb.appendChild(number);
      thumb.addEventListener('click', () => this.goTo(idx));
      sidebar.appendChild(thumb);
    });

    document.body.prepend(sidebar);
    this.sidebar = sidebar;
  }

  toggleSidebar() {
    if (this.sidebarVisible) {
      this.hideSidebar();
    } else {
      this.showSidebar();
    }
  }

  showSidebar() {
    if (!this.sidebar) return;
    document.body.classList.add('sidebar-visible');
    this.sidebarVisible = true;
    this.updateSidebarHighlight(this.currentSlide);
  }

  hideSidebar() {
    if (!this.sidebar) return;
    document.body.classList.remove('sidebar-visible');
    this.sidebarVisible = false;
  }

  updateSidebarHighlight(index) {
    if (!this.sidebar) return;
    const thumbs = this.sidebar.querySelectorAll('.sidebar-thumb');
    thumbs.forEach(t => t.classList.remove('active'));
    if (thumbs[index]) {
      thumbs[index].classList.add('active');
      thumbs[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  bindSidebarFullscreen() {
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        // Entering fullscreen — remember state and hide
        this.sidebarWasVisible = this.sidebarVisible;
        this.hideSidebar();
      } else {
        // Exiting fullscreen — restore previous state
        if (this.sidebarWasVisible) {
          this.showSidebar();
        }
      }
    });
  }

  // Get action for a key (supports custom mappings)
  getKeyAction(key) {
    // Check custom mappings first
    if (this.keyMappings[key]) {
      return this.keyMappings[key];
    }
    // Default mappings
    const defaults = {
      'ArrowRight': 'next',
      ' ': 'next',
      'PageDown': 'next',
      'ArrowLeft': 'prev',
      'PageUp': 'prev',
      'ArrowDown': 'down',
      'ArrowUp': 'up',
      'Home': 'first',
      'End': 'last',
      'p': 'presenter',
      'P': 'presenter',
      'f': 'fullscreen',
      'F': 'fullscreen',
      'o': 'overview',
      'O': 'overview',
      's': 'sidebar',
      'S': 'sidebar',
      'Escape': 'escape'
    };
    return defaults[key] || null;
  }

  registerSlideAction(slideIndex, handlers) {
    this.slideActions[slideIndex] = handlers;  // { up: fn, down: fn }
  }

  getDeck() {
    return document.querySelector('.slide-deck');
  }

  updateFooterVisibility(slide) {
    const deck = this.getDeck() || document.body;
    const logo = deck.querySelector('.slide-logo');
    const footer = deck.querySelector('.slide-footer');
    // Hide framework logo/footer when the current slide already contains an <img>
    const hide = slide.querySelector('img') !== null;
    if (logo) logo.style.display = hide ? 'none' : '';
    if (footer) footer.style.display = hide ? 'none' : '';
    const slideNum = deck.querySelector('.slide-number');
    if (slideNum) slideNum.style.display = hide ? 'none' : '';
    const slideRef = deck.querySelector('.slide-ref');
    if (slideRef) slideRef.style.display = hide ? 'none' : '';
  }

  createFooter() {
    const footer = document.createElement('div');
    footer.className = 'slide-footer';
    footer.textContent = this.footer;
    (this.getDeck() || document.body).appendChild(footer);
  }

  createLogo() {
    const logo = document.createElement('img');
    logo.className = 'slide-logo';
    logo.src = this.logoSrc;
    logo.alt = 'Logo';
    (this.getDeck() || document.body).appendChild(logo);
  }

  openPresenterView() {
    if (!this.presenterView) {
      this.presenterView = new PresenterView(this);
    }
    this.presenterView.open();
  }

  createProgressBar() {
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    (this.getDeck() || document.body).appendChild(bar);
    this.progressBar = bar;
  }

  createSlideCounter() {
    const counter = document.createElement('div');
    counter.className = 'slide-counter';
    (this.getDeck() || document.body).appendChild(counter);
    this.counter = counter;
  }

  createNavHint() {
    const hint = document.createElement('div');
    hint.className = 'nav-hint';
    hint.textContent = '← → Space  |  F: Fullscreen  |  P: Presenter  |  O: Overview';
    (this.getDeck() || document.body).appendChild(hint);
    this.navHint = hint;
    // Fade out after 5s
    setTimeout(() => { hint.style.opacity = '0'; }, 5000);
  }

  createSlideNumber() {
    const el = document.createElement('div');
    el.className = 'slide-number';
    (this.getDeck() || document.body).appendChild(el);
    this.slideNumber = el;
  }

  createRefContainer() {
    const el = document.createElement('div');
    el.className = 'slide-ref';
    (this.getDeck() || document.body).appendChild(el);
    this.refContainer = el;
  }

  bindKeys() {
    document.addEventListener('keydown', (e) => {
      // Don't navigate if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const action = this.getKeyAction(e.key);
      if (!action) return;

      switch (action) {
        case 'next':
          e.preventDefault();
          if (this.overviewMode) return;
          this.next();
          break;
        case 'prev':
          e.preventDefault();
          if (this.overviewMode) return;
          this.prev();
          break;
        case 'down':
          e.preventDefault();
          if (this.slideActions[this.currentSlide] && this.slideActions[this.currentSlide].down) {
            const result = this.slideActions[this.currentSlide].down();
            if (result === false) this.next();
          } else if (!this.cycleInteractive(1)) {
            if (!this.revealNextFragment()) {
              this.next();
            }
          }
          break;
        case 'up':
          e.preventDefault();
          if (this.slideActions[this.currentSlide] && this.slideActions[this.currentSlide].up) {
            const result = this.slideActions[this.currentSlide].up();
            if (result === false) this.prev();
          } else if (!this.cycleInteractive(-1)) {
            if (!this.revealPrevFragment()) {
              this.prev();
            }
          }
          break;
        case 'first':
          e.preventDefault();
          this.goTo(0);
          break;
        case 'last':
          e.preventDefault();
          this.goTo(this.totalSlides - 1);
          break;
        case 'presenter':
          e.preventDefault();
          this.openPresenterView();
          break;
        case 'fullscreen':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'overview':
          e.preventDefault();
          this.toggleOverview();
          break;
        case 'sidebar':
          e.preventDefault();
          if (!document.fullscreenElement) this.toggleSidebar();
          break;
        case 'escape':
          if (this.overviewMode) {
            this.toggleOverview();
          } else if (document.fullscreenElement) {
            document.exitFullscreen();
          }
          break;
      }
    });
  }

  bindTouch() {
    let startX = 0;
    const deck = document.querySelector('.slide-deck');
    if (!deck) return;

    deck.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
    }, { passive: true });

    deck.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) {
        dx < 0 ? this.next() : this.prev();
      }
    }, { passive: true });
  }

  handleHash() {
    const hash = window.location.hash;
    if (hash) {
      const num = parseInt(hash.replace('#', ''), 10);
      if (!isNaN(num) && num >= 1 && num <= this.totalSlides) {
        this.currentSlide = num - 1;
      }
    }
  }

  showSlide(index, animate = true) {
    if (index < 0 || index >= this.totalSlides) return;
    if (this.transitioning) return;
    if (this.overviewMode) return; // Don't animate in overview mode

    const prevIndex = this.currentSlide;
    const prev = this.slides[prevIndex];
    const next = this.slides[index];

    // Reset fragments on previous slide
    if (prevIndex !== index) {
      this.resetFragments(prevIndex);
    }

    // Initialize fragments for next slide
    if (!this.fragmentState[index]) {
      this.initFragments(index);
    }

    // Get transition type from slide's data-transition attribute
    const transition = next.dataset.transition || 'fade';

    if (animate && prev !== next) {
      this.transitioning = true;
      prev.classList.remove('active');
      prev.classList.add('leaving');

      // Add transition-specific classes
      prev.classList.add(`transition-${transition}-out`);
      next.classList.add('entering');
      next.classList.add(`transition-${transition}-in`);

      setTimeout(() => {
        prev.classList.remove('leaving', `transition-${transition}-out`);
        next.classList.remove('entering', `transition-${transition}-in`);
        next.classList.add('active');
        this.transitioning = false;
      }, 350);
    } else {
      this.slides.forEach(s => s.classList.remove('active'));
      next.classList.add('active');
    }

    this.currentSlide = index;
    this.updateProgress();
    if (this.sidebar) this.updateSidebarHighlight(index);
    this.updateFooterVisibility(next);
    this.updateRefs(next);
    window.location.hash = index + 1;

    if (this.onSlideChange) {
      this.onSlideChange(index, next);
    }

    // Sync with presenter view
    if (this.presenterView) {
      this.presenterView.broadcastSlideChange(index);
      this.presenterView.updatePresenterView();
    }
  }

  next() { this.showSlide(this.currentSlide + 1); }
  prev() { this.showSlide(this.currentSlide - 1); }
  goTo(index) { this.showSlide(index); }

  updateProgress() {
    const pct = ((this.currentSlide + 1) / this.totalSlides) * 100;
    if (this.progressBar) this.progressBar.style.width = pct + '%';
    if (this.counter) this.counter.textContent = `${this.currentSlide + 1} / ${this.totalSlides}`;
    if (this.slideNumber) {
      this.slideNumber.textContent = (this.currentSlide + 1) + ' / ' + this.totalSlides;
    }
  }

  updateRefs(slide) {
    if (!this.refContainer) return;
    const refsData = slide.dataset.refs;
    if (!refsData) { this.refContainer.innerHTML = ''; return; }
    try {
      const refs = JSON.parse(refsData);
      this.refContainer.innerHTML = refs.map(r =>
        '<a href="' + r.url + '" target="_blank" rel="noopener">' + r.label + '</a>'
      ).join(' &middot; ');
    } catch(e) { this.refContainer.innerHTML = ''; }
  }

  toggleFullscreen() {
    const deck = document.querySelector('.slide-deck');
    if (!deck) return;
    if (!document.fullscreenElement) {
      deck.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }

  cycleInteractive(direction) {
    const slide = this.slides[this.currentSlide];
    if (!slide) return false;

    // Try canvas/timeline step navigation (registered via __canvasStep)
    if (slide.__canvasStep) {
      const dir = direction > 0 ? 'next' : 'prev';
      const result = slide.__canvasStep(dir);
      if (result !== false) return true;
      return false;
    }

    // Try tabs
    const tabBar = slide.querySelector('.tab-bar');
    if (tabBar) {
      const tabs = Array.from(tabBar.querySelectorAll('.tab-btn'));
      const activeIdx = tabs.findIndex(t => t.classList.contains('active'));
      const nextIdx = Math.max(0, Math.min(activeIdx + direction, tabs.length - 1));
      if (nextIdx !== activeIdx) {
        tabs[nextIdx].click();
        return true;
      }
      return false;
    }

    // Try compare toggles
    const toggle = slide.querySelector('.compare-toggle');
    if (toggle) {
      const btns = Array.from(toggle.querySelectorAll('.compare-btn'));
      const activeIdx = btns.findIndex(b => b.classList.contains('active'));
      const nextIdx = Math.max(0, Math.min(activeIdx + direction, btns.length - 1));
      if (nextIdx !== activeIdx) {
        btns[nextIdx].click();
        return true;
      }
      return false;
    }

    return false;
  }
}

// Tab component helper
function initTabs() {
  document.querySelectorAll('.tab-bar').forEach(bar => {
    const tabs = bar.querySelectorAll('.tab-btn');
    const container = bar.parentElement;
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        container.querySelectorAll('.tab-content').forEach(c => {
          c.classList.toggle('active', c.dataset.tab === target);
        });
      });
    });
  });
}

// Checklist helper with expand/collapse for detail blocks
function initChecklists() {
  document.querySelectorAll('.checklist li').forEach(item => {
    item.addEventListener('click', (e) => {
      // Don't toggle if clicking inside the detail block
      if (e.target.closest('.checklist-detail')) return;
      item.classList.toggle('checked');
      // Expand/collapse detail block if present
      const detail = item.querySelector('.checklist-detail');
      if (detail) {
        if (item.classList.contains('checked')) {
          detail.style.display = 'block';
          detail.style.maxHeight = detail.scrollHeight + 'px';
        } else {
          detail.style.maxHeight = '0';
          setTimeout(() => { detail.style.display = 'none'; }, 300);
        }
      }
    });
  });
}

// Compare toggle helper (supports side-by-side and toggle modes)
function initCompareToggles() {
  document.querySelectorAll('.compare-toggle').forEach(toggle => {
    const btns = toggle.querySelectorAll('.compare-btn');
    const container = toggle.parentElement;
    const isSideBySide = container.dataset.compareMode === 'side-by-side';

    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.compare;
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (isSideBySide) {
          // Side-by-side: both panels stay visible, highlight selected
          container.querySelectorAll('.compare-content').forEach(c => {
            c.classList.remove('compare-highlight');
            if (c.dataset.compare === target) {
              c.classList.add('compare-highlight');
            }
          });
        } else {
          // Toggle mode: show only selected panel
          container.querySelectorAll('.compare-content').forEach(c => {
            c.classList.toggle('active', c.dataset.compare === target);
          });
        }
      });
    });
  });
}

// Auto-init on load
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initChecklists();
  initCompareToggles();
});
