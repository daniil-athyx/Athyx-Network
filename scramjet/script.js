if (typeof BareMux === 'undefined') {
    BareMux = {
        BareMuxConnection: class {
            constructor() { }
            setTransport() { }
        }
    };
}
// Wrap everything in DOMContentLoaded to ensure DOM is ready
const DEFAULT_SEARCH_ENGINES = {
    brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
    duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    google: { name: 'Google', url: 'https://www.google.com/search?safe=active&q=' },
    bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' }
};

window.basePath = window.basePath || (typeof location !== 'undefined' ? location.pathname.replace(/[^/]*$/, '') : '/');
var basePath = window.basePath;

const COMPATIBILITY_FLAGS = {
    compatCheck: 'compatCheckEnabled',
    transportFallback: 'transportFallbackEnabled',
    requestFallback: 'requestFallbackEnabled',
    offlinePage: 'offlinePageEnabled',
    reducedFeature: 'reducedFeatureEnabled'
};

function getCompatibilityFlag(key, defaultValue = false) {
    const value = localStorage.getItem(key);
    return value === null ? defaultValue : value === 'true';
}

function getCompatibilitySettings() {
    return Object.fromEntries(Object.entries(COMPATIBILITY_FLAGS).map(([name, key]) => [name, getCompatibilityFlag(key, false)]));
}

function logCompatibilityIssue(message) {
    if (getCompatibilityFlag(COMPATIBILITY_FLAGS.compatCheck, false)) {
        console.warn(`[Advanced Compatibility] ${message}`);
    }
}

function showCompatibilityError(url, reason) {
    if (!getCompatibilityFlag(COMPATIBILITY_FLAGS.offlinePage, false)) {
        return false;
    }

    const safeUrl = encodeURIComponent(url || 'about:blank');
    const errorUrl = `${basePath}compat-error.html?url=${safeUrl}&reason=${encodeURIComponent(reason || 'The page could not be loaded.')}`;
    const activeTab = getActiveTab();
    if (activeTab) {
        activeTab.frame.frame.src = errorUrl;
        activeTab.url = errorUrl;
        activeTab.loading = false;
        activeTab.progress = 100;
        updateLoadingBar(activeTab);
        return true;
    }
    return false;
}

function retryCompatibilityErrorPage() {
    const activeTab = getActiveTab();
    if (!activeTab || !activeTab.url || !activeTab.url.startsWith(`${basePath}compat-error.html`)) {
        return;
    }
    const params = new URLSearchParams(activeTab.url.split('?')[1] || '');
    const originalUrl = params.get('url');
    if (originalUrl) {
        activeTab.frame.frame.src = decodeURIComponent(originalUrl);
        activeTab.loading = true;
        activeTab.progress = 10;
        updateLoadingBar(activeTab);
    }
}

async function configureTransportWithFallback() {
    const transportUrl = `${basePath}Ep/index.mjs`;
    const transportArgs = [{ wisp: store.wispurl }];

    try {
        await connection.setTransport(transportUrl, transportArgs);
    } catch (error) {
        logCompatibilityIssue(`Transport failed: ${error.message || error}`);
        if (!getCompatibilityFlag(COMPATIBILITY_FLAGS.transportFallback, false)) {
            throw error;
        }

        const maxAttempts = 2;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
                await connection.setTransport(transportUrl, transportArgs);
                return;
            } catch (retryError) {
                if (attempt === maxAttempts) {
                    throw retryError;
                }
            }
        }
    }
}

// Declare scramjet globally so it can be used by createTab and other functions
let scramjet;

