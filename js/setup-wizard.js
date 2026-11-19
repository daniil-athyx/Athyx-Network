/**
 * Athyx Network - Automated Setup & Network Benchmark Wizard
 * Automatically runs on first launch (or when triggered manually).
 * Tests all CDN mirrors and Wisp proxy servers, eliminates blocked/broken ones,
 * and automatically applies the fastest working servers for the user's network.
 */
(function () {
  'use strict';

  var CDN_TARGETS = [
    {
      id: 'gcore',
      name: 'Gcore CDN',
      badge: 'Global CDN',
      origin: 'https://gcore.jsdelivr.net',
      icon: 'fa-network-wired'
    },
    {
      id: 'fastly',
      name: 'Fastly CDN',
      badge: 'Fastly Edge',
      origin: 'https://fastly.jsdelivr.net',
      icon: 'fa-bolt'
    },
    {
      id: 'jsdelivr',
      name: 'jsDelivr (Official)',
      badge: 'Official',
      origin: 'https://cdn.jsdelivr.net',
      icon: 'fa-globe'
    },
    {
      id: 'statically',
      name: 'Statically Multi-CDN',
      badge: 'Multi-CDN',
      origin: 'https://cdn.statically.io',
      icon: 'fa-cloud'
    }
  ];

  var DEFAULT_WISPS = [
    { name: 'Baylib Fast Wisp (Unblocked)', url: 'wss://new-server.baylib.top/connection/' },
    { name: 'StudyNest Relay', url: 'wss://studynestlab.org/sb/w/' },
    { name: 'Sunrise School Relay', url: 'wss://akmalsunriseschool.com/wisp/' },
    { name: 'MathNest Relay', url: 'wss://kidsmathnest.org/wisp/' },
    { name: 'Space Wisp', url: 'wss://gointospace.app/wisp/' },
    { name: 'Mercury Workshop Wisp', url: 'wss://wisp.mercurywork.shop/' }
  ];

  async function getWispCandidates() {
    var list = DEFAULT_WISPS.slice();
    try {
      var res = await fetch('https://cdn.jsdelivr.net/gh/daniil-athyx/athyx-web@v1.0.4/wisp.txt?t=' + Date.now(), { cache: 'no-store' }).catch(function () {
        return fetch('https://cdn.jsdelivr.net/gh/daniil-athyx/athyx-web@v1.0.4/wisp.txt?t=' + Date.now(), { cache: 'no-store' });
      });
      if (res && res.ok) {
        var text = await res.text();
        text.split('\n').forEach(function (line) {
          var url = line.trim();
          if (url && /^wss?:\/\//i.test(url)) {
            if (!list.some(function (x) { return x.url === url; })) {
              try {
                var host = new URL(url).hostname;
                list.push({ name: host, url: url });
              } catch (_) {}
            }
          }
        });
      }
    } catch (_) {}
    try {
      var custom = JSON.parse(localStorage.getItem('customWisps') || '[]');
      if (Array.isArray(custom)) {
        custom.forEach(function (c) {
          if (c && c.url && !list.some(function (x) { return x.url === c.url; })) {
            list.push(c);
          }
        });
      }
    } catch (_) {}
    return list;
  }

  async function testCdn(cdn, timeoutMs) {
    timeoutMs = timeoutMs || 3500;
    var testUrl = cdn.origin + '/gh/daniil-athyx/ubg-assets@main/games.json';

    var start = performance.now();
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;

    try {
      var fetchPromise = fetch(testUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });

      var timeoutPromise = new Promise(function (_, reject) {
        timer = setTimeout(function () {
          if (controller) controller.abort();
          reject(new Error('Timeout'));
        }, timeoutMs);
      });

      var res = await Promise.race([fetchPromise, timeoutPromise]);
      clearTimeout(timer);

      if (!res.ok) {
        return { success: false, latency: null, reason: 'HTTP ' + res.status };
      }

      var text = await res.text();
      // Verify valid JSON array and not a school firewall HTML intercept block page
      var trimmed = text.trim();
      if (!trimmed.startsWith('[') || trimmed.indexOf('"name"') === -1) {
        return { success: false, latency: null, reason: 'Filtered / Intercepted' };
      }

      var latency = Math.round(performance.now() - start);
      return { success: true, latency: latency, reason: null };
    } catch (e) {
      if (timer) clearTimeout(timer);
      return { success: false, latency: null, reason: e.name === 'AbortError' || e.message === 'Timeout' ? 'Timed out' : 'Blocked / Offline' };
    }
  }

  function testWisp(wisp, timeoutMs) {
    timeoutMs = timeoutMs || 3000;
    return new Promise(function (resolve) {
      var start = performance.now();
      try {
        var wsUrl = wisp.url.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
        var ws = new WebSocket(wsUrl);
        var done = false;

        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          try { ws.close(); } catch (_) {}
          resolve({ success: false, latency: null, reason: 'Timed out' });
        }, timeoutMs);

        ws.onopen = function () {
          if (done) return;
          done = true;
          clearTimeout(timer);
          var latency = Math.round(performance.now() - start);
          try { ws.close(); } catch (_) {}
          resolve({ success: true, latency: latency, reason: null });
        };

        ws.onerror = function () {
          if (done) return;
          done = true;
          clearTimeout(timer);
          try { ws.close(); } catch (_) {}
          resolve({ success: false, latency: null, reason: 'Blocked / Unreachable' });
        };
      } catch (err) {
        resolve({ success: false, latency: null, reason: 'Invalid URL' });
      }
    });
  }

  function injectStyles() {
    if (document.getElementById('athyx-setup-styles')) return;
    var style = document.createElement('style');
    style.id = 'athyx-setup-styles';
    style.textContent = `
      #athyx-setup-overlay {
        position: fixed;
        inset: 0;
        z-index: 999999;
        background: rgba(8, 6, 10, 0.78);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        transition: opacity 0.25s ease;
        font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
        color: var(--text, #f1f5f9);
      }
      #athyx-setup-overlay.active {
        opacity: 1;
      }
      .athyx-setup-modal {
        background: var(--surface, #121215);
        border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
        border-radius: 16px;
        max-width: 820px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.75);
        padding: 28px 32px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        transform: scale(0.98);
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      #athyx-setup-overlay.active .athyx-setup-modal {
        transform: scale(1);
      }
      .athyx-setup-header {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
      }
      .athyx-setup-tag {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11.5px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--accent, #0affce);
        background: var(--accent-dim, rgba(10, 255, 206, 0.12));
        border: 1px solid var(--border, rgba(10, 255, 206, 0.2));
        padding: 4px 10px;
        border-radius: 6px;
        margin-bottom: 2px;
      }
      .athyx-setup-title {
        font-family: 'Outfit', sans-serif;
        font-size: 24px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: #ffffff;
        margin: 0;
      }
      .athyx-setup-subtitle {
        font-size: 13.5px;
        color: var(--text-dim, #94a3b8);
        line-height: 1.5;
        margin: 0;
      }
      .athyx-benchmark-progress-track {
        width: 100%;
        height: 3px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 2px;
        overflow: hidden;
      }
      .athyx-benchmark-progress-fill {
        height: 100%;
        width: 0%;
        background: var(--accent, #0affce);
        border-radius: 2px;
        transition: width 0.25s ease;
      }
      .athyx-benchmark-columns {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      @media (max-width: 720px) {
        .athyx-benchmark-columns { grid-template-columns: 1fr; }
        .athyx-setup-modal { padding: 20px; }
      }
      .athyx-benchmark-card {
        background: var(--card-bg, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
        border-radius: 12px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .athyx-benchmark-card-title {
        font-size: 13px;
        font-weight: 600;
        color: #ffffff;
        letter-spacing: -0.01em;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .athyx-benchmark-card-title i {
        color: var(--accent, #0affce);
        font-size: 13px;
      }
      .athyx-candidate-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .athyx-candidate-item {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 9px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 13px;
        transition: all 0.15s ease;
      }
      .athyx-candidate-item.winner {
        border-color: var(--accent, #0affce);
        background: var(--accent-dim, rgba(10, 255, 206, 0.12));
      }
      .athyx-candidate-item.failed {
        opacity: 0.45;
        border-color: rgba(239, 68, 68, 0.2);
      }
      .athyx-candidate-name {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
        color: var(--text, #f1f5f9);
        min-width: 0;
      }
      .athyx-candidate-name span {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .athyx-candidate-badge {
        font-size: 10.5px;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.06);
        color: var(--text-dim, #94a3b8);
        font-weight: 500;
        flex-shrink: 0;
      }
      .athyx-status-pill {
        font-size: 11.5px;
        font-weight: 500;
        padding: 3px 8px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .athyx-status-pill.testing {
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-dim, #94a3b8);
      }
      .athyx-status-pill.success {
        background: var(--accent-dim, rgba(10, 255, 206, 0.12));
        color: var(--accent, #0affce);
        font-weight: 600;
      }
      .athyx-status-pill.blocked {
        background: rgba(239, 68, 68, 0.1);
        color: #f87171;
      }
      .athyx-setup-summary {
        background: var(--card-bg, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        padding: 14px 18px;
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      .athyx-setup-summary.show {
        display: flex;
      }
      .athyx-setup-summary-text {
        font-size: 13.5px;
        line-height: 1.45;
        color: var(--text, #f1f5f9);
      }
      .athyx-setup-btn {
        background: var(--accent, #0affce);
        color: var(--accent-text, #051410);
        font-family: inherit;
        font-weight: 600;
        font-size: 13.5px;
        padding: 9px 18px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: opacity 0.15s ease, transform 0.15s ease;
        white-space: nowrap;
      }
      .athyx-setup-btn:hover {
        opacity: 0.9;
        transform: translateY(-1px);
      }
      .athyx-setup-btn:active {
        transform: translateY(0);
      }
      .athyx-setup-btn.disabled {
        opacity: 0.5;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function createModalHtml(wisps) {
    var cdnRows = CDN_TARGETS.map(function (c) {
      return `
        <div class="athyx-candidate-item" id="setup-cdn-${c.id}">
          <div class="athyx-candidate-name">
            <i class="fa-solid ${c.icon}" style="color: var(--accent, #0affce); width: 16px; text-align: center;"></i>
            <span>${c.name}</span>
            <span class="athyx-candidate-badge">${c.badge}</span>
          </div>
          <div class="athyx-status-pill testing" id="status-cdn-${c.id}">
            <i class="fa-solid fa-circle-notch fa-spin"></i> Testing
          </div>
        </div>
      `;
    }).join('');

    var wispRows = wisps.map(function (w, i) {
      var safeId = 'wisp-' + i;
      return `
        <div class="athyx-candidate-item" id="setup-${safeId}">
          <div class="athyx-candidate-name">
            <i class="fa-solid fa-tower-broadcast" style="color: var(--accent, #0affce); width: 16px; text-align: center;"></i>
            <span>${w.name}</span>
          </div>
          <div class="athyx-status-pill testing" id="status-${safeId}">
            <i class="fa-solid fa-circle-notch fa-spin"></i> Testing
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="athyx-setup-modal">
        <div class="athyx-setup-header">
          <div class="athyx-setup-tag">
            <i class="fa-solid fa-gauge-high"></i> Network Optimizer
          </div>
          <h2 class="athyx-setup-title">Optimizing Your Network</h2>
          <p class="athyx-setup-subtitle">
            Benchmarking all CDN mirrors and Wisp proxy servers. Any endpoints blocked by your network firewall will be eliminated, and the fastest connection will be automatically selected.
          </p>
        </div>

        <div class="athyx-benchmark-progress-track">
          <div class="athyx-benchmark-progress-fill" id="setupProgressFill"></div>
        </div>

        <div class="athyx-benchmark-columns">
          <div class="athyx-benchmark-card">
            <div class="athyx-benchmark-card-title">
              <i class="fa-solid fa-server"></i> Game Asset CDN Mirrors
            </div>
            <div class="athyx-candidate-list" id="setupCdnList">
              ${cdnRows}
            </div>
          </div>

          <div class="athyx-benchmark-card">
            <div class="athyx-benchmark-card-title">
              <i class="fa-solid fa-tower-broadcast"></i> Wisp Proxy Relays
            </div>
            <div class="athyx-candidate-list" id="setupWispList">
              ${wispRows}
            </div>
          </div>
        </div>

        <div class="athyx-setup-summary" id="setupSummaryBox">
          <div class="athyx-setup-summary-text" id="setupSummaryText">
            <strong style="color:var(--accent, #0affce);"><i class="fa-solid fa-circle-check"></i> Connection Optimized!</strong><br>
            Selected the fastest unblocked servers for your network.
          </div>
          <button class="athyx-setup-btn" id="setupCompleteBtn">
            <span>Continue</span> <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `;
  }

  async function startBenchmark(options) {
    options = options || {};
    injectStyles();

    var wisps = await getWispCandidates();

    var overlay = document.getElementById('athyx-setup-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'athyx-setup-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = createModalHtml(wisps);

    // Trigger animation
    requestAnimationFrame(function () {
      overlay.classList.add('active');
    });

    var progressFill = document.getElementById('setupProgressFill');
    var totalTests = CDN_TARGETS.length + wisps.length;
    var completed = 0;

    function updateProgress() {
      completed++;
      if (progressFill) {
        var pct = Math.round((completed / totalTests) * 100);
        progressFill.style.width = pct + '%';
      }
    }

    var cdnResults = [];
    var wispResults = [];

    // Test CDNs concurrently
    var cdnPromises = CDN_TARGETS.map(async function (cdn) {
      var res = await testCdn(cdn, 3500);
      cdnResults.push({ cdn: cdn, result: res });
      var pill = document.getElementById('status-cdn-' + cdn.id);
      var row = document.getElementById('setup-cdn-' + cdn.id);
      if (pill && row) {
        if (res.success) {
          pill.className = 'athyx-status-pill success';
          pill.innerHTML = '<i class="fa-solid fa-check"></i> ' + res.latency + ' ms';
        } else {
          pill.className = 'athyx-status-pill blocked';
          pill.innerHTML = '<i class="fa-solid fa-xmark"></i> ' + (res.reason || 'Blocked');
          row.classList.add('failed');
        }
      }
      updateProgress();
    });

    // Test Wisps concurrently
    var wispPromises = wisps.map(async function (wisp, index) {
      var res = await testWisp(wisp, 3200);
      wispResults.push({ wisp: wisp, result: res, index: index });
      var safeId = 'wisp-' + index;
      var pill = document.getElementById('status-' + safeId);
      var row = document.getElementById('setup-' + safeId);
      if (pill && row) {
        if (res.success) {
          pill.className = 'athyx-status-pill success';
          pill.innerHTML = '<i class="fa-solid fa-check"></i> ' + res.latency + ' ms';
        } else {
          pill.className = 'athyx-status-pill blocked';
          pill.innerHTML = '<i class="fa-solid fa-xmark"></i> ' + (res.reason || 'Offline');
          row.classList.add('failed');
        }
      }
      updateProgress();
    });

    await Promise.all(cdnPromises.concat(wispPromises));

    // Choose fastest working CDN
    var workingCdns = cdnResults.filter(function (r) { return r.result.success; });
    workingCdns.sort(function (a, b) { return a.result.latency - b.result.latency; });

    var chosenCdn = workingCdns.length > 0 ? workingCdns[0].cdn : CDN_TARGETS[0];
    if (workingCdns.length > 0) {
      var bestRow = document.getElementById('setup-cdn-' + chosenCdn.id);
      if (bestRow) {
        bestRow.classList.add('winner');
        var pill = document.getElementById('status-cdn-' + chosenCdn.id);
        if (pill) pill.innerHTML = '<i class="fa-solid fa-crown"></i> ' + workingCdns[0].result.latency + ' ms';
      }
      localStorage.setItem('athyx_cdn_mirror', chosenCdn.origin);
    }

    // Choose fastest working Wisp
    var workingWisps = wispResults.filter(function (r) { return r.result.success; });
    workingWisps.sort(function (a, b) { return a.result.latency - b.result.latency; });

    var chosenWisp = workingWisps.length > 0 ? workingWisps[0].wisp : DEFAULT_WISPS[0];
    if (workingWisps.length > 0) {
      var bestWispRow = document.getElementById('setup-wisp-' + workingWisps[0].index);
      if (bestWispRow) {
        bestWispRow.classList.add('winner');
        var pill = document.getElementById('status-wisp-' + workingWisps[0].index);
        if (pill) pill.innerHTML = '<i class="fa-solid fa-crown"></i> ' + workingWisps[0].result.latency + ' ms';
      }
      localStorage.setItem('proxServer', chosenWisp.url);
    }

    // Mark setup completed
    localStorage.setItem('athyx_setup_completed', 'true');

    // Show summary box
    var summaryBox = document.getElementById('setupSummaryBox');
    var summaryText = document.getElementById('setupSummaryText');
    var completeBtn = document.getElementById('setupCompleteBtn');

    if (summaryText) {
      var cdnName = chosenCdn.name + (workingCdns.length > 0 ? ' (' + workingCdns[0].result.latency + ' ms)' : '');
      var wispName = chosenWisp.name + (workingWisps.length > 0 ? ' (' + workingWisps[0].result.latency + ' ms)' : '');
      summaryText.innerHTML = `
        <strong style="color:var(--accent, #0affce); font-size:14px;"><i class="fa-solid fa-circle-check"></i> Connection Optimized</strong><br>
        <span style="font-size:12.5px; color:var(--text-dim, #94a3b8);">
          Fastest CDN: <b style="color:var(--text, #ffffff);">${cdnName}</b> &bull; Fastest Wisp: <b style="color:var(--text, #ffffff);">${wispName}</b>
        </span>
      `;
    }

    if (summaryBox) summaryBox.classList.add('show');

    // Auto-countdown to close (gives user time to see results)
    var countdown = 5;
    var btnText = completeBtn ? completeBtn.querySelector('span') : null;
    var countdownInterval = setInterval(function () {
      countdown--;
      if (countdown > 0 && btnText) {
        btnText.textContent = `Continue (${countdown}s)`;
      } else {
        clearInterval(countdownInterval);
        closeWizard();
      }
    }, 1000);

    function closeWizard() {
      clearInterval(countdownInterval);
      overlay.classList.remove('active');
      setTimeout(function () {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        if (typeof options.onComplete === 'function') {
          options.onComplete({ cdn: chosenCdn, wisp: chosenWisp });
        }
      }, 300);
    }

    if (completeBtn) {
      completeBtn.onclick = closeWizard;
    }
  }

  function autoCheck() {
    var completed = false;
    try {
      completed = localStorage.getItem('athyx_setup_completed') === 'true';
    } catch (_) {}

    if (!completed) {
      startBenchmark();
    }
  }

  // Export globally
  window.AthyxSetupWizard = {
    start: startBenchmark,
    autoCheck: autoCheck,
    CDN_TARGETS: CDN_TARGETS,
    DEFAULT_WISPS: DEFAULT_WISPS
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoCheck);
  } else {
    autoCheck();
  }
})();
