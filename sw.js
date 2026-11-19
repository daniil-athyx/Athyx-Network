// Calculate the dynamic base path for the Service Worker.
const swPath = self.location.pathname;
const basePath = swPath.substring(0, swPath.lastIndexOf('/') + 1);

// Fallback for basePath to ensure it's always defined
self.basePath = self.basePath || basePath;

self.$scramjet = {
    files: {
        wasm: '/scramjet/JS/scramjet.wasm.wasm',
        sync: '/scramjet/JS/scramjet.sync.js',
    }
};

// Load ALL required scripts at the top level.
importScripts('/scramjet/JS/scramjet.all.js?v=9');
importScripts('/scramjet/B/index.js');

const { ScramjetServiceWorker } = $scramjetLoadWorker();

const defaultScramjetConfig = {
    prefix: '/scramjet/JS/scramjet/',
    globals: {
        wrapfn: "$scramjet$wrap",
        wrappropertybase: "$scramjet__",
        wrappropertyfn: "$scramjet$prop",
        cleanrestfn: "$scramjet$clean",
        importfn: "$scramjet$import",
        rewritefn: "$scramjet$rewrite",
        metafn: "$scramjet$meta",
        setrealmfn: "$scramjet$setrealm",
        pushsourcemapfn: "$scramjet$pushsourcemap",
        trysetfn: "$scramjet$tryset",
        templocid: "$scramjet$temploc",
        tempunusedid: "$scramjet$tempunused"
    },
    files: {
        wasm: basePath + 'JS/scramjet.wasm.wasm',
        all: basePath + 'JS/scramjet.all.js',
        sync: basePath + 'JS/scramjet.sync.js'
    },
    flags: {
        serviceworkers: true,
        syncxhr: true,
        strictRewrites: true,
        rewriterLogs: false,
        captureErrors: true,
        cleanErrors: false,
        scramitize: false,
        sourcemaps: true,
        destructureRewrites: false,
        interceptDownloads: false,
        allowInvalidJs: true,
        allowFailedIntercepts: true
    },
    siteFlags: {},
    codec: {
        encode: (e => e ? encodeURIComponent(e) : e).toString(),
        decode: (e => e ? decodeURIComponent(e) : e).toString()
    }
};

const scramjet = new ScramjetServiceWorker({
    prefix: basePath + 'JS/scramjet/',
    flags: {
        serviceworkers: true,
        syncxhr: true,
        allowInvalidJs: true,
        allowFailedIntercepts: true
    }
});
scramjet.config = defaultScramjetConfig;

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
    './quotes.txt',
    '/update_log.json',
    '/ads.txt',
    './wisp.txt',
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

let clientInitPromise = null;
async function ensureBareClient(forceReconnect = false) {
    if (scramjet.client && !forceReconnect) return scramjet.client;
    if (clientInitPromise) return await clientInitPromise;

    clientInitPromise = (async () => {
        try {
            await configReadyPromise;
            const wisp = wispConfig.wispurl || "wss://new-server.baylib.top/connection/";
            const connection = new BareMux.BareMuxConnection(`/scramjet/B/worker.js`);
            if (forceReconnect) {
                await connection.setTransport(`/scramjet/Ep/index.mjs`, [{ wisp }]);
            } else {
                try {
                    const transport = await connection.getTransport();
                    if (!transport) {
                        await connection.setTransport(`/scramjet/Ep/index.mjs`, [{ wisp }]);
                    }
                } catch (_) {
                    await connection.setTransport(`/scramjet/Ep/index.mjs`, [{ wisp }]);
                }
            }
            scramjet.client = new BareMux.BareClient(`/scramjet/B/worker.js`);
            return scramjet.client;
        } finally {
            clientInitPromise = null;
        }
    })();

    return await clientInitPromise;
}

self.addEventListener("fetch", (event) => {
    const prefix = `${self.location.origin}/scramjet/JS/scramjet/`;
    const wasmUrl = `${self.location.origin}/scramjet/JS/scramjet.wasm.wasm`;
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
            if (!scramjet.config) {
                scramjet.config = defaultScramjetConfig;
            }
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
                    console.error('[Scramjet SW] Proxy request failed:', err);
                    if (!requestFallbackEnabled) {
                        return new Response('Proxy request failed: ' + (err?.message || err), { status: 502, statusText: 'Bad Gateway' });
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

        // Ensure BareClient singleton with connection deduplication
        await ensureBareClient();

        // Buffer stream body to prevent disturbed stream errors on retry
        let bodyPayload = e.body;
        if (bodyPayload && typeof bodyPayload.getReader === 'function') {
            try {
                const res = new Response(bodyPayload);
                bodyPayload = await res.arrayBuffer();
            } catch (_) {}
        }

        const fetchOpts = {
            method: e.method,
            body: bodyPayload,
            headers: e.requestHeaders || {},
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
                await ensureBareClient(true);
                return await scramjet.client.fetch(e.url, fetchOpts);
            }
            throw err;
        }
    })();
});
