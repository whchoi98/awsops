/**
 * Presenter View - Dual window slide presentation with notes, timer, and sync
 * Press 'P' to open presenter view (handled by SlideFramework)
 * Draggable splitters between slides/notes and current/next slide
 * Copies main document stylesheets for faithful slide preview rendering
 */
class PresenterView {
  constructor(framework) {
    this.framework = framework;
    this.presenterWindow = null;
    this.channel = new BroadcastChannel('slide-sync');
    this.startTime = null;
    this.timerInterval = null;
    this.windowId = 'main';
    this.setupSync();
  }

  setupSync() {
    this.channel.onmessage = (e) => {
      if (e.data.type === 'goto' && e.data.source !== this.windowId) {
        this.framework.showSlide(e.data.index, true);
        if (this.presenterWindow && !this.presenterWindow.closed) {
          this.updatePresenterView();
        }
      }
    };
  }

  broadcastSlideChange(index) {
    this.channel.postMessage({
      type: 'goto',
      index: index,
      source: this.windowId
    });
  }

  open() {
    if (this.presenterWindow && !this.presenterWindow.closed) {
      this.presenterWindow.focus();
      return;
    }

    const html = this.createPresenterHTML();
    this.presenterWindow = window.open('', 'presenter', 'width=1200,height=800');
    this.presenterWindow.document.write(html);
    this.presenterWindow.document.close();

    if (!this.startTime) {
      this.startTime = Date.now();
    }

    // Expose scale update callback for presenter window's splitter script
    window.__pvScaleUpdate = () => this._updateAllScales();

    this.setupPresenterControls();
    this.startTimer();

    // Defer first render to allow presenter window layout to calculate
    setTimeout(() => this.updatePresenterView(), 300);
  }