document.addEventListener('DOMContentLoaded', async function () {
    basePath = location.pathname.replace(/[^/]*$/, '');
    window.basePath = basePath;

    const { ScramjetController } = $scramjetLoadController();

    // Configure Scramjet controller with the correct prefix
    scramjet = new ScramjetController({
        prefix: basePath + 'JS/scramjet/',
        files: {
            wasm: basePath + 'JS/scramjet.wasm.wasm',
            all: basePath + 'JS/scramjet.all.js',
            sync: basePath + 'JS/scramjet.sync.js',
        },
    });

    scramjet.init();

    const reducedFeatureMode = getCompatibilityFlag(COMPATIBILITY_FLAGS.reducedFeature, false);
    const supportsServiceWorker = 'serviceWorker' in navigator;
    const supportsWebSocket = 'WebSocket' in window;

    if (getCompatibilityFlag(COMPATIBILITY_FLAGS.compatCheck, false)) {
        if (!supportsServiceWorker) logCompatibilityIssue('Service Workers are unavailable; proxy features may fail.');
        if (!supportsWebSocket) logCompatibilityIssue('WebSockets are unavailable; WISP servers cannot be used.');
    }

    if (!reducedFeatureMode && supportsServiceWorker) {
        // Dynamic path calculation for subfolder hosting compatibility
        await navigator.serviceWorker.register(basePath + 'sw.js', { scope: basePath });
    }
    
    // Send the WISP URL to the service worker once ready or if controller already exists
    const wispUrl = localStorage.getItem("proxServer") || (typeof _CONFIG !== 'undefined' ? _CONFIG.wispurl : "wss://ok.worldmicroscope.com/wisp/");
    const adblockEnabled = localStorage.getItem('adblockEnabled') === 'true';
    const configMessage = {
        type: "config",
        wispurl: wispUrl,
        adblock: adblockEnabled,
        ...getCompatibilitySettings()
    };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage(configMessage);
    }
    navigator.serviceWorker?.ready.then((registration) => {
        if (registration.active) {
            registration.active.postMessage(configMessage);
        }
    });
});

const connection = new BareMux.BareMuxConnection(`${basePath}B/worker.js`);
const store = {
    url: "https://",
    wispurl: localStorage.getItem("proxServer") || _CONFIG.wispurl,
    bareurl: _CONFIG?.bareurl || (location.protocol === "https:" ? "https" : "http") + "://" + location.host + "/bare/"
};

configureTransportWithFallback().catch((error) => {
    logCompatibilityIssue(`Unable to initialize the proxy transport: ${error.message || error}`);
    if (getCompatibilityFlag(COMPATIBILITY_FLAGS.offlinePage, false)) {
        showCompatibilityError('about:blank', 'The proxy transport could not start.');
    }
});

// Monitor WISP connection health
setInterval(testWispHealth, 60000); // Check every minute

let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let sortableInstance = null;

function createTab(makeActive = true) {
    const frame = scramjet.createFrame();
    const tab = {
        id: nextTabId++,
        title: "Loading...",
        url: "",
        frame: frame,
        favicon: "", // Start with empty favicon
        loading: true,
        progress: 10, // Start at 10%
        faviconTimeout: null, // Track favicon loading timeout
        isInitialPageLoad: true
    };

    updateLoadingBar(tab);

    frame.frame.src = `${basePath}NT.html?v=` + Date.now();

    frame.addEventListener("urlchange", (e) => {
        if (!e.url || e.url === "about:blank")
            return;
            

        tab.url = e.url;
        tab.loading = true;
        tab.progress = 10;
        updateLoadingBar(tab);
        updateTabsUI();
        try {
            tab.favicon = new URL(e.url).origin + '/favicon.ico';
        } catch (e) {/* ignore */
        }
        try {
            // Only access title if same-origin
            if (isSameOrigin(e.url)) {
                tab.title = frame.frame.contentWindow.document.title || new URL(e.url).hostname;
            } else {
                tab.title = new URL(e.url).hostname;
            }
        } catch (e) {
            tab.title = new URL(e.url).hostname;
        }
        updateTabsUI();
        updateAddressBar();
    }
    );

    // Monitor for connection errors to trigger WISP health check
    frame.addEventListener("connectionerror", () => {
        testWispHealth();
    });

    // Set favicon timeout - 2 seconds max for favicon changing
    if (tab.favicon) {
        tab.faviconTimeout = setTimeout(() => {
            // If favicon hasn't loaded within 2 seconds, set to empty
            if (tab.favicon && tab.favicon !== "") {
                tab.favicon = "";
                updateTabsUI();
            }
        }, 2000);
    }

    frame.frame.addEventListener('load', () => {
        try {
            const newTitle = frame.frame.contentWindow.document.title;
            if (newTitle && tab.title !== newTitle) {
                tab.title = newTitle;
                tab.loading = false;
                tab.progress = 100;
                updateLoadingBar(tab);
                tab.isInitialPageLoad = false;
                updateTabsUI();
            } else {
                tab.loading = false;
                tab.title = "New Tab";
                tab.progress = 100;
                updateLoadingBar(tab);
                tab.isInitialPageLoad = false;
                updateTabsUI();
            }
        } catch (e) {/* Ignore cross-origin access */
            tab.loading = false;
            tab.title = "New Tab";
            tab.progress = 100;
            updateLoadingBar(tab);
            tab.isInitialPageLoad = false;
            updateTabsUI();
        }
    });

    frame.frame.addEventListener('error', () => {
        if (getCompatibilityFlag(COMPATIBILITY_FLAGS.requestFallback, false)) {
            const directUrl = tab.url && !tab.url.startsWith('scram://') ? tab.url : null;
            if (directUrl) {
                tab.frame.frame.src = directUrl;
                tab.loading = true;
                tab.progress = 10;
                updateLoadingBar(tab);
                return;
            }
        }
        showCompatibilityError(tab.url || 'about:blank', 'The page failed to load and could not be opened through the proxy.');
    });
    tabs.push(tab);
    if (makeActive) {
        activeTabId = tab.id;
    }
    return tab;
}

