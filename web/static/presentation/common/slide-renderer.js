/**
 * SlideRenderer — JSON-driven slide generation for reactive-presentation framework.
 *
 * Reads a slides.json file and renders each slide into HTML using the same
 * patterns documented in slide-patterns.md.  Works with the existing
 * slide-framework.js, theme.css, animation-utils.js, and quiz-component.js.
 *
 * Usage:
 *   new SlideRenderer({ footer, logoSrc }).render('./slides.json');
 */
class SlideRenderer {
  constructor(options = {}) {
    this.options = options;
    this.renderers = {
      cover:     (s) => this.renderCover(s),
      title:     (s) => this.renderTitle(s),
      content:   (s) => this.renderContent(s),
      tabs:      (s) => this.renderTabs(s),
      compare:   (s) => this.renderCompare(s),
      canvas:    (s) => this.renderCanvas(s),
      quiz:      (s) => this.renderQuiz(s),
      checklist: (s) => this.renderChecklist(s),
      timeline:  (s) => this.renderTimeline(s),
      cards:     (s) => this.renderCards(s),
      code:      (s) => this.renderCode(s),
      slider:    (s) => this.renderSlider(s),
      thankyou:  (s) => this.renderThankYou(s),
    };
  }

  /**
   * Fetch slides.json, render all slides, load canvas modules, init framework.
   * @param {string} jsonUrl - Path to the slides.json file
   * @returns {Promise<SlideFramework>} The initialized SlideFramework instance
   */
  async render(jsonUrl) {
    const res = await fetch(jsonUrl);
    if (!res.ok) throw new Error(`Failed to load ${jsonUrl}: ${res.status}`);
    const data = await res.json();

    const deck = document.querySelector('.slide-deck');
    if (!deck) throw new Error('.slide-deck container not found');

    // Render each slide
    data.slides.forEach((slide, i) => {
      const renderer = this.renderers[slide.type];
      if (!renderer) {
        console.warn(`Unknown slide type "${slide.type}" at index ${i}, skipping`);
        return;
      }
      deck.insertAdjacentHTML('beforeend', renderer(slide));
    });

    // Initialize interactive components
    if (typeof initTabs === 'function') initTabs();
    if (typeof initChecklists === 'function') initChecklists();
    if (typeof initCompareToggles === 'function') initCompareToggles();
    if (typeof QuizManager !== 'undefined') new QuizManager();

    // Dynamically load canvas animation modules
    const canvasSlides = data.slides
      .map((s, i) => ({ ...s, index: i }))
      .filter(s => s.type === 'canvas' && s.animationModule);

    for (const cs of canvasSlides) {
      try {
        const mod = await import(cs.animationModule);
        if (typeof mod.init === 'function') {
          mod.init(cs.canvasId, cs.index, deck);
        }
      } catch (err) {
        console.error(`Failed to load animation module for slide ${cs.index}:`, err);
      }
    }

    // Build presenter notes map from JSON
    const presenterNotes = {};
    data.slides.forEach((s, i) => {
      if (s.notes) presenterNotes[i] = s.notes;
    });

    // Initialize SlideFramework
    const fw = new SlideFramework({
      footer: this.options.footer || data.meta.title || '',
      logoSrc: this.options.logoSrc || '',
      presenterNotes,
      ...this.options,
    });

    return fw;
  }

  // ── Escape helper ──────────────────────────────────────────────────