  _collectStyleSheets() {
    let sheets = '';
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      sheets += `<link rel="stylesheet" href="${link.href}">\n`;
    });
    document.querySelectorAll('style').forEach(style => {
      sheets += `<style>${style.textContent}</style>\n`;
    });
    return sheets;
  }

  createPresenterHTML() {
    const styleSheets = this._collectStyleSheets();
    const baseHref = window.location.href.split('#')[0];

    return `<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="UTF-8">
<base href="${baseHref}">
<title>Presenter View - ${document.title}</title>
${styleSheets}
<style>
  /* === Override theme.css globals for presenter window === */
  html { font-size: 16px !important; }
  body {
    background: #1a1a2e !important;
    color: #e8eaf0 !important;
    font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    height: 100vh !important;
    width: auto !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    user-select: none !important;
    align-items: stretch !important;
    justify-content: stretch !important;
    margin: 0 !important;
  }

  /* === Presenter UI === */
  .presenter-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 20px;
    background: #0f0f1a;
    border-bottom: 1px solid #2d3250;
    flex-shrink: 0;
  }
  .presenter-timer {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.5rem;
    color: #6c5ce7;
  }
  .presenter-counter {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.1rem;
    color: #9ba1b8;
  }
  .presenter-title {
    font-size: 1rem;
    color: #6b7194;
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .presenter-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  .presenter-slides {
    display: flex;
    overflow: hidden;
    min-height: 80px;
  }
  .presenter-current {
    position: relative;
    background: #0f1117;
    overflow: hidden;
    min-width: 100px;
  }
  .presenter-next {
    position: relative;
    background: #0a0a12;
    overflow: hidden;
    min-width: 60px;
  }
  .slide-label {
    position: absolute;
    top: 6px;
    left: 10px;
    font-size: 0.7rem;
    color: #6b7194;
    background: rgba(15, 17, 23, 0.9);
    padding: 2px 8px;
    border-radius: 4px;
    z-index: 10;
  }
  .slide-preview {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
  }

  /* === Slide preview scaler === */
  .slide-scaler {
    position: absolute;
    top: 0;
    left: 0;
    width: 1280px;
    height: 720px;
    transform-origin: top left;
    overflow: hidden;
    background: var(--bg-primary, #0f1117);
    border-radius: 4px;
  }
  .slide-scaler .slide-deck {
    width: 1280px !important;
    height: 720px !important;
    max-width: none !important;
    max-height: none !important;
    position: relative !important;
    overflow: hidden !important;
    margin: 0 !important;
  }
  .slide-scaler .slide {
    display: flex !important;
    opacity: 1 !important;
    position: absolute !important;
    inset: 0 !important;
    animation: none !important;
    transition: none !important;
  }
  /* Hide framework chrome in previews */
  .slide-scaler .progress-bar,
  .slide-scaler .slide-counter,
  .slide-scaler .slide-footer,
  .slide-scaler .slide-logo,
  .slide-scaler .nav-hint {
    display: none !important;
  }

  /* === Splitters === */
  .splitter-v {
    width: 6px;
    background: #2d3250;
    cursor: col-resize;
    flex-shrink: 0;
    position: relative;
    transition: background 150ms;
  }
  .splitter-v:hover, .splitter-v.dragging {
    background: #6c5ce7;
  }
  .splitter-v::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 1px;
    width: 4px;
    height: 32px;
    transform: translateY(-50%);
    border-left: 1px solid #6b7194;
    border-right: 1px solid #6b7194;
  }

  .splitter-h {
    height: 6px;
    background: #2d3250;
    cursor: row-resize;
    flex-shrink: 0;
    position: relative;
    transition: background 150ms;
  }
  .splitter-h:hover, .splitter-h.dragging {
    background: #6c5ce7;
  }
  .splitter-h::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 1px;
    height: 4px;
    width: 32px;
    transform: translateX(-50%);
    border-top: 1px solid #6b7194;
    border-bottom: 1px solid #6b7194;
  }

  /* === Notes === */
  .presenter-notes {
    overflow-y: auto;
    padding: 14px 24px;
    background: #0f0f1a;
    min-height: 80px;
  }
  .presenter-notes h3 {
    font-size: 0.8rem;
    color: #6b7194;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .presenter-notes .notes-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .presenter-notes .timing-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: rgba(108, 92, 231, 0.2);
    border: 1px solid #6c5ce7;
    border-radius: 12px;
    font-size: 0.75rem;
    color: #a29bfe;
    font-family: 'JetBrains Mono', monospace;
  }
  .presenter-notes .notes-content {
    font-size: 1.3rem;
    line-height: 1.7;
    color: #dde0e8;
    word-break: keep-all;
  }
  .presenter-notes .notes-content p { margin: 0.5em 0; }
  .presenter-notes .notes-content ul, .presenter-notes .notes-content ol {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }
  .presenter-notes .notes-content li { margin: 0.3em 0; }
  .presenter-notes .notes-content strong { color: #fff; font-weight: 600; }
  .presenter-notes .notes-content code {
    background: rgba(108, 92, 231, 0.2);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.9em;
  }

  /* === Cue Markers === */
  .cue-markers {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .cue-marker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
  }
  .cue-marker.demo {
    background: rgba(116, 185, 255, 0.15);
    color: #74b9ff;
    border: 1px solid rgba(116, 185, 255, 0.3);
  }
  .cue-marker.pause {
    background: rgba(253, 203, 110, 0.15);
    color: #fdcb6e;
    border: 1px solid rgba(253, 203, 110, 0.3);
  }
  .cue-marker.question {
    background: rgba(0, 184, 148, 0.15);
    color: #00b894;
    border: 1px solid rgba(0, 184, 148, 0.3);
  }
  .cue-marker.transition {
    background: rgba(162, 155, 254, 0.15);
    color: #a29bfe;
    border: 1px solid rgba(162, 155, 254, 0.3);
  }

  /* === Nav === */
  .presenter-nav {
    display: flex;
    justify-content: center;
    gap: 12px;
    padding: 8px;
    background: #0f0f1a;
    border-top: 1px solid #2d3250;
    flex-shrink: 0;
  }
  .presenter-nav button {
    padding: 6px 20px;
    border: 1px solid #2d3250;
    border-radius: 6px;
    background: #232740;
    color: #e8eaf0;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 150ms ease;
  }
  .presenter-nav button:hover {
    background: #2d3250;
    border-color: #6c5ce7;
  }
  .end-message {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #6b7194;
    font-style: italic;
  }

  .drag-overlay {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 9999;
  }
  .drag-overlay.active { display: block; }
</style>
</head><body>

<div class="presenter-topbar">
  <span class="presenter-title" id="p-title"></span>
  <span class="presenter-timer" id="p-timer">00:00:00</span>
  <span class="presenter-counter" id="p-counter"></span>
</div>

<div class="presenter-content" id="p-content">
  <div class="presenter-slides" id="p-slides">
    <div class="presenter-current" id="p-current-wrap">
      <span class="slide-label">Current Slide</span>
      <div class="slide-preview" id="p-current"></div>
    </div>
    <div class="splitter-v" id="splitter-v"></div>
    <div class="presenter-next" id="p-next-wrap">
      <span class="slide-label">Next Slide</span>
      <div class="slide-preview" id="p-next"></div>
    </div>
  </div>
  <div class="splitter-h" id="splitter-h"></div>
  <div class="presenter-notes" id="p-notes-wrap">
    <div class="notes-header">
      <h3>Speaker Notes</h3>
      <span class="timing-badge" id="p-timing" style="display:none;">
        <span>Target:</span>
        <span id="p-timing-value">0 min</span>
      </span>
    </div>
    <div class="cue-markers" id="p-cues"></div>
    <div class="notes-content" id="p-notes">No notes for this slide.</div>
  </div>
</div>

<div class="presenter-nav">
  <button id="p-prev">&larr; Previous</button>
  <button id="p-next-btn">Next &rarr;</button>
</div>

<div class="drag-overlay" id="drag-overlay"></div>

<script>
(function() {
  var overlay = document.getElementById('drag-overlay');

  // --- Horizontal splitter (slides vs notes) ---
  var hSplitter = document.getElementById('splitter-h');
  var content = document.getElementById('p-content');
  var slidesRow = document.getElementById('p-slides');
  var notesWrap = document.getElementById('p-notes-wrap');

  var hRatio = parseFloat(localStorage.getItem('pv-h-ratio') || '0.55');
  applyHRatio(hRatio);

  function applyHRatio(r) {
    r = Math.max(0.15, Math.min(0.85, r));
    slidesRow.style.flex = '0 0 ' + (r * 100) + '%';
    notesWrap.style.flex = '1 1 0%';
  }

  var hDragging = false;
  hSplitter.addEventListener('mousedown', function(e) {
    e.preventDefault();
    hDragging = true;
    hSplitter.classList.add('dragging');
    overlay.classList.add('active');
    overlay.style.cursor = 'row-resize';
  });

  // --- Vertical splitter (current vs next) ---
  var vSplitter = document.getElementById('splitter-v');
  var currentWrap = document.getElementById('p-current-wrap');
  var nextWrap = document.getElementById('p-next-wrap');

  var vRatio = parseFloat(localStorage.getItem('pv-v-ratio') || '0.55');
  applyVRatio(vRatio);

  function applyVRatio(r) {
    r = Math.max(0.2, Math.min(0.85, r));
    currentWrap.style.flex = '0 0 ' + (r * 100) + '%';
    nextWrap.style.flex = '1 1 0%';
  }

  var vDragging = false;
  vSplitter.addEventListener('mousedown', function(e) {
    e.preventDefault();
    vDragging = true;
    vSplitter.classList.add('dragging');
    overlay.classList.add('active');
    overlay.style.cursor = 'col-resize';
  });

  // --- Shared mousemove / mouseup ---
  document.addEventListener('mousemove', function(e) {
    if (hDragging) {
      var rect = content.getBoundingClientRect();
      var y = e.clientY - rect.top;
      hRatio = y / rect.height;
      applyHRatio(hRatio);
    }
    if (vDragging) {
      var rect = slidesRow.getBoundingClientRect();
      var x = e.clientX - rect.left;
      vRatio = x / rect.width;
      applyVRatio(vRatio);
    }
  });

  document.addEventListener('mouseup', function() {
    if (hDragging) {
      hDragging = false;
      hSplitter.classList.remove('dragging');
      localStorage.setItem('pv-h-ratio', String(Math.max(0.15, Math.min(0.85, hRatio))));
    }
    if (vDragging) {
      vDragging = false;
      vSplitter.classList.remove('dragging');
      localStorage.setItem('pv-v-ratio', String(Math.max(0.2, Math.min(0.85, vRatio))));
    }
    overlay.classList.remove('active');
    overlay.style.cursor = '';
    // Notify opener to recalculate preview scales after splitter drag
    try { window.opener && window.opener.__pvScaleUpdate && window.opener.__pvScaleUpdate(); } catch(e) {}
  });
})();
</script>
</body></html>`;
  }

  setupPresenterControls() {
    const win = this.presenterWindow;
    const doc = win.document;

    doc.getElementById('p-prev').onclick = () => {
      this.framework.prev();
      this.broadcastSlideChange(this.framework.currentSlide);
      this.updatePresenterView();
    };

    doc.getElementById('p-next-btn').onclick = () => {
      this.framework.next();
      this.broadcastSlideChange(this.framework.currentSlide);
      this.updatePresenterView();
    };

    doc.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          this.framework.next();
          this.broadcastSlideChange(this.framework.currentSlide);
          this.updatePresenterView();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.framework.prev();
          this.broadcastSlideChange(this.framework.currentSlide);
          this.updatePresenterView();
          break;
      }
    });

    doc.getElementById('p-title').textContent = document.title;

    // Recalculate scales on presenter window resize
    win.addEventListener('resize', () => this._updateAllScales());
  }

  updatePresenterView() {
    if (!this.presenterWindow || this.presenterWindow.closed) return;

    const doc = this.presenterWindow.document;
    const idx = this.framework.currentSlide;
    const slides = this.framework.slides;

    doc.getElementById('p-counter').textContent = `${idx + 1} / ${this.framework.totalSlides}`;

    // Current slide
    const currentEl = doc.getElementById('p-current');
    this._renderSlidePreview(doc, currentEl, slides[idx]);

    // Next slide
    const nextEl = doc.getElementById('p-next');
    if (idx + 1 < slides.length) {
      this._renderSlidePreview(doc, nextEl, slides[idx + 1]);
    } else {
      nextEl.innerHTML = '<div class="end-message">End of presentation</div>';
    }

    // Notes, cues, and timing
    this.updateNotes(doc, idx);
  }

  updateNotes(doc, slideIndex) {
    const noteKey = slideIndex + 1;
    const notesData = (this.framework.presenterNotes || {})[noteKey];
    const notesEl = doc.getElementById('p-notes');
    const cuesEl = doc.getElementById('p-cues');
    const timingEl = doc.getElementById('p-timing');
    const timingValueEl = doc.getElementById('p-timing-value');

    // Handle notes - can be string or object { text, cues, timing }
    let notesText = 'No notes for this slide.';
    let cues = [];
    let timing = null;

    if (typeof notesData === 'string') {
      notesText = notesData;
    } else if (notesData && typeof notesData === 'object') {
      notesText = notesData.text || notesData.notes || 'No notes for this slide.';
      cues = notesData.cues || [];
      timing = notesData.timing || null;
    }

    // Also check slide element for data-cues and data-timing attributes
    const slide = this.framework.slides[slideIndex];
    if (slide) {
      const dataCues = slide.dataset.cues;
      const dataTiming = slide.dataset.timing;
      if (dataCues) {
        try {
          cues = JSON.parse(dataCues);
        } catch (e) { /* ignore parsing errors */ }
      }
      if (dataTiming) {
        timing = dataTiming;
      }
    }

    // Render rich notes as HTML
    notesEl.innerHTML = this.renderRichNotes(notesText);

    // Render cue markers
    this.renderCueMarkers(cuesEl, cues);

    // Render timing badge
    if (timing) {
      timingEl.style.display = 'inline-flex';
      timingValueEl.textContent = timing;
    } else {
      timingEl.style.display = 'none';
    }
  }

  renderRichNotes(text) {
    if (!text) return 'No notes for this slide.';

    // Convert markdown-like formatting to HTML
    let html = text
      // Escape HTML first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Line breaks
      .replace(/\n/g, '<br>');

    // Handle bullet lists (lines starting with - or *)
    html = html.replace(/(<br>|^)([-*]\s)(.+?)(?=<br>[-*]\s|<br>[^-*]|$)/g, (match, br, bullet, content) => {
      return `${br}<li>${content}</li>`;
    });

    // Wrap consecutive <li> items in <ul>
    html = html.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');

    return html;
  }

  renderCueMarkers(container, cues) {
    container.innerHTML = '';
    if (!cues || !Array.isArray(cues) || cues.length === 0) return;

    const cueIcons = {
      demo: { icon: '🎬', label: 'Demo' },
      pause: { icon: '⏸', label: 'Pause' },
      question: { icon: '❓', label: 'Question' },
      transition: { icon: '🔄', label: 'Transition' }
    };

    cues.forEach(cue => {
      const type = cue.type || cue;
      const label = cue.label || cueIcons[type]?.label || type;
      const icon = cueIcons[type]?.icon || '📌';

      const marker = document.createElement('div');
      marker.className = `cue-marker ${type}`;
      marker.innerHTML = `<span>${icon}</span><span>${label}</span>`;
      container.appendChild(marker);
    });
  }

  _renderSlidePreview(doc, container, sourceSlide) {
    container.innerHTML = '';

    const scaler = doc.createElement('div');
    scaler.className = 'slide-scaler';

    const deck = doc.createElement('div');
    deck.className = 'slide-deck';

    const clone = sourceSlide.cloneNode(true);
    clone.className = 'slide active';

    deck.appendChild(clone);
    scaler.appendChild(deck);
    container.appendChild(scaler);

    // Calculate centered scale to fit container
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this._applyScale(scaler, rect.width, rect.height);
    }
  }

  _applyScale(scaler, containerW, containerH) {
    const scale = Math.min(containerW / 1280, containerH / 720);
    const scaledW = 1280 * scale;
    const scaledH = 720 * scale;
    const offsetX = (containerW - scaledW) / 2;
    const offsetY = (containerH - scaledH) / 2;
    scaler.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }

  _updateAllScales() {
    if (!this.presenterWindow || this.presenterWindow.closed) return;
    const doc = this.presenterWindow.document;

    doc.querySelectorAll('.slide-preview').forEach(container => {
      const scaler = container.querySelector('.slide-scaler');
      if (!scaler) return;
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this._applyScale(scaler, rect.width, rect.height);
      }
    });
  }

  startTimer() {
    if (this.timerInterval) return;

    this.timerInterval = setInterval(() => {
      if (!this.presenterWindow || this.presenterWindow.closed) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        return;
      }
      const elapsed = Date.now() - this.startTime;
      const el = this.presenterWindow.document.getElementById('p-timer');
      if (el) el.textContent = this.formatTime(elapsed);
    }, 1000);
  }

  formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  destroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.presenterWindow && !this.presenterWindow.closed) {
      this.presenterWindow.close();
    }
    this.channel.close();
  }
}
