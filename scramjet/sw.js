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
importScripts(`${basePath}JS/scramjet.all.js`);
importScripts(`${basePath}B/index.js`);

const { ScramjetServiceWorker } = $scramjetLoadWorker();

const scramjet = new ScramjetServiceWorker({
    prefix: basePath + 'JS/scramjet/',
    flags: {
        allowInvalidJs: true
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


self.addEventListener("fetch", (event) => {
    event.respondWith((async () => {
        const requestUrl = new URL(event.request.url);
        const compatibilityEnabled = wispConfig.compatCheck === true;
        const requestFallbackEnabled = wispConfig.requestFallback === true;
        const reducedFeatureMode = wispConfig.reducedFeature === true;

        try {
            if (compatibilityEnabled && requestUrl.protocol === 'http:' && self.location.protocol === 'https:') {
                return fetch(event.request, { mode: 'cors', redirect: 'manual' });
            }

            if (reducedFeatureMode && !event.request.url.startsWith(self.location.origin)) {
                return fetch(event.request);
            }

            await scramjet.loadConfig();
            if (scramjet.route(event)) {
                try {
                    return await scramjet.fetch(event);
                } catch (err) {
                    if (!requestFallbackEnabled) {
                        return new Response('Proxy request failed', { status: 502, statusText: 'Bad Gateway' });
                    }
                    return fetch(event.request, { mode: 'cors', redirect: 'manual' });
                }
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
            wispConfig.wispurl = "wss://ok.worldmicroscope.com/wisp/";
        }
        resolve();
    }, 3000);
});

self.addEventListener("message", ({ data }) => {
	if (data.type === "config") {
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
        } catch(err) {}
    }

	e.response = (async () => {
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
			scramjet.client = connection;
		}

		// Simplified fetch logic without the inspector parts for clarity
		return await scramjet.client.fetch(e.url, {
            method: e.method,
            body: e.body,
            headers: e.requestHeaders,
            credentials: "omit",
            mode: e.mode === "cors" ? e.mode : "same-origin",
            cache: e.cache,
            redirect: "manual",
            duplex: "half",
        });
	})();
});
