/**
 * Athyx Network - Dynamic CDN & Asset Mirror System
 * Provides seamless, configurable CDN switching across the entire site.
 * Supported mirrors:
 * - https://cdn.jsdelivr.net (Official Default)
 * - https://fastly.jsdelivr.net (Fastly Mirror)
 * - https://gcore.jsdelivr.net (Gcore Mirror)
 * - https://cdn.statically.io (Statically Multi-CDN Proxy)
 * - Custom CDN URL
 */
(function (global) {
  'use strict';

  var CDN_PROVIDERS = {
    jsdelivr: {
      id: 'jsdelivr',
      name: 'jsDelivr (Default)',
      origin: 'https://cdn.jsdelivr.net',
      badge: 'Official',
      desc: 'Official jsDelivr edge network'
    },
    fastly: {
      id: 'fastly',
      name: 'Fastly CDN',
      origin: 'https://fastly.jsdelivr.net',
      badge: 'Fastly Edge',
      desc: 'Fastly CDN mirror, high-speed routing'
    },
    gcore: {
      id: 'gcore',
      name: 'Gcore CDN',
      origin: 'https://gcore.jsdelivr.net',
      badge: 'Gcore Global',
      desc: 'Gcore worldwide mirror, bypasses some blocks'
    }
  };

  var KNOWN_MIRRORS = [
    'https://cdn.jsdelivr.net',
    'https://fastly.jsdelivr.net',
    'https://gcore.jsdelivr.net',
    'http://cdn.jsdelivr.net',
    'http://fastly.jsdelivr.net',
    'http://gcore.jsdelivr.net'
  ];

  function getQueryCdn() {
    try {
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        var params = new URLSearchParams(window.location.search);
        var c = params.get('cdn');
        if (c) {
          var key = c.toLowerCase().trim();
          if (CDN_PROVIDERS[key]) return CDN_PROVIDERS[key].origin;
          if (/^https?:\/\//i.test(c)) return c.replace(/\/+$/, '');
        }
      }
    } catch (_) {}
    return null;
  }

  function getActiveCdn() {
    var q = getQueryCdn();
    if (q && q.includes('jsdelivr.net')) return q;
    try {
      if (typeof localStorage !== 'undefined') {
        var stored = localStorage.getItem('athyx_cdn_mirror');
        if (stored) {
          // Strictly jsDelivr: purge any stale non-jsdelivr mirrors like raw.githubusercontent.com
          if (!stored.includes('jsdelivr.net')) {
            localStorage.removeItem('athyx_cdn_mirror');
          } else {
            var key = stored.toLowerCase().trim();
            if (CDN_PROVIDERS[key]) return CDN_PROVIDERS[key].origin;
            if (/^https?:\/\/[a-z0-9.-]*jsdelivr\.net/i.test(stored)) return stored.replace(/\/+$/, '');
          }
        }
      }
    } catch (_) {}
    return 'https://cdn.jsdelivr.net';
  }

  function setActiveCdn(value) {
    try {
      var origin = value;
      var key = String(value || '').toLowerCase().trim();
      if (CDN_PROVIDERS[key]) origin = CDN_PROVIDERS[key].origin;
      else if (!/^https?:\/\/[a-z0-9.-]*jsdelivr\.net/i.test(origin)) origin = 'https://cdn.jsdelivr.net';
      origin = origin.replace(/\/+$/, '');
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('athyx_cdn_mirror', origin);
      }
      return origin;
    } catch (e) {
      console.warn('Could not save CDN preference:', e);
      return value;
    }
  }

  function getProviderKey(originUrl) {
    var clean = (originUrl || '').replace(/\/+$/, '').toLowerCase();
    for (var k in CDN_PROVIDERS) {
      if (CDN_PROVIDERS[k].origin.toLowerCase() === clean) return k;
    }
    return 'custom';
  }

  var UBG_ASSETS_SHA = '6118bd1eb317992421afda61f0e019a7240ded23';
  var ATHYX_GAME_LIB_SHA = 'f5e99014cf6a330dec61e2cfd8940a7b2181391b';

  function rewriteUrl(url, targetOrigin) {
    if (!url || typeof url !== 'string') return url;
    var dest = (targetOrigin || getActiveCdn()).replace(/\/+$/, '');

    var isMatch = false;
    var matchedOrigin = '';
    for (var i = 0; i < KNOWN_MIRRORS.length; i++) {
      var m = KNOWN_MIRRORS[i];
      if (url.indexOf(m) === 0) {
        isMatch = true;
        matchedOrigin = m;
        break;
      }
    }
    if (!isMatch) return url;

    var path = url.slice(matchedOrigin.length);

    // Bypass jsDelivr 50MB repo size limit on branch archives by pinning commit SHA
    path = path.replace(/\/gh\/daniil-athyx\/ubg-assets@(?:main|master)\//i, '/gh/daniil-athyx/ubg-assets@' + UBG_ASSETS_SHA + '/');
    path = path.replace(/\/gh\/daniil-athyx\/athyx-game-lib@(?:main|master)\//i, '/gh/daniil-athyx/athyx-game-lib@' + ATHYX_GAME_LIB_SHA + '/');

    return dest + path;
  }

  function rewriteHtml(html, targetOrigin) {
    if (!html || typeof html !== 'string') return html;
    var dest = (targetOrigin || getActiveCdn()).replace(/\/+$/, '');

    var pattern = /https?:\/\/(?:cdn|fastly|gcore)\.jsdelivr\.net/gi;
    var rewritten = html.replace(pattern, dest);
    rewritten = rewritten.replace(/\/gh\/daniil-athyx\/ubg-assets@(?:main|master)\//gi, '/gh/daniil-athyx/ubg-assets@' + UBG_ASSETS_SHA + '/');
    rewritten = rewritten.replace(/\/gh\/daniil-athyx\/athyx-game-lib@(?:main|master)\//gi, '/gh/daniil-athyx/athyx-game-lib@' + ATHYX_GAME_LIB_SHA + '/');
    return rewritten;
  }

  function getUbgAssetsBase(targetOrigin) {
    var dest = (targetOrigin || getActiveCdn()).replace(/\/+$/, '');
    return dest + '/gh/daniil-athyx/ubg-assets@' + UBG_ASSETS_SHA + '/';
  }

  function getGameLibBase(targetOrigin) {
    var dest = (targetOrigin || getActiveCdn()).replace(/\/+$/, '');
    return dest + '/gh/daniil-athyx/athyx-game-lib@' + ATHYX_GAME_LIB_SHA + '/';
  }

  var AthyxCdn = {
    PROVIDERS: CDN_PROVIDERS,
    KNOWN_MIRRORS: KNOWN_MIRRORS,
    UBG_ASSETS_SHA: UBG_ASSETS_SHA,
    ATHYX_GAME_LIB_SHA: ATHYX_GAME_LIB_SHA,
    getActiveCdn: getActiveCdn,
    setActiveCdn: setActiveCdn,
    getQueryCdn: getQueryCdn,
    getProviderKey: getProviderKey,
    rewriteUrl: rewriteUrl,
    rewriteHtml: rewriteHtml,
    getUbgAssetsBase: getUbgAssetsBase,
    getGameLibBase: getGameLibBase
  };

  // Attach to window / global
  if (typeof window !== 'undefined') {
    window.AthyxCdn = AthyxCdn;

    // Transparently rewrite fetch calls to any jsDelivr mirror
    if (typeof window.fetch === 'function') {
      var _origFetch = window.fetch;
      window.fetch = function (input, init) {
        if (typeof input === 'string') {
          input = rewriteUrl(input);
        } else if (input && typeof input === 'object' && input.url) {
          var rewritten = rewriteUrl(input.url);
          if (rewritten !== input.url) {
            try {
              input = new Request(rewritten, input);
            } catch (_) {}
          }
        }
        return _origFetch.call(this, input, init);
      };
    }

    // Transparently rewrite XMLHttpRequest calls to any jsDelivr mirror
    if (window.XMLHttpRequest) {
      var _origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url) {
        if (typeof url === 'string') {
          url = rewriteUrl(url);
        }
        var args = Array.prototype.slice.call(arguments);
        args[1] = url;
        return _origOpen.apply(this, args);
      };
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AthyxCdn;
  }
})(typeof window !== 'undefined' ? window : global);