function getActiveTab() {
    return tabs.find((tab) => tab.id === activeTabId);
}
function switchTab(tabId) {
    if (activeTabId === tabId)
        return;
    tabs.forEach((tab) => tab.frame.frame.classList.add("hidden"));
    activeTabId = tabId;
    const activeTab = getActiveTab();
    if (activeTab) {
        activeTab.frame.frame.classList.remove("hidden");
    }
    updateTabsUI();
    updateAddressBar();
    updateLoadingBar(activeTab);
}
function closeTab(tabId) {
    const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (tabIndex === -1)
        return;
    const tabToRemove = tabs[tabIndex];

    // Clear favicon timeout to prevent memory leaks
    if (tabToRemove.faviconTimeout) {
        clearTimeout(tabToRemove.faviconTimeout);
    }

    if (tabToRemove.frame.frame.parentNode) {
        tabToRemove.frame.frame.parentNode.removeChild(tabToRemove.frame.frame);
    }
    tabs.splice(tabIndex, 1);
    if (activeTabId === tabId) {
        if (tabs.length > 0) {
            const newActiveIndex = Math.min(tabIndex, tabs.length - 1);
            switchTab(tabs[newActiveIndex].id);
        } else {
            activeTabId = null;
            const newTab = createTab(true);
            document.getElementById("iframe-container").appendChild(newTab.frame.frame);
        }
    }
    updateTabsUI();
    updateAddressBar();
}
function updateTabsUI() {
    const tabsContainer = document.getElementById("tabs-container");
    if (!tabsContainer)
        return;
    const newTabButton = tabsContainer.querySelector('.new-tab');
    if (newTabButton)
        newTabButton.remove();
    tabsContainer.innerHTML = "";
    tabs.forEach((tab) => {
        const tabElement = document.createElement("div");
        tabElement.className = `tab ${tab.id === activeTabId ? "active" : ""}`;
        tabElement.setAttribute("data-tab-id", tab.id);
        tabElement.onclick = () => switchTab(tab.id);
        const faviconImg = document.createElement("img");
        faviconImg.className = "tab-favicon";
        // Only set src if favicon is not empty
        if (tab.favicon && tab.favicon.trim() !== "") {
            faviconImg.src = tab.favicon;
        }
        faviconImg.onerror = () => {
            // Set to empty string to hide favicon if it fails to load
            faviconImg.src = "";
        }
            ;
        const titleSpan = document.createElement("span");
        titleSpan.className = `tab-title ${tab.loading ? "tab-loading" : ""}`;
        titleSpan.textContent = tab.title;
        const closeButton = document.createElement("button");
        closeButton.className = "tab-close";
        closeButton.innerHTML = "&times;";
        closeButton.onclick = (e) => {
            e.stopPropagation();
            closeTab(tab.id);
        }
            ;
        tabElement.appendChild(faviconImg);
        tabElement.appendChild(titleSpan);
        tabElement.appendChild(closeButton);
        tabsContainer.appendChild(tabElement);
    }
    );
    const newBtn = document.createElement("button");
    newBtn.className = "new-tab";
    newBtn.textContent = "+";
    newBtn.onclick = () => {
        const newTab = createTab(false);
        document.getElementById("iframe-container").appendChild(newTab.frame.frame);
        switchTab(newTab.id);
    }
        ;
    tabsContainer.appendChild(newBtn);
    if (sortableInstance) {
        sortableInstance.destroy();
    }
    sortableInstance = new Sortable(tabsContainer, {
        animation: 200,
        direction: "horizontal",
        ghostClass: "sortable-ghost",
        dragClass: "sortable-drag",
        filter: ".new-tab",
        onEnd: (evt) => {
            if (evt.oldIndex !== evt.newIndex) {
                const movedTab = tabs.splice(evt.oldIndex, 1)[0];
                tabs.splice(evt.newIndex, 0, movedTab);
            }
        }
    });
}
function updateAddressBar() {
    const addressBar = document.getElementById("address-bar");
    const activeTab = getActiveTab();
    if (addressBar) {
        addressBar.value = activeTab ? activeTab.url : "";
    }
}
function isSameOrigin(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.origin === window.location.origin;
    } catch {
        return false;
    }
}

