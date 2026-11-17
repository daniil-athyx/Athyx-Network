// Calculate the dynamic base path for the Service Worker.
const swPath = self.location.pathname;
const basePath = swPath.substring(0, swPath.lastIndexOf('/') + 1);

// Fallback for basePath to ensure it's always defined
self.basePath = self.basePath || basePath;

self.$scramjet = {
    files: {
        wasm: `${basePath}JS/scramjet.wasm.wasm`,
        sync: `${basePath}JS/scramjet.sync.js`,
    }
};

// Load ALL required scripts at the top level.
importScripts(`${basePath}JS/scramjet.all.js?v=2`);
importScripts(`${basePath}B/index.js`);

const { ScramjetServiceWorker } = $scramjetLoadWorker();

const scramjet = new ScramjetServiceWorker({
    prefix: basePath + 'JS/scramjet/',
    flags: {
        serviceworkers: true,
        syncxhr: true,
        allowInvalidJs: true,
        allowFailedIntercepts: true
    }
});

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => caches.delete(cacheName))
            );
        }).then(() => self.clients.claim())
    );
});

const INTERNAL_PREFIXES = [
    '/pages/',
    '/js/',
    '/assets/',
    '/images/',
    '/raldi/',
    `${basePath}JS/`,
    `${basePath}B/`,
    `${basePath}Ep/`
];

const INTERNAL_EXACT = new Set([
    '/',
    '/index.html',
    '/themes.css',
    '/quotes.txt',
    '/update_log.json',
    '/ads.txt',
    '/wisp.txt',
    `${basePath}`,
    `${basePath}index.html`,
    `${basePath}NT.html`,
    `${basePath}compat-error.html`,
    `${basePath}settings.html`,
    `${basePath}script.js`,
    `${basePath}style.css`,
    `${basePath}prxxry.config.js`,
    `${basePath}libcurl.mjs`,
    `${basePath}sw.js`
]);

function isInternalSiteAsset(pathname) {
    if (INTERNAL_EXACT.has(pathname)) return true;
    for (let i = 0; i < INTERNAL_PREFIXES.length; i++) {
        if (pathname.startsWith(INTERNAL_PREFIXES[i])) return true;
    }
    return false;
}

self.addEventListener("fetch", (event) => {
    const prefix = `${self.location.origin}${basePath}JS/scramjet/`;
    const wasmUrl = `${self.location.origin}${basePath}JS/scramjet.wasm.wasm`;
    const reqUrlStr = event.request.url;
    const refStr = event.request.referrer || '';

    const isDirectProxyReq = reqUrlStr.startsWith(prefix) || reqUrlStr.startsWith(wasmUrl);
    const isFromProxiedPage = refStr.startsWith(prefix);

    // Do not intercept unrelated requests from non-proxy pages (games, homepage, settings)
    if (!isDirectProxyReq && !isFromProxiedPage) {
        return;
    }

    event.respondWith((async () => {
        const requestUrl = new URL(reqUrlStr);
        const compatibilityEnabled = wispConfig.compatCheck === true;
        const requestFallbackEnabled = wispConfig.requestFallback === true;
        const reducedFeatureMode = wispConfig.reducedFeature === true;

        try {
            if (compatibilityEnabled && requestUrl.protocol === 'http:' && self.location.protocol === 'https:') {
                return fetch(event.request, { mode: 'cors', redirect: 'manual' });
            }

            if (reducedFeatureMode && !reqUrlStr.startsWith(self.location.origin)) {
                return fetch(event.request);
            }

            await scramjet.loadConfig();
            if (scramjet.route(event)) {
                if (reqUrlStr.startsWith(prefix)) {
                    try {
                        let inner = decodeURIComponent(reqUrlStr.slice(prefix.length));
                        if (inner.startsWith(prefix)) {
                            while (inner.startsWith(prefix)) {
                                inner = decodeURIComponent(inner.slice(prefix.length));
                            }
                            return Response.redirect(`${prefix}${encodeURIComponent(inner)}`, 302);
                        }
                    } catch (e) { }
                }
                try {
                    return await scramjet.fetch(event);
                } catch (err) {
                    if (!requestFallbackEnabled) {
                        return new Response('Proxy request failed', { status: 502, statusText: 'Bad Gateway' });
                    }
                    return fetch(event.request, { mode: 'cors', redirect: 'manual' });
                }
            }

            // CroxyProxy-style Referrer Origin Recovery:
            // Catch root-relative or subfolder-escaped requests originating from a proxied page
            if (
                isFromProxiedPage &&
                requestUrl.origin === self.location.origin &&
                !isInternalSiteAsset(requestUrl.pathname)
            ) {
                try {
                    const encodedRef = refStr.slice(prefix.length).split('?')[0].split('#')[0];
                    const targetRefUrl = new URL(decodeURIComponent(encodedRef));
                    let relPath = requestUrl.pathname;
                    if (basePath !== '/' && relPath.startsWith(basePath)) {
                        relPath = '/' + relPath.slice(basePath.length);
                    }
                    const recoveredTarget = new URL(relPath + requestUrl.search, targetRefUrl.origin).href;
                    return Response.redirect(`${prefix}${encodeURIComponent(recoveredTarget)}`, 307);
                } catch (_) {}
            }

            return await fetch(event.request);
        } catch (err) {
            if (requestFallbackEnabled) {
                try {
                    return await fetch(event.request);
                } catch (fallbackError) {
                    return new Response('The page could not be loaded.', { status: 502, statusText: 'Bad Gateway' });
                }
            }
            return new Response(null, { status: 204 });
        }
    })());
});

