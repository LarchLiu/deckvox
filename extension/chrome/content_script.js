// content_script.js

let currentHoverElement = null;
let lastClickedElement = null;
let isExtensionEnabled = false; // Default to false, will be updated by background.js
let styleElement = null;

const HOVER_CLASS = 'element-selector-hover-highlight-v4'; 
const CLICKED_CLASS = 'element-selector-clicked-highlight-v4';

function applyCurrentSelectionState(enabled) {
    if (isExtensionEnabled !== enabled) {
        console.log(`ContentScript: Applying selection state: ${enabled ? 'Enabled' : 'Disabled'}`);
        isExtensionEnabled = enabled;
        if (isExtensionEnabled) {
            ensureStylesInjected();
            attachEventListeners();
        } else {
            clearAllHighlights();
            removeEventListeners();
        }
    }
}

function requestStateFromBackground() {
    if (chrome.runtime && chrome.runtime.sendMessage) {
        console.log("ContentScript: Requesting current selection state from background...");
        chrome.runtime.sendMessage({ type: 'GET_CURRENT_SELECTION_STATE_FOR_TAB' }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('ContentScript: Error getting current state from background:', chrome.runtime.lastError.message, '(This can happen if background is not ready yet)');
                // Optionally, retry or fallback to a disabled state
                applyCurrentSelectionState(false); // Fallback to disabled if error
                return;
            }
            if (response && response.selectionEnabled !== undefined) {
                console.log("ContentScript: Received current selection state from background:", response.selectionEnabled);
                applyCurrentSelectionState(response.selectionEnabled);
            } else {
                console.warn("ContentScript: Invalid or no response from background for GET_CURRENT_SELECTION_STATE_FOR_TAB. Defaulting to disabled.");
                applyCurrentSelectionState(false); // Fallback
            }
        });
    } else {
        // Fallback if runtime is not available (e.g., during script injection phase sometimes)
        console.warn("ContentScript: chrome.runtime not available to request state. Defaulting to disabled.");
        applyCurrentSelectionState(false);
    }
}


function ensureStylesInjected() {
    if (styleElement && document.head.contains(styleElement)) return;
    styleElement = document.createElement('style');
    styleElement.textContent = `
        .${HOVER_CLASS} { outline: 2px dashed #3498db !important; outline-offset: 2px !important; background-color: rgba(52, 152, 219, 0.05) !important; box-shadow: 0 0 5px rgba(52, 152, 219, 0.5) !important; cursor: pointer !important; }
        .${CLICKED_CLASS} { outline: 3px solid #e74c3c !important; outline-offset: 2px !important; background-color: rgba(231, 76, 60, 0.1) !important; box-shadow: 0 0 8px rgba(231, 76, 60, 0.7) !important; }
    `;
    document.head.appendChild(styleElement);
}

function clearAllHighlights() {
    if (lastClickedElement) {
        lastClickedElement.classList.remove(CLICKED_CLASS);
        lastClickedElement = null;
    }
    if (currentHoverElement) {
        currentHoverElement.classList.remove(HOVER_CLASS);
        currentHoverElement = null;
    }
    console.log("ContentScript: Highlights cleared.");
}

function handleMouseOver(e) {
    if (!isExtensionEnabled) return;
    const targetElement = e.target;
    if (!targetElement || targetElement === document.body || targetElement === document.documentElement || targetElement === lastClickedElement) {
        if (currentHoverElement && currentHoverElement !== lastClickedElement) currentHoverElement.classList.remove(HOVER_CLASS);
        currentHoverElement = (targetElement === lastClickedElement) ? targetElement : null;
        return;
    }
    if (currentHoverElement && currentHoverElement !== lastClickedElement) currentHoverElement.classList.remove(HOVER_CLASS);
    if (targetElement !== lastClickedElement) targetElement.classList.add(HOVER_CLASS);
    currentHoverElement = targetElement;
}

function handleMouseOut(e) {
    if (!isExtensionEnabled) return;
    const targetElement = e.target;
    if (!targetElement || targetElement === document.body || targetElement === document.documentElement) return;
    if (targetElement !== lastClickedElement) targetElement.classList.remove(HOVER_CLASS);
    if (targetElement === currentHoverElement) currentHoverElement = null;
}