function toggleDevTools() {
    const activeTab = getActiveTab();
    if (!activeTab)
        return;
    const frameWindow = activeTab.frame.frame.contentWindow;
    if (!frameWindow)
        return;

    // Check if the frame source is same-origin before accessing document
    const frameSrc = activeTab.frame.frame.src;
    if (!isSameOrigin(frameSrc)) {
        alert('Developer tools cannot be toggled for cross-origin content.');
        return;
    }

    if (frameWindow.eruda) {
        frameWindow.eruda.destroy();
        delete frameWindow.eruda;
    } else {
        let script = frameWindow.document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/eruda";
        script.onload = function () {
            if (frameWindow.eruda && typeof frameWindow.eruda.init === 'function') {
                frameWindow.eruda.init();
                frameWindow.eruda.show();
                
                // Hide via JS API if available
                if (frameWindow.eruda._entryBtn) frameWindow.eruda._entryBtn.hide();
                
                // Hide via CSS injected into Shadow DOM
                let erudaRoot = frameWindow.document.getElementById('eruda');
                if (erudaRoot && erudaRoot.shadowRoot) {
                    let style = frameWindow.document.createElement('style');
                    style.innerHTML = '.eruda-entry-btn { display: none !important; }';
                    erudaRoot.shadowRoot.appendChild(style);
                }
            } else {
                // Retry if not immediately available
                let attempts = 0;
                const interval = setInterval(() => {
                    if (frameWindow.eruda && typeof frameWindow.eruda.init === 'function') {
                        frameWindow.eruda.init();
                        frameWindow.eruda.show();
                        
                        if (frameWindow.eruda._entryBtn) frameWindow.eruda._entryBtn.hide();
                        
                        let erudaRoot = frameWindow.document.getElementById('eruda');
                        if (erudaRoot && erudaRoot.shadowRoot) {
                            let style = frameWindow.document.createElement('style');
                            style.innerHTML = '.eruda-entry-btn { display: none !important; }';
                            erudaRoot.shadowRoot.appendChild(style);
                        }
                        
                        clearInterval(interval);
                    } else if (attempts > 10) {
                        clearInterval(interval);
                        console.error("Eruda failed to load.");
                    }
                    attempts++;
                }, 100);
            }
        };
        frameWindow.document.body.appendChild(script);
    }
}
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'navigate' && event.data.url) {
        getActiveTab()?.frame.go(event.data.url);
    }
}
);
// Check for hash parameters after initialization
async function initializeBrowser() {
    const root = document.getElementById("app");
    root.innerHTML = `<div class="browser-container"><div class="flex tabs" id="tabs-container"></div><div class="flex nav"><button id="back-btn"><i class="fa-solid fa-chevron-left"></i></button><button id="fwd-btn"><i class="fa-solid fa-chevron-right"></i></button><button id="reload-btn"><i class="fa-solid fa-rotate-right"></i></button><input class="bar" id="address-bar" autocomplete="off" autocapitalize="off" autocorrect="off"><button id="devtools-btn"><i class="fa-solid fa-code"></i></button><button id="wisp-settings-btn" title="WISP Settings"><i class="fa-solid fa-cog"></i></button><button id="open-new-window-btn"><i class="fa-solid fa-arrow-up-right-from-square"></i></button></div><div class="loading-bar-container"><div class="loading-bar" id="loading-bar"></div></div><div class="iframe-container" id="iframe-container"></div></div>`;
    document.getElementById('back-btn').onclick = () => getActiveTab()?.frame.back();
    document.getElementById('fwd-btn').onclick = () => getActiveTab()?.frame.forward();
    document.getElementById('reload-btn').onclick = () => getActiveTab()?.frame.reload();
    document.getElementById('address-bar').onkeyup = (event) => {
        if (event.keyCode === 13)
            handleSubmit();
    }
        ;
    document.getElementById('open-new-window-btn').onclick = () => {
        const url = getActiveTab()?.url;
        if (url)
            window.open(scramjet.encodeUrl(url));
    }
        ;
    document.getElementById('devtools-btn').onclick = toggleDevTools;
    const initialTab = createTab(true);
    document.getElementById("iframe-container").appendChild(initialTab.frame.frame);
    updateTabsUI();
    updateAddressBar();

    // Wait for Service Worker to be active before navigating to proxy links
    if (navigator.serviceWorker) {
        await navigator.serviceWorker.ready;
    }

    // Check for hash parameters after initialization
    await checkHashParameters();

    // Initialize WISP events after UI is created
    initializeWISPEvents();
}