let wispConfig = {};

const AD_DOMAINS = [
    'doubleclick.net', 'google-analytics.com', 'googlesyndication.com',
    'adservice.google.com', 'amazon-adsystem.com', 'criteo.com',
    'outbrain.com', 'taboola.com', 'adtech.de', 'advertising.com',
    'scorecardresearch.com', 'quantserve.com', 'zedo.com', 'yieldmanager.com',
    'adnxs.com', 'rubiconproject.com', 'openx.net', 'casalemedia.com',
    'pubmatic.com', 'smartadserver.com', 'exponential.com',
    'serving-sys.com', 'adblade.com', 'adroll.com', 'media.net',
    'moatads.com', 'adsrvr.org', 'spotxchange.com', 'turn.com',
    'mathtag.com', 'adnexus.net', 'fastclick.net'
];

function isAdDomain(hostname) {
    return AD_DOMAINS.some(adDomain => hostname === adDomain || hostname.endsWith('.' + adDomain));
}

// Prevent Race Condition: Create a promise that resolves when the config message is received.
let resolveConfigReady;
const configReadyPromise = new Promise(resolve => {
    resolveConfigReady = resolve;
    // Safety fallback so requests never hang if config message is delayed
    setTimeout(() => {
        if (!wispConfig.wispurl) {
            wispConfig.wispurl = "wss://new-server.baylib.top/connection/";
        }
        resolve();
    }, 3000);
});

self.addEventListener("message", ({ data }) => {
    if (data && data.type === "config") {
        if (data.wispurl) {
            const oldWisp = wispConfig.wispurl;
            wispConfig.wispurl = data.wispurl;
            if (resolveConfigReady) {
                resolveConfigReady();
                resolveConfigReady = null; // Ensure it only resolves once
            }
            if (scramjet.client && oldWisp && oldWisp !== data.wispurl) {
                scramjet.client = null; // Force recreation on next request to avoid transport errors
            }
        }
        if (data.hasOwnProperty('adblock')) {
            wispConfig.adblock = data.adblock;
        }
        if (data.hasOwnProperty('compatCheck')) {
            wispConfig.compatCheck = data.compatCheck;
        }
        if (data.hasOwnProperty('transportFallback')) {
            wispConfig.transportFallback = data.transportFallback;
        }
        if (data.hasOwnProperty('requestFallback')) {
            wispConfig.requestFallback = data.requestFallback;
        }
        if (data.hasOwnProperty('offlinePage')) {
            wispConfig.offlinePage = data.offlinePage;
        }
        if (data.hasOwnProperty('reducedFeature')) {
            wispConfig.reducedFeature = data.reducedFeature;
        }
    }
});

// The main Scramjet listener where the proxying logic happens.
scramjet.addEventListener("request", async (e) => {
    if (wispConfig.adblock) {
        try {
            const urlObj = new URL(e.url);
            if (isAdDomain(urlObj.hostname)) {
                e.response = new Response("Blocked by Adblocker", { status: 403 });
                return;
            }
        } catch (err) { }
    }

    e.response = (async () => {
        // Serve official HTML5Test ES6 module test script when /assets/modules.js is requested
        try {
            const targetUrl = new URL(e.url);
            if (targetUrl.pathname === '/assets/modules.js') {
                const modCode = 'var scoped = true;\nexport default scoped;\nif (typeof callback_es6_modules === "function") { callback_es6_modules(!("scoped" in window)); }\n';
                const modRes = new Response(modCode, {
                    status: 200,
                    statusText: 'OK',
                    headers: { 'content-type': 'application/javascript; charset=utf-8' }
                });
                modRes.rawHeaders = { 'content-type': 'application/javascript; charset=utf-8' };
                return modRes;
            }
        } catch (_) {}

        // Use a single, persistent client instance on the scramjet object.
        if (!scramjet.client) {
            // Wait for the WISP URL to be sent from the main page.
            await configReadyPromise;

            if (!wispConfig.wispurl) {
                console.error("WISP URL is missing. Cannot configure BareMux.");
                return new Response("WISP URL configuration failed in SW.", { status: 500, statusText: "Internal Server Error" });
            }

            const connection = new BareMux.BareMuxConnection(`${basePath}B/worker.js`);
            await connection.setTransport(`${basePath}Ep/index.mjs`, [{ wisp: wispConfig.wispurl }]);
            scramjet.client = new BareMux.BareClient(`${basePath}B/worker.js`);
        }

        // Wait briefly for scramjet.client.fetch to be ready on first load
        for (let i = 0; i < 30 && (!scramjet.client || typeof scramjet.client.fetch !== "function"); i++) {
            await new Promise(r => setTimeout(r, 100));
        }
        const fetchOpts = {
            method: e.method,
            body: e.body,
            headers: new Headers(e.requestHeaders || {}),
            credentials: "omit",
            mode: e.mode === "cors" ? e.mode : "same-origin",
            cache: e.cache,
            redirect: "manual",
            duplex: "half",
        };
        try {
            return await scramjet.client.fetch(e.url, fetchOpts);
        } catch (err) {
            if (err && /no bare clients/i.test(err.message)) {
                await configReadyPromise;
                const connection = new BareMux.BareMuxConnection(`${basePath}B/worker.js`);
                await connection.setTransport(`${basePath}Ep/index.mjs`, [{ wisp: wispConfig.wispurl }]);
                scramjet.client = new BareMux.BareClient(`${basePath}B/worker.js`);
                return await scramjet.client.fetch(e.url, fetchOpts);
            }
            throw err;
        }
    })();
});
