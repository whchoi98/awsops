/**
 * Export Utilities for Reactive Presentation
 * PDF export (via browser print) and ZIP download (via JSZip CDN).
 * Include in TOC index.html pages: <script src="../common/export-utils.js"></script>
 */
const ExportUtils = {
  JSZIP_CDN: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  PPTXGEN_CDN: 'https://cdn.jsdelivr.net/gh/gitbrent/PptxGenJS@3.12.0/dist/pptxgen.bundle.js',

  /** Escape HTML special characters to prevent XSS in generated markup */
  _escapeHTML: function(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  /** Image file extensions to include in ZIP */
  _IMAGE_EXTS: /\.(svg|png|jpg|jpeg|gif|webp|ico)$/i,

  /**
   * Extract referenced image URLs from an HTML string.
   * Scans for <img src>, CSS url(), and JS .src assignments.
   * Returns deduplicated array of relative image paths.
   */
  _extractImageURLs: function(html) {
    var urls = new Set();
    var match;

    // Pattern 1: <img ... src="PATH" ...>
    var imgSrc = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi;
    while ((match = imgSrc.exec(html)) !== null) urls.add(match[1]);

    // Pattern 2: url('PATH') or url(PATH) — CSS backgrounds
    var cssUrl = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    while ((match = cssUrl.exec(html)) !== null) urls.add(match[1]);

    // Pattern 3: .src = 'PATH' or .src = "PATH" — JS image loading
    var jsSrc = /\.src\s*=\s*['"]([^'"]+)['"]/gi;
    while ((match = jsSrc.exec(html)) !== null) urls.add(match[1]);

    // Filter: keep only relative paths to image files, exclude data URIs and absolute URLs
    var imageExts = this._IMAGE_EXTS;
    return Array.from(urls).filter(function(u) {
      if (u.indexOf('data:') === 0 || u.indexOf('http://') === 0 || u.indexOf('https://') === 0 || u.indexOf('//') === 0) return false;
      return imageExts.test(u);
    });
  },

  COMMON_FILES: [
    'theme.css', 'theme-override.css', 'slide-framework.js',
    'presenter-view.js', 'animation-utils.js', 'quiz-component.js',
    'export-utils.js'
  ],

  /** Discover block HTML files from .block-card anchor links on the current page */
  getBlockFiles: function() {
    return Array.from(document.querySelectorAll('a.block-card'))
      .map(function(a) { return a.getAttribute('href'); })
      .filter(Boolean);
  },

  /** Get presentation slug from current URL path */
  getSlug: function() {
    var parts = window.location.pathname.replace(/\/index\.html$/, '').split('/').filter(Boolean);
    return parts[parts.length - 1] || 'presentation';
  },

  /**
   * Export all slides as PDF via browser print dialog.
   * Fetches all block HTML files, extracts slides, opens a print-optimized view.
   * @param {Object} options - { title: string }
   */
  exportPDF: async function(options) {
    options = options || {};
    var title = options.title || document.title;
    var blocks = options.blocks || this.getBlockFiles();
    if (!blocks.length) { alert('No block files found on this page.'); return; }

    this.showProgress('Preparing PDF export...');

    try {
      var responses = await Promise.all(
        blocks.map(function(file, i) {
          ExportUtils.updateProgress('Fetching ' + file + '...', ((i + 1) / blocks.length) * 50);
          return fetch(file).then(function(r) {
            if (!r.ok) throw new Error('Failed to fetch ' + file + ': ' + r.status);
            return r.text();
          });
        })
      );

      var allStyles = '';
      var allSlides = '';
      var slideCount = 0;

      responses.forEach(function(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('style').forEach(function(s) { allStyles += s.textContent + '\n'; });
        doc.querySelectorAll('.slide').forEach(function(slide) {
          slideCount++;
          allSlides += '<div class="slide print-slide">' + slide.innerHTML + '</div>\n';
        });
      });

      this.updateProgress('Building print view (' + slideCount + ' slides)...', 75);

      var baseURL = window.location.href;
      var printHTML = '<!DOCTYPE html>\n<html lang="ko">\n<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<base href="' + this._escapeHTML(baseURL) + '">\n' +
        '<title>' + this._escapeHTML(title) + ' - PDF Export</title>\n' +
        '<link rel="stylesheet" href="../common/theme.css">\n' +
        '<link rel="stylesheet" href="../common/theme-override.css">\n' +
        '<style>\n' +
        '@page { size: 16in 9in landscape; margin: 0; }\n' +
        'html, body { margin: 0; padding: 0; background: #000; overflow: visible !important; display: block !important; height: auto !important; }\n' +
        '.print-slide {\n' +
        '  width: 16in; height: 9in;\n' +
        '  display: flex !important; flex-direction: column;\n' +
        '  padding: 2rem 2.7rem;\n' +
        '  background: var(--bg-primary);\n' +
        '  position: relative;\n' +
        '  page-break-after: always;\n' +
        '  overflow: hidden;\n' +
        '  box-sizing: border-box;\n' +
        '}\n' +
        '.print-slide:last-child { page-break-after: auto; }\n' +
        'canvas { display: none !important; }\n' +
        '.canvas-container { position: relative; }\n' +
        '.canvas-container::after {\n' +
        '  content: "[Interactive Animation]";\n' +
        '  display: flex; align-items: center; justify-content: center;\n' +
        '  width: 100%; min-height: 200px;\n' +
        '  color: var(--text-muted); font-style: italic; font-size: 1.1rem;\n' +
        '  background: var(--bg-secondary); border-radius: 0.5rem;\n' +
        '}\n' +
        '.canvas-controls { display: none !important; }\n' +
        '.progress-bar, .slide-counter, .nav-hint, .slide-logo, .slide-footer { display: none !important; }\n' +
        allStyles + '\n' +
        '</style>\n' +
        '</head>\n<body>\n' +
        allSlides +
        '<script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };<\/script>\n' +
        '</body>\n</html>';

      this.updateProgress('Opening print dialog...', 95);

      var printWindow = window.open('', '_blank');
      if (!printWindow) {
        this.hideProgress();
        alert('Pop-up blocked. Please allow pop-ups for this site and try again.');
        return;
      }
      printWindow.document.write(printHTML);
      printWindow.document.close();

      this.hideProgress();
    } catch (err) {
      this.hideProgress();
      alert('PDF export failed: ' + err.message);
      console.error('PDF export error:', err);
    }
  },

  /**
   * Download all presentation files as a ZIP archive.
   * Includes block HTMLs, TOC page, common framework files, and all referenced images.
   * Images are discovered by scanning HTML content for <img src>, CSS url(), and JS .src patterns.
   * @param {Object} options - { slug: string }
   */
  downloadZIP: async function(options) {
    options = options || {};
    var slug = options.slug || this.getSlug();
    var blocks = options.blocks || this.getBlockFiles();
    if (!blocks.length) { alert('No block files found on this page.'); return; }

    this.showProgress('Preparing ZIP download...');

    try {
      this.updateProgress('Loading JSZip library...', 5);
      await this.loadJSZip();

      var zip = new JSZip();
      var slugFolder = zip.folder(slug);
      var commonFolder = zip.folder('common');
      var imageURLs = new Set();
      var fetched = 0;
      var totalFiles = blocks.length + this.COMMON_FILES.length + 1;

      // Fetch block HTML files and scan for referenced images
      var blockHTMLs = [];
      for (var i = 0; i < blocks.length; i++) {
        var file = blocks[i];
        this.updateProgress('Fetching ' + file + '...', 10 + (fetched / totalFiles) * 40);
        var resp = await fetch(file);
        if (resp.ok) {
          var html = await resp.text();
          slugFolder.file(file, html);
          blockHTMLs.push(html);
        }
        fetched++;
      }

      // Fetch TOC index.html (current page) and scan for images
      this.updateProgress('Fetching index.html...', 10 + (fetched / totalFiles) * 40);
      var tocResp = await fetch('index.html');
      var tocHTML = '';
      if (tocResp.ok) {
        tocHTML = await tocResp.text();
        slugFolder.file('index.html', tocHTML);
      }
      fetched++;

      // Fetch common framework files and scan theme-override.css for images
      var themeOverrideCSS = '';
      for (var j = 0; j < this.COMMON_FILES.length; j++) {
        var cFile = this.COMMON_FILES[j];
        this.updateProgress('Fetching common/' + cFile + '...', 10 + (fetched / totalFiles) * 40);
        try {
          var cResp = await fetch('../common/' + cFile);
          if (cResp.ok) {
            var cText = await cResp.text();
            commonFolder.file(cFile, cText);
            if (cFile === 'theme-override.css') themeOverrideCSS = cText;
          }
        } catch (e) { /* skip missing optional files */ }
        fetched++;
      }

      // Scan all fetched HTML/CSS content for referenced image URLs
      this.updateProgress('Scanning for referenced images...', 55);
      var self = this;
      blockHTMLs.forEach(function(html) {
        // Block HTML paths are relative to the slug dir (e.g., ../common/aws-icons/...)
        self._extractImageURLs(html).forEach(function(u) { imageURLs.add(u); });
      });
      this._extractImageURLs(tocHTML).forEach(function(u) { imageURLs.add(u); });
      // theme-override.css lives in common/, so paths are relative to common/ (e.g., pptx-theme/images/...)
      this._extractImageURLs(themeOverrideCSS).forEach(function(u) {
        // Normalize to ../common/ relative form to match block HTML paths
        if (u.indexOf('../') !== 0 && u.indexOf('./') !== 0) {
          imageURLs.add('../common/' + u);
        } else {
          imageURLs.add(u);
        }
      });

      // Fetch discovered images and add to ZIP
      var imageList = Array.from(imageURLs);
      var imgFetched = 0;
      for (var k = 0; k < imageList.length; k++) {
        var imgURL = imageList[k];
        this.updateProgress('Fetching image ' + (k + 1) + '/' + imageList.length + '...', 58 + (imgFetched / Math.max(imageList.length, 1)) * 20);
        try {
          var imgResp = await fetch(imgURL);
          if (imgResp.ok) {
            // Resolve ../common/path/to/img → common/path/to/img in ZIP
            var zipPath = imgURL.replace(/^\.\.\//g, '');
            zip.file(zipPath, await imgResp.blob());
          }
        } catch (e) { /* skip unreachable images */ }
        imgFetched++;
      }

      this.updateProgress('Generating ZIP archive...', 80);

      var blob = await zip.generateAsync({ type: 'blob' }, function(metadata) {
        ExportUtils.updateProgress('Compressing... ' + Math.round(metadata.percent) + '%', 80 + (metadata.percent / 100) * 15);
      });

      // Trigger browser download
      this.updateProgress('Starting download...', 98);
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = slug + '.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.hideProgress();
    } catch (err) {
      this.hideProgress();
      alert('ZIP download failed: ' + err.message);
      console.error('ZIP download error:', err);
    }
  },

  /** Lazy-load JSZip from CDN */
  loadJSZip: function() {
    if (window.JSZip) return Promise.resolve();
    return new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = ExportUtils.JSZIP_CDN;
      script.onload = resolve;
      script.onerror = function() { reject(new Error('Failed to load JSZip from CDN')); };
      document.head.appendChild(script);
    });
  },

  /** Lazy-load PptxGenJS from CDN */
  loadPptxGen: function() {
    if (window.PptxGenJS) return Promise.resolve();
    return new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = ExportUtils.PPTXGEN_CDN;
      script.onload = resolve;
      script.onerror = function() { reject(new Error('Failed to load PptxGenJS from CDN')); };
      document.head.appendChild(script);
    });
  },

  /**
   * Export presentation as PPTX file via PptxGenJS.
   * Extracts text content from HTML slides and generates downloadable .pptx.
   * @param {Object} options - { title: string }
   */
  exportPPTX: async function(options) {
    options = options || {};
    var title = options.title || document.title;
    var slug = this.getSlug();
    var blocks = options.blocks || this.getBlockFiles();
    if (!blocks.length) { alert('No block files found on this page.'); return; }

    this.showProgress('Preparing PPTX export...');

    try {
      this.updateProgress('Loading PptxGenJS library...', 5);
      await this.loadPptxGen();

      var pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';
      pres.author = 'Reactive Presentation';
      pres.title = title;

      // Apply theme colors if available
      var theme = window.__remarpTheme || {};
      var bgColor = '1a1d2e';
      var textColor = 'FFFFFF';
      var accentColor = 'FF9900';
      if (theme.colors) {
        if (theme.colors.dk1) bgColor = theme.colors.dk1.replace('#', '');
        if (theme.colors.lt1) textColor = theme.colors.lt1.replace('#', '');
        if (theme.colors.accent1) accentColor = theme.colors.accent1.replace('#', '');
      }

      pres.defineSlideMaster({
        title: 'REACTIVE_MASTER',
        background: { color: bgColor },
        objects: []
      });

      // Fetch all block HTML files
      var totalSlides = 0;
      for (var i = 0; i < blocks.length; i++) {
        var file = blocks[i];
        this.updateProgress('Processing ' + file + '...', 10 + (i / blocks.length) * 70);

        var resp = await fetch(file);
        if (!resp.ok) continue;
        var html = await resp.text();

        var doc = new DOMParser().parseFromString(html, 'text/html');
        var slides = doc.querySelectorAll('.slide');

        for (var j = 0; j < slides.length; j++) {
          var slideEl = slides[j];
          var pptxSlide = pres.addSlide({ masterName: 'REACTIVE_MASTER' });
          totalSlides++;

          // Extract heading
          var heading = slideEl.querySelector('h1, h2');
          if (heading) {
            var isH1 = heading.tagName === 'H1';
            pptxSlide.addText(heading.textContent.trim(), {
              x: 0.5, y: isH1 ? 1.5 : 0.3, w: '90%',
              fontSize: isH1 ? 36 : 24,
              color: isH1 ? accentColor : accentColor,
              bold: true,
              fontFace: 'Arial'
            });
          }

          // Extract bullet points
          var listItems = slideEl.querySelectorAll('li');
          if (listItems.length > 0) {
            var bullets = [];
            listItems.forEach(function(li) {
              bullets.push({
                text: li.textContent.trim(),
                options: { fontSize: 16, color: textColor, bullet: true, fontFace: 'Arial' }
              });
            });
            pptxSlide.addText(bullets, {
              x: 0.5, y: heading ? 1.2 : 0.5, w: '90%', h: '60%',
              valign: 'top'
            });
          }

          // Extract paragraphs (non-list text)
          var paragraphs = slideEl.querySelectorAll('.slide-body > p, .slide-body .col > p');
          if (paragraphs.length > 0 && listItems.length === 0) {
            var pTexts = [];
            paragraphs.forEach(function(p) {
              if (p.textContent.trim()) {
                pTexts.push({
                  text: p.textContent.trim(),
                  options: { fontSize: 16, color: textColor, fontFace: 'Arial', breakLine: true }
                });
              }
            });
            if (pTexts.length > 0) {
              pptxSlide.addText(pTexts, {
                x: 0.5, y: heading ? 1.2 : 0.5, w: '90%', h: '60%',
                valign: 'top'
              });
            }
          }

          // Extract code blocks
          var codeBlocks = slideEl.querySelectorAll('.code-block, pre, code');
          codeBlocks.forEach(function(codeEl, ci) {
            var codeText = codeEl.textContent.trim();
            if (codeText.length > 500) codeText = codeText.substring(0, 500) + '\n...';
            pptxSlide.addText(codeText, {
              x: 0.5, y: 3.0 + ci * 1.5, w: '90%',
              fontSize: 10, color: 'C0C0C0', fontFace: 'Courier New',
              fill: { color: '2D2D2D' },
              margin: [8, 12, 8, 12]
            });
          });

          // Canvas/interactive placeholders
          var canvases = slideEl.querySelectorAll('canvas, .canvas-container');
          canvases.forEach(function(c) {
            var canvasId = c.id || c.querySelector('canvas')?.id || 'interactive';
            pptxSlide.addText('[Interactive: ' + canvasId + ']', {
              x: 1, y: 2.5, w: '80%', h: 2,
              fontSize: 18, color: '888888', fontFace: 'Arial',
              align: 'center', valign: 'middle',
              fill: { color: '2D2D2D' },
              border: { type: 'dash', pt: 1, color: '666666' }
            });
          });

          // Mermaid placeholders
          var mermaids = slideEl.querySelectorAll('.mermaid');
          mermaids.forEach(function() {
            pptxSlide.addText('[Mermaid Diagram]', {
              x: 1, y: 2.5, w: '80%', h: 2,
              fontSize: 18, color: '888888', fontFace: 'Arial',
              align: 'center', valign: 'middle',
              fill: { color: '2D2D2D' },
              border: { type: 'dash', pt: 1, color: '666666' }
            });
          });
        }
      }

      this.updateProgress('Generating PPTX (' + totalSlides + ' slides)...', 85);

      // Generate and trigger download
      await pres.writeFile({ fileName: slug + '.pptx' });

      this.hideProgress();
    } catch (err) {
      this.hideProgress();
      alert('PPTX export failed: ' + err.message);
      console.error('PPTX export error:', err);
    }
  },

  /** Show progress overlay */
  showProgress: function(msg) {
    var overlay = document.getElementById('export-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'export-overlay';
      overlay.className = 'export-overlay';
      overlay.innerHTML =
        '<div class="export-progress-content">' +
        '<div class="export-progress-text"></div>' +
        '<div class="export-progress-track"><div class="export-progress-bar"></div></div>' +
        '</div>';
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    overlay.querySelector('.export-progress-text').textContent = msg || '';
    overlay.querySelector('.export-progress-bar').style.width = '0%';
  },

  /** Update progress overlay text and bar */
  updateProgress: function(msg, pct) {
    var overlay = document.getElementById('export-overlay');
    if (!overlay) return;
    if (msg) overlay.querySelector('.export-progress-text').textContent = msg;
    if (pct !== undefined) overlay.querySelector('.export-progress-bar').style.width = pct + '%';
  },

  /** Hide progress overlay */
  hideProgress: function() {
    var overlay = document.getElementById('export-overlay');
    if (overlay) overlay.style.display = 'none';
  }
};