// Handle incoming search or URL from hash parameters
async function handleIncomingSearch() {
    const hash = window.location.hash.substring(1);
    if (!hash) return;

    try {
        let decodedHash = decodeURIComponent(hash);
        // Handle double-encoded URLs
        let isValidUrl = false;
        try {
            new URL(decodedHash);
            isValidUrl = true;
        } catch (e) {
            // Not a valid URL
        }
        if (isValidUrl && decodedHash !== hash) {
            try {
                decodedHash = decodeURIComponent(decodedHash);
            } catch (e) {
                // Use single-decoded version if double-decode fails
            }
        }

        if (decodedHash.startsWith('search=')) {
            // Handle search query with engine parameter
            const urlParams = new URLSearchParams(decodedHash);
            const query = urlParams.get('search');
            const engine = urlParams.get('engine') || 'duckduckgo';

            if (query) {
                const addressBar = document.getElementById('address-bar');
                if (addressBar) {
                    const searchEngines = window.searchEngines || DEFAULT_SEARCH_ENGINES;

                    const searchEngine = searchEngines[engine] || searchEngines.brave;
                    const searchUrl = searchEngine.url + encodeURIComponent(query);

                    addressBar.value = searchUrl;
                    handleSubmit(searchUrl);
                }
            }
        } else if (decodedHash.startsWith('url=')) {
            // Handle direct URL navigation
            const url = decodedHash.substring(4); // Remove 'url=' prefix
            const addressBar = document.getElementById('address-bar');
            if (addressBar) {
                addressBar.value = url;
                handleSubmit();
            }
        } else if (decodedHash.startsWith('http://') || decodedHash.startsWith('https://')) {
            // Direct URL in hash
            const addressBar = document.getElementById('address-bar');
            if (addressBar) {
                addressBar.value = decodedHash;
                handleSubmit();
            }
        } else if (decodedHash.trim()) {
            // General query or domain passed from Athyx homepage
            const addressBar = document.getElementById('address-bar');
            if (addressBar) {
                addressBar.value = decodedHash;
                handleSubmit(decodedHash);
            }
        }
    } catch (error) {
        console.warn('Error processing hash parameter:', error);
    } finally {
        // Clear hash after processing
        history.replaceState(null, null, window.location.pathname + window.location.search);
    }
}

// Check for hash parameters and handle them
async function checkHashParameters() {
    if (window.location.hash) {
        await handleIncomingSearch();
    }
}
window.addEventListener('hashchange', () => {
    checkHashParameters();
});