  _esc(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── §0a/§0b Session Cover ─────────────────────────────────────────

  renderCover(s) {
    const speaker = s.speaker;
    const hasPptx = s.pptxBackground;

    if (hasPptx) {
      // §0a — PPTX background
      return `<div class="slide" style="background:url('${this._esc(s.pptxBackground)}') center/cover no-repeat; padding:0; overflow:hidden;">
  <h1 style="position:absolute; left:5%; top:48%; font-size:2.8rem; color:#fff; font-weight:300; line-height:1.2; width:53%; margin:0;">${s.title || ''}</h1>
  <p style="position:absolute; left:5%; top:62%; font-size:1.3rem; color:rgba(255,255,255,0.8); width:53%; margin:0;">${s.subtitle || ''}</p>
  ${speaker ? `<div style="position:absolute; left:5%; top:76%;">
    <p style="font-size:1.05rem; color:#fff; font-weight:600; margin:0;">${this._esc(speaker.name)}</p>
    <p style="font-size:0.9rem; color:rgba(255,255,255,0.65); margin:6px 0 0 0;">${this._esc(speaker.title || '')}</p>
    <p style="font-size:0.9rem; color:rgba(255,255,255,0.65); margin:2px 0 0 0;">${this._esc(speaker.company || '')}</p>
  </div>` : ''}
  ${s.badgeSrc ? `<img src="${this._esc(s.badgeSrc)}" alt="" style="position:absolute; right:5%; bottom:10%; width:8%; pointer-events:none;" />` : ''}
</div>`;
    }

    // §0b — CSS-only fallback
    return `<div class="slide" style="background:linear-gradient(135deg, #1a1f35 0%, #0d1117 50%, #161b2e 100%); padding:0; overflow:hidden; position:relative;">
  <div style="position:absolute; top:-20%; right:-10%; width:60%; height:80%; background:radial-gradient(ellipse, rgba(108,92,231,0.15) 0%, transparent 70%); pointer-events:none;"></div>
  <div style="position:absolute; left:5%; top:42%; width:80px; height:3px; background:linear-gradient(90deg, #6c5ce7, #a29bfe); border-radius:2px;"></div>
  <h1 style="position:absolute; left:5%; top:45%; font-size:2.8rem; color:#fff; font-weight:300; line-height:1.2; width:60%; margin:0;">${s.title || ''}</h1>
  <p style="position:absolute; left:5%; top:60%; font-size:1.3rem; color:rgba(255,255,255,0.7); width:60%; margin:0;">${s.subtitle || ''}</p>
  ${speaker ? `<div style="position:absolute; left:5%; top:75%;">
    <p style="font-size:1.05rem; color:#fff; font-weight:600; margin:0;">${this._esc(speaker.name)}</p>
    <p style="font-size:0.9rem; color:rgba(255,255,255,0.6); margin:6px 0 0 0;">${this._esc(speaker.title || '')}</p>
    <p style="font-size:0.9rem; color:rgba(255,255,255,0.6); margin:2px 0 0 0;">${this._esc(speaker.company || '')}</p>
  </div>` : ''}
</div>`;
  }

  // ── §1 Title Slide ────────────────────────────────────────────────

  renderTitle(s) {
    return `<div class="slide title-slide">
  <h1>${s.title || ''}</h1>
  ${s.subtitle ? `<p class="subtitle">${s.subtitle}</p>` : ''}
  ${s.meta ? `<p class="meta">${this._esc(s.meta)}</p>` : ''}
</div>`;
  }

  // ── §2 Content Slide ──────────────────────────────────────────────

  renderContent(s) {
    return `<div class="slide">
  <div class="slide-header"><h2>${s.title || ''}</h2></div>
  <div class="slide-body">
    ${s.body || ''}
  </div>
</div>`;
  }

  // ── §4 Tab Content Slide ──────────────────────────────────────────

  renderTabs(s) {
    const tabs = s.tabs || [];
    return `<div class="slide">
  <div class="slide-header"><h2>${s.title || ''}</h2></div>
  <div class="slide-body">
    <div class="tab-bar">
      ${tabs.map((t, i) => `<button class="tab-btn${i === 0 ? ' active' : ''}" data-tab="t${i}">${this._esc(t.label)}</button>`).join('\n      ')}
    </div>
    ${tabs.map((t, i) => `<div class="tab-content${i === 0 ? ' active' : ''}" data-tab="t${i}">${t.html || ''}</div>`).join('\n    ')}
  </div>
</div>`;
  }

  // ── §3 Compare Toggle Slide ───────────────────────────────────────

  renderCompare(s) {
    const opts = s.options || [];
    return `<div class="slide">
  <div class="slide-header"><h2>${s.title || ''}</h2></div>
  <div class="slide-body">
    <div class="compare-toggle">
      ${opts.map((o, i) => `<button class="compare-btn${i === 0 ? ' active' : ''}" data-compare="${this._esc(o.id)}">${this._esc(o.label)}</button>`).join('\n      ')}
    </div>
    ${opts.map((o, i) => `<div class="compare-content${i === 0 ? ' active' : ''}" data-compare="${this._esc(o.id)}">${o.html || ''}</div>`).join('\n    ')}
  </div>
</div>`;
  }

  // ── §5 Canvas Animation Slide ─────────────────────────────────────

  renderCanvas(s) {
    const controls = s.controls || ['play', 'reset'];
    const canvasId = s.canvasId || `canvas-${Math.random().toString(36).slice(2, 8)}`;
    const btnHtml = controls.map(c => {
      switch (c) {
        case 'play':  return `<button class="btn btn-primary" data-canvas-action="play" data-canvas="${canvasId}">Play</button>`;
        case 'reset': return `<button class="btn" data-canvas-action="reset" data-canvas="${canvasId}">Reset</button>`;
        case 'step':  return `<button class="btn" data-canvas-action="step" data-canvas="${canvasId}">Step</button>`;
        default:      return '';
      }
    }).filter(Boolean).join('\n      ');

    return `<div class="slide">
  <div class="slide-header"><h2>${s.title || ''}</h2></div>
  <div class="slide-body">
    <div class="canvas-container" style="flex:1">
      <canvas id="${canvasId}"></canvas>
    </div>
    <div class="btn-group" style="justify-content:center; margin-top:12px">
      ${btnHtml}
    </div>
  </div>
</div>`;
  }

  // ── §10 Quiz Slide ────────────────────────────────────────────────

  renderQuiz(s) {
    const questions = s.questions || [];
    return `<div class="slide">
  <div class="slide-header"><h2>${s.title || ''}</h2></div>
  <div class="slide-body" style="overflow-y:auto">
    ${questions.map((q, qi) => `<div class="quiz" data-quiz="q${qi}">
      <div class="quiz-question">${qi + 1}. ${q.question || ''}</div>
      <div class="quiz-options">
        ${(q.options || []).map(o => `<button class="quiz-option" data-correct="${o.correct ? 'true' : 'false'}">${this._esc(o.text)}</button>`).join('\n        ')}
      </div>
      <div class="quiz-feedback"></div>
    </div>`).join('\n    ')}
  </div>
</div>`;
  }

  // ── §7 Checklist Slide ────────────────────────────────────────────

  renderChecklist(s) {
    const items = s.items || [];
    return `<div class="slide">
  <div class="slide-header"><h2>${s.title || ''}</h2></div>
  <div class="slide-body">
    <ul class="checklist">
      ${items.map(item => {
        if (typeof item === 'string') {
          return `<li><span class="check"></span> ${this._esc(item)}</li>`;
        }
        // Object form with optional yaml feedback (§7b)
        return `<li>
        <span class="check"></span>
        <div>
          <strong>${this._esc(item.label)}</strong>
          ${item.yaml ? `<div class="check-yaml"><div class="code-block">${item.yaml}</div></div>` : ''}
        </div>
      </li>`;
      }).join('\n      ')}
    </ul>
  </div>
</div>`;
  }

  // ── §9 Timeline Slide ─────────────────────────────────────────────

  renderTimeline(s) {
    const steps = s.steps || [];
    const parts = [];
    steps.forEach((step, i) => {
      if (i > 0) {
        parts.push(`<div class="timeline-connector${i <= (s.activeStep || 0) ? ' done' : ''}"></div>`);
      }
      const state = i < (s.activeStep || 0) ? ' done' : i === (s.activeStep || 0) ? ' active' : '';
      parts.push(`<div class="timeline-step${state}">
      <div class="timeline-dot">${i + 1}</div>
      <div class="timeline-label">${this._esc(step.label)}</div>
      ${step.desc ? `<div class="timeline-desc">${this._esc(step.desc)}</div>` : ''}
    </div>`);
    });

    return `<div class="slide">
  <div class="slide-header"><h2>${s.title || ''}</h2></div>
  <div class="slide-body">
    <div class="timeline">
      ${parts.join('\n      ')}
    </div>
  </div>
</div>`;
  }

  // ── §11 Cards / Dashboard Slide ───────────────────────────────────

  renderCards(s) {
    const cardsArr = s.cards || [];
    const cols = s.columns || 3;
    return `<div class="slide">
  <div class="slide-header"><h2>${s.title || ''}</h2></div>
  <div class="slide-body">
    <div class="col-${cols}">
      ${cardsArr.map(c => {
        if (c.metric !== undefined) {
          return `<div class="card metric-card">
        <div class="metric-value">${this._esc(String(c.metric))}</div>
        <div class="metric-label">${this._esc(c.label)}</div>
      </div>`;
        }
        return `<div class="card">
        <div class="card-title">${this._esc(c.title || '')}</div>
        <p>${c.html || this._esc(c.text || '')}</p>
      </div>`;
      }).join('\n      ')}
    </div>
  </div>
</div>`;
  }

  // ── §8 Code Slide ─────────────────────────────────────────────────

  renderCode(s) {
    return `<div class="slide">
  <div class="slide-header"><h2>${s.title || ''}</h2></div>
  <div class="slide-body">
    ${s.description ? `<p>${s.description}</p>` : ''}
    <div class="code-block">${s.code || ''}</div>
  </div>
</div>`;
  }

  // ── §6 Slider Slide ───────────────────────────────────────────────

  renderSlider(s) {
    const sliderId = s.sliderId || `slider-${Math.random().toString(36).slice(2, 8)}`;
    return `<div class="slide">
  <div class="slide-header"><h2>${s.title || ''}</h2></div>
  <div class="slide-body">
    <div class="slider-container">
      <label>${this._esc(s.label || 'Parameter')}:</label>
      <input type="range" min="${s.min || 0}" max="${s.max || 100}" value="${s.value || 50}" id="${sliderId}">
      <span class="slider-value" id="${sliderId}-val">${s.value || 50}</span>
    </div>
    <div id="${sliderId}-output">${s.outputHtml || ''}</div>
  </div>
</div>`;
  }

  // ── §13 Thank You Slide ───────────────────────────────────────────

  renderThankYou(s) {
    const nextBlock = s.nextBlock;
    const isFinal = !nextBlock;

    return `<div class="slide">
  <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:24px; text-align:center;">
    <h1 style="font-size:3rem; background:linear-gradient(135deg, var(--accent-light), var(--cyan)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;">Thank You</h1>
    ${s.message ? `<p style="color:var(--text-secondary); font-size:1.1rem;">${this._esc(s.message)}</p>` : ''}
    ${isFinal ? '<p style="color:var(--text-muted); font-size:1rem; margin-top:8px;">수고하셨습니다!</p>' : ''}
    <div style="display:flex; gap:16px; margin-top:20px;">
      <a href="${s.tocHref || 'index.html'}" class="btn ${isFinal ? 'btn-primary ' : ''}btn-sm" style="text-decoration:none;">← 목차로 돌아가기</a>
      ${nextBlock ? `<a href="${this._esc(nextBlock.href)}" class="btn btn-primary btn-sm" style="text-decoration:none;">${this._esc(nextBlock.label || '다음')} →</a>` : ''}
    </div>
  </div>
</div>`;
  }
}