function handleClick(e) {
    if (!isExtensionEnabled || !currentHoverElement) return;
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const targetElement = currentHoverElement;
    if (lastClickedElement && lastClickedElement !== targetElement) lastClickedElement.classList.remove(CLICKED_CLASS);
    targetElement.classList.add(CLICKED_CLASS);
    targetElement.classList.remove(HOVER_CLASS);
    lastClickedElement = targetElement;
    currentHoverElement = targetElement;

    const data = {
        timestamp: new Date().toISOString(), url: window.location.href, tagName: targetElement.tagName,
        id: targetElement.id || null, classList: Array.from(targetElement.classList).filter(cls => cls !== CLICKED_CLASS && cls !== HOVER_CLASS),
        attributes: Array.from(targetElement.attributes).reduce((obj, attr) => { obj[attr.name] = attr.value; return obj; }, {}),
        textContent: targetElement.textContent ? targetElement.textContent.trim() : '',
        innerHTML: targetElement.innerHTML, outerHTML: targetElement.outerHTML,
    };
    console.log("%cContentScript: Element Clicked & Data Extracted:", "color: red; font-weight: bold;", targetElement);
    chrome.runtime.sendMessage({ type: 'ELEMENT_DATA_CAPTURED', data: data }, (response) => {
        if (chrome.runtime.lastError) console.error('CS: Error sending ELEMENT_DATA_CAPTURED:', chrome.runtime.lastError.message);
    });
}

function handleKeyDown(e) {
    if (!isExtensionEnabled) return; 
    if (e.key === "Escape") {
        if (lastClickedElement) {
            lastClickedElement.classList.remove(CLICKED_CLASS);
            lastClickedElement = null;
            if (currentHoverElement && currentHoverElement.classList.contains(HOVER_CLASS)) currentHoverElement.classList.remove(HOVER_CLASS);
            currentHoverElement = null;
            console.log("ContentScript: Clicked selection cleared via Escape key.");
            chrome.runtime.sendMessage({ type: 'ELEMENT_SELECTION_CLEARED' }, (response) => {
                if (chrome.runtime.lastError) console.warn('CS: Error sending SELECTION_CLEARED:', chrome.runtime.lastError.message);
            });
        } else if (currentHoverElement) {
            currentHoverElement.classList.remove(HOVER_CLASS);
            currentHoverElement = null;
        }
    }
}

// Listen for state pushes from background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SET_SELECTION_ENABLED') {
        applyCurrentSelectionState(message.enabled);
        sendResponse({status: "Selection state updated in content script."}); 
        return true; 
    }
    return false; 
});

function attachEventListeners() {
    removeEventListeners(); 
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
    console.log("ContentScript: Event listeners attached.");
}

function removeEventListeners() {
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    console.log("ContentScript: Event listeners removed.");
}

// --- MODIFICATION START: Listen for window focus and visibility changes ---
window.addEventListener('focus', () => {
    console.log("ContentScript: Window gained focus. Requesting current selection state.");
    requestStateFromBackground();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log("ContentScript: Page became visible. Requesting current selection state.");
        requestStateFromBackground();
    } else if (document.visibilityState === 'hidden') {
        // Optional: If you want to proactively clear highlights when tab is hidden,
        // even if background hasn't sent a "disable" message yet (e.g., if browser focus is lost later).
        // However, background.js's onFocusChanged should handle the global disable.
        // This might be redundant or could conflict if not careful.
        // For now, relying on focus event and messages from background.
        // console.log("ContentScript: Page became hidden.");
        // if (isExtensionEnabled) {
        //     applyCurrentSelectionState(false); // Proactively disable if tab is hidden
        // }
    }
});
// --- MODIFICATION END ---

// Initial state request when script is first injected or page loads
// This helps if the background's onUpdated message is missed or arrives late.
// Wrapped in a try-catch in case chrome.runtime is not immediately available.
try {
    requestStateFromBackground();
} catch(e) {
    console.warn("ContentScript: Error on initial state request:", e);
    applyCurrentSelectionState(false); // Default to disabled
}

console.log("ContentScript loaded. Initial state request sent.");