// Enhanced handleSubmit to support both direct input and programmatic calls
function handleSubmit(url = null) {
    const activeTab = getActiveTab();
    const addressBar = document.getElementById("address-bar");
    if (!activeTab || !addressBar)
        return;

    let inputUrl = url || addressBar.value.trim();
    if (inputUrl === "")
        return;

    // Decode URI components before processing
    try {
        inputUrl = decodeURIComponent(inputUrl);
    } catch (e) {
        // If decoding fails, use original input
    }

    // Handle custom internal schemes
    if (inputUrl === "scram://settings") {
        activeTab.isInitialPageLoad = true;
        activeTab.loading = true;
        updateLoadingBar(activeTab);
        activeTab.frame.frame.src = basePath + 'settings.html';
        activeTab.url = inputUrl;
        if (addressBar) addressBar.value = inputUrl;
        return;
    }

    // Handle special cases where URL might be malformed
    if (!inputUrl.match(/^https?:\/\//i)) {
        if (inputUrl.includes('.') && !inputUrl.includes(' ')) {
            inputUrl = 'https://' + inputUrl;
        } else {
            inputUrl = 'https://search.brave.com/search?q=' + encodeURIComponent(inputUrl);
        }
    }

    // Final validation check
    try {
        new URL(inputUrl);
    } catch {
        inputUrl = 'https://search.brave.com/search?q=' + encodeURIComponent(inputUrl);
    }
    activeTab.isInitialPageLoad = true;
    activeTab.loading = true;
    updateLoadingBar(activeTab);
    activeTab.url = inputUrl;
    activeTab.frame.go(inputUrl);
}

window.addEventListener("load", async () => {
    await initializeBrowser();
}
);

// WISP Settings Modal Functionality

async function loadWispServers() {
    try {
        const response = await fetch('https://cdn.jsdelivr.net/gh/daniil-athyx/Athyx-Network@main/wisp.txt');
        if (!response.ok) throw new Error('Failed to fetch');
        const text = await response.text();
        const urls = text.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.startsWith('ws'));
        
        const container = document.getElementById('dynamic-wisps-container');
        if (container) {
            container.innerHTML = '';
            
            const currentUrl = localStorage.getItem('proxServer') || (typeof _CONFIG !== 'undefined' ? _CONFIG.wispurl : "wss://ok.worldmicroscope.com/wisp/");
            
            urls.sort((a, b) => {
                if (a === currentUrl) return -1;
                if (b === currentUrl) return 1;
                return 0;
            });
            
            urls.forEach(url => {
                const wispOption = document.createElement('div');
                wispOption.className = 'wisp-option';
                wispOption.dataset.url = url;
                
                const urlObj = new URL(url);
                const name = urlObj.hostname;
                
                wispOption.innerHTML = `
  <div class="wisp-option-name">${name}</div>
  <div class="wisp-option-url">${url}</div>
  <div class="wisp-option-description">Loaded from wisp.txt</div>
  <button class="btn btn-primary wisp-option-btn" data-action="select-wisp">Select</button>
`;
                container.appendChild(wispOption);
            });
            
            // Re-bind click events for new options
            container.querySelectorAll('[data-action="select-wisp"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const option = e.target.closest('.wisp-option');
                    if (option) {
                        selectWispUrl(option.dataset.url);
                    }
                });
            });
            
            // Re-apply selected state
            const selectedOption = container.querySelector(`[data-url="${currentUrl}"]`);
            if (selectedOption) {
                selectedOption.querySelector('.wisp-option-btn').textContent = 'Selected';
            }
            
            // Auto-select if enabled
            const autoSwitch = document.getElementById('auto-wisp-switch');
            if (autoSwitch && autoSwitch.checked) {
                autoSelectFastestWisp();
            }
        }
    } catch (e) {
        console.error('Error loading wisp.txt:', e);
        const container = document.getElementById('dynamic-wisps-container');
        if (container) {
            container.innerHTML = '<div class="wisp-status status-error">Failed to load WISP servers.</div>';
        }
    }
}

function openWISPSettingsModal() {
    const modal = document.getElementById('wisp-settings-modal');
    const currentUrlDisplay = document.getElementById('current-wisp-url');

    const currentUrl = localStorage.getItem('proxServer') || _CONFIG.wispurl;
    currentUrlDisplay.textContent = currentUrl;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Reset all selection buttons
    document.querySelectorAll('.wisp-option-btn').forEach(btn => {
        btn.textContent = 'Select';
    });

    // Mark current URL as selected
    const selectedOption = document.querySelector(`[data-url="${currentUrl}"]`);
    if (selectedOption) {
        selectedOption.querySelector('.wisp-option-btn').textContent = 'Selected';
    }

    updateWispStatus('info', 'Ready to configure');
    updateApplyButton();
    
    // Load dynamic WISP servers
    loadWispServers();
}

function closeWISPSettingsModal() {
    const modal = document.getElementById('wisp-settings-modal');
    modal.classList.add('hidden');
    document.body.style.overflow = 'auto';
}

function selectWispUrl(url) {
    // Update all selection buttons
    document.querySelectorAll('.wisp-option-btn').forEach(btn => {
        btn.textContent = 'Select';
    });

    // Mark selected option
    const selectedOption = document.querySelector(`[data-url="${url}"]`);
    if (selectedOption) {
        selectedOption.querySelector('.wisp-option-btn').textContent = 'Selected';
    }

    // Update current URL display
    document.getElementById('current-wisp-url').textContent = url;

    // Update status
    updateWispStatus('success', `Selected WISP: ${url}`);

    // Enable apply button
    updateApplyButton();
}

// Automatically select the fastest reachable WISP server
async function autoSelectFastestWisp() {
    const container = document.getElementById('dynamic-wisps-container');
    if (!container) return;
    const options = Array.from(container.querySelectorAll('.wisp-option')).map(o => o.dataset.url);
    if (options.length === 0) return;
    
    updateWispStatus('info', 'Finding fastest WISP...');
    
    const promises = options.map(url => {
        return new Promise((resolve) => {
            const start = performance.now();
            try {
                const ws = new WebSocket(url);
                const timeout = setTimeout(() => {
                    try { ws.close(); } catch {}
                    resolve({ url, time: Infinity });
                }, 3000);
                ws.onopen = () => {
                    clearTimeout(timeout);
                    try { ws.close(); } catch {}
                    resolve({ url, time: performance.now() - start });
                };
                ws.onerror = () => {
                    clearTimeout(timeout);
                    try { ws.close(); } catch {}
                    resolve({ url, time: Infinity });
                };
            } catch (e) {
                resolve({ url, time: Infinity });
            }
        });
    });

    const results = await Promise.all(promises);
    let best = results.reduce((min, curr) => curr.time < min.time ? curr : min, { time: Infinity });

    if (best.time < Infinity) {
        selectWispUrl(best.url);
        applyWispSettings(false); // Do not close the modal automatically
        updateWispStatus('success', `Selected fastest: ${best.url} (${Math.round(best.time)}ms)`);
    } else {
        alert('No reachable WISP servers found.');
        updateWispStatus('error', 'All WISP servers offline.');
    }
}

function applyWispSettings(closeModal = true) {
    const newWispUrl = document.getElementById('current-wisp-url').textContent;

    // Save to localStorage
    localStorage.setItem('proxServer', newWispUrl);

    // Dispatch localStorageUpdate event
    const event = new CustomEvent('localStorageUpdate', {
        detail: { key: 'proxServer', newValue: newWispUrl }
    });
    window.dispatchEvent(event);

    // Message the Service Worker
    const configMessage = {
        type: 'config',
        wispurl: newWispUrl,
        adblock: localStorage.getItem('adblockEnabled') === 'true',
        ...getCompatibilitySettings()
    };
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage(configMessage);
    }

    // Update store and reconnect BareMux transports
    store.wispurl = newWispUrl;
    connection.setTransport(`${basePath}Ep/index.mjs`, [{
        wisp: newWispUrl
    }]);

    // Update status
    updateWispStatus('success', 'WISP settings applied successfully!');

    // Close modal after a short delay
    if (closeModal !== false) {
        setTimeout(() => {
            closeWISPSettingsModal();
        }, 1000);
    }
}

function updateWispStatus(type, message) {
    const indicator = document.getElementById('wisp-status-indicator');
    const text = document.getElementById('wisp-status-text');

    // Guard: elements may not exist in simplified modal
    if (!indicator || !text) return;

    // Reset classes
    indicator.className = 'status-indicator';
    text.className = 'status-text';

    // Set new status
    switch (type) {
        case 'success':
            indicator.classList.add('status-success');
            text.classList.add('status-success');
            break;
        case 'error':
            indicator.classList.add('status-error');
            text.classList.add('status-error');
            break;
        case 'loading':
            indicator.classList.add('status-loading');
            text.classList.add('status-loading');
            break;
        case 'info':
            text.classList.add('status-info');
            break;
    }

    text.textContent = message;
}

function updateApplyButton() {
    const applyBtn = document.getElementById('apply-wisp-btn');
    const currentUrl = document.getElementById('current-wisp-url').textContent;
    const originalUrl = localStorage.getItem('proxServer') || _CONFIG.wispurl;

    applyBtn.disabled = (currentUrl === originalUrl);
}

// Initialize event listeners for WISP modal
function initializeWISPEvents() {
    // WISP settings button click
    document.getElementById('wisp-settings-btn').addEventListener('click', () => {
        const newTab = createTab(false);
        document.getElementById("iframe-container").appendChild(newTab.frame.frame);
        switchTab(newTab.id);
        handleSubmit("scram://settings");
    });

    // Close buttons
    document.getElementById('close-wisp-modal').addEventListener('click', closeWISPSettingsModal);
    document.getElementById('close-wisp-modal-footer').addEventListener('click', closeWISPSettingsModal);

    // Predefined WISP selection
    document.querySelectorAll('[data-action="select-wisp"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const wispOption = e.target.closest('.wisp-option');
            const url = wispOption.dataset.url;
            selectWispUrl(url);
        });
    });

    document.getElementById('apply-wisp-btn').addEventListener('click', applyWispSettings);

    // Auto-select fastest WISP button
    const autoSwitch = document.getElementById('auto-wisp-switch');
    if (autoSwitch) {
        autoSwitch.checked = localStorage.getItem('autoSelectFastestWisp') !== 'false';
        autoSwitch.addEventListener('change', (e) => {
            localStorage.setItem('autoSelectFastestWisp', e.target.checked);
            if (e.target.checked) {
                autoSelectFastestWisp();
            }
        });
    }

    // Close modal when clicking outside
    document.getElementById('wisp-settings-modal').addEventListener('click', (e) => {
        if (e.target.id === 'wisp-settings-modal') {
            closeWISPSettingsModal();
        }
    });
}

// WISP events are now initialized at the end of initializeBrowser()

// Notification system for WISP failures
function showWispBrokenNotification() {
    NotificationManager.notify('WISP Connection Error: The WISP server may be down. Please check your settings.', 'error', 5000);
}

function testWispHealth() {
    const wispUrl = localStorage.getItem('proxServer') || _CONFIG.wispurl;
    try {
        const ws = new WebSocket(wispUrl);
        let timeout = setTimeout(() => {
            ws.close();
            showWispBrokenNotification();
        }, 5000);

        ws.onopen = () => {
            clearTimeout(timeout);
            ws.close();
        };

        ws.onerror = () => {
            clearTimeout(timeout);
            showWispBrokenNotification();
        };
    } catch (error) {
        showWispBrokenNotification();
    }
}
function addNewShortcutButton(container) {
    const button = document.createElement('button');
    button.className = 'shortcut-btn add-new';
    button.innerHTML = '+';
    container.appendChild(button);
    button.addEventListener('click', () => {
        const name = prompt('Shortcut name');
        const url = prompt('Shortcut URL');
        if (name && url) {
            let shortcuts = JSON.parse(localStorage.getItem('shortcuts') || '[]');
            shortcuts.push({ name, url });
            localStorage.setItem('shortcuts', JSON.stringify(shortcuts));
        }
    });
}

function updateLoadingBar(tab) {
    let fullLoadingScreen = document.getElementById("full-loading-screen");
    if (!fullLoadingScreen) {
        fullLoadingScreen = document.createElement("div");
        fullLoadingScreen.id = "full-loading-screen";
        fullLoadingScreen.innerHTML = '<div class="loader"></div>';
        fullLoadingScreen.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;background:var(--bg, #0c0406);display:none;justify-content:center;align-items:center;z-index:9999;transition:opacity 0.3s;pointer-events:none;";
        
        const style = document.createElement("style");
        style.textContent = `
            .loader {
                border: 4px solid var(--accent-dim, rgba(255, 255, 255, 0.1));
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border-left-color: var(--accent, #0affce);
                animation: spin 1s linear infinite;
            }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
        
        const iframeContainer = document.getElementById("iframe-container");
        if (iframeContainer) {
            iframeContainer.style.position = "relative";
            iframeContainer.appendChild(fullLoadingScreen);
        }
    }

    const loadingBar = document.getElementById("loading-bar");
    if (!loadingBar || !tab) return;

    // Only update if it's the active tab
    if (tab.id !== activeTabId) return;

    if (tab.loading && tab.isInitialPageLoad) {
        fullLoadingScreen.style.display = "flex";
        void fullLoadingScreen.offsetWidth; // force reflow
        fullLoadingScreen.style.opacity = "1";
    } else {
        if (fullLoadingScreen.style.display !== "none") {
            fullLoadingScreen.style.opacity = "0";
            setTimeout(() => {
                if (activeTabId === tab.id && (!tab.loading || !tab.isInitialPageLoad)) {
                    fullLoadingScreen.style.display = "none";
                }
            }, 300);
        }
    }

    if (tab.loading) {
        loadingBar.style.width = `${tab.progress}%`;
        loadingBar.style.opacity = "1";

        // Simulate progress if it's not complete
        if (tab.progress < 90) {
            // Clear existing interval if any (we'd need to store it on the tab to do this properly, 
            // but for now a simple increment check is okay or we can just let it jump)
            // A better approach for "fake" progress:
            if (!tab.progressInterval) {
                tab.progressInterval = setInterval(() => {
                    if (!tab.loading || tab.progress >= 90) {
                        clearInterval(tab.progressInterval);
                        tab.progressInterval = null;
                        return;
                    }
                    tab.progress += (Math.random() * 10);
                    if (tab.progress > 90) tab.progress = 90;
                    if (activeTabId === tab.id) {
                        loadingBar.style.width = `${tab.progress}%`;
                    }
                }, 500);
            }
        }
    } else {
        loadingBar.style.width = "100%";
        setTimeout(() => {
            if (activeTabId === tab.id && !tab.loading) {
                loadingBar.style.opacity = "0";
                setTimeout(() => {
                    if (activeTabId === tab.id && !tab.loading) {
                        loadingBar.style.width = "0%";
                    }
                }, 200);
            }
        }, 200);

        if (tab.progressInterval) {
            clearInterval(tab.progressInterval);
            tab.progressInterval = null;
        }
    }
}

