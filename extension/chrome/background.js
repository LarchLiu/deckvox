// background.js

// --- MODIFICATION START: Import STORAGE_KEYS and DEFAULT_SERVER_API_URL from constants.js ---
import { STORAGE_KEYS, DEFAULT_SERVER_API_URL } from './constants.js';
// --- MODIFICATION END ---

let baseServerApiUrl = null;
let lastCapturedElementData = null;
let selectionGloballyEnabled = false; // In-memory state, defaults to false on SW startup

let apiCallStatus = 'IDLE';
let lastApiResponse = null;
let lastApiError = null;

// --- MODIFICATION START: DEFAULT_SERVER_API_URL_BG is now imported as DEFAULT_SERVER_API_URL ---
// const DEFAULT_SERVER_API_URL_BG = 'http://localhost:8080/api/initiate-task'; // This local definition is removed
// --- MODIFICATION END ---
const SUCCESS_ICON_URL = 'icons/icon128.png';
const ERROR_ICON_URL = 'icons/icon128.png';


async function initializeBackgroundState() {
    try {
        const result = await chrome.storage.local.get([
            STORAGE_KEYS.SERVER_API_URL, 
            STORAGE_KEYS.LAST_CAPTURED_DATA 
        ]);
        // --- MODIFICATION START: Use imported DEFAULT_SERVER_API_URL ---
        baseServerApiUrl = result[STORAGE_KEYS.SERVER_API_URL] || DEFAULT_SERVER_API_URL;
        // --- MODIFICATION END ---
        lastCapturedElementData = result[STORAGE_KEYS.LAST_CAPTURED_DATA] || null;
        
        selectionGloballyEnabled = false; 
        apiCallStatus = 'IDLE';

        console.log('Background: Initial state set/loaded:');
        console.log('  Base Server API URL:', baseServerApiUrl);
        console.log('  Selection Enabled (in-memory default):', selectionGloballyEnabled);

        if (result[STORAGE_KEYS.SERVER_API_URL] === undefined) {
            // --- MODIFICATION START: Use imported DEFAULT_SERVER_API_URL ---
            chrome.storage.local.set({ [STORAGE_KEYS.SERVER_API_URL]: DEFAULT_SERVER_API_URL });
            // --- MODIFICATION END ---
        }
    } catch (e) {
        console.error("Background: Error initializing state from storage:", e);
        // --- MODIFICATION START: Use imported DEFAULT_SERVER_API_URL ---
        baseServerApiUrl = DEFAULT_SERVER_API_URL;
        // --- MODIFICATION END ---
        selectionGloballyEnabled = false;
        lastCapturedElementData = null;
    }
}

initializeBackgroundState();

function showNotification(idSuffix, title, message, isError = false) {
    const notificationId = `${isError ? 'err' : 'succ'}_${idSuffix}_${Date.now()}`;
    const iconToShow = isError ? ERROR_ICON_URL : SUCCESS_ICON_URL;
    chrome.notifications.create(notificationId, {
        type: 'basic', iconUrl: iconToShow, title: title, message: message, priority: 2,
    }, () => {
        if (chrome.runtime.lastError) console.error('Notification error:', chrome.runtime.lastError.message);
    });
}

function updateApiCallStatus(newState, apiResponse = null, apiError = null, broadcast = true) {
    if (apiCallStatus !== newState || JSON.stringify(lastApiResponse) !== JSON.stringify(apiResponse) || lastApiError !== apiError) {
        apiCallStatus = newState;
        lastApiResponse = apiResponse;
        lastApiError = apiError;

        if (newState === 'API_SUCCESS') {
            setElementSelectionEnabled(false, false); 
        }
        if (broadcast) broadcastStateToPopups();
    }
}

function setElementSelectionEnabled(enabled, broadcast = true, specificTabId = null) {
    if (selectionGloballyEnabled !== enabled || specificTabId !== null) { 
        selectionGloballyEnabled = enabled; 

        console.log(`Background: Element selection changed to ${enabled}. Broadcasting to content scripts.`);
        
        const messagePayload = { type: 'SET_SELECTION_ENABLED', enabled: selectionGloballyEnabled };

        if (specificTabId !== null) {
            chrome.tabs.sendMessage(specificTabId, messagePayload)
                .catch(err => { console.warn("BG: Failed to send to specific tab:", specificTabId, err.message) });
        } else {
            chrome.tabs.query({}, (tabs) => {
                for (let tab of tabs) {
                    if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
                        chrome.tabs.sendMessage(tab.id, messagePayload)
                            .catch(err => { /* console.warn("BG: Failed to send to tab:", tab.id, err.message) */ });
                    }
                }
            });
        }

        if (broadcast) {
            console.log("Background: Broadcasting updated selection state to popups.");
            broadcastStateToPopups();
        }
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SEND_DATA_TO_API') {
        const payloadFromPopup = message.payload;
        updateApiCallStatus('API_CALLING', null, null, true);
        // --- MODIFICATION START: Use imported DEFAULT_SERVER_API_URL ---
        const apiUrlToUse = baseServerApiUrl || DEFAULT_SERVER_API_URL;
        // --- MODIFICATION END ---
        const bodyToSend = { taskData: payloadFromPopup };

        fetch(apiUrlToUse, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyToSend)
        })
        .then(async response => {
            const responseText = await response.text();
            if (!response.ok) {
                let errorData;
                try { errorData = JSON.parse(responseText); }
                catch (e) { errorData = { message: responseText || `API Error: ${response.status}` }; }
                throw new Error(errorData.message || `API Error: ${response.status}`);
            }
            try { return JSON.parse(responseText); }
            catch (e) { return { success: true, message: responseText }; }
        })
        .then(data => {
            const successMessage = data.message || (typeof data === 'string' ? data : "数据已成功发送到服务器处理。");
            updateApiCallStatus('API_SUCCESS', data, null, true);
            sendResponse({ status: successMessage, error: false, data: data });
            showNotification('api_send_success', '数据发送成功', successMessage, false);
        })
        .catch(error => {
            console.error("Background: API call failed:", error);
            updateApiCallStatus('API_ERROR', null, error.message, true);
            sendResponse({ error: true, message: `API调用失败: ${error.message}` });
            showNotification('api_send_error', 'API 调用失败', error.message, true);
        });
        return true;
    }
    else if (message.type === 'ELEMENT_DATA_CAPTURED') {
        lastCapturedElementData = message.data;
        chrome.storage.local.set({ [STORAGE_KEYS.LAST_CAPTURED_DATA]: lastCapturedElementData }); 
        broadcastStateToPopups();
        sendResponse({ status: "Data received by background." });
        return true;
    } else if (message.type === 'ELEMENT_SELECTION_CLEARED') {
        lastCapturedElementData = null;
        chrome.storage.local.remove(STORAGE_KEYS.LAST_CAPTURED_DATA); 
        updateApiCallStatus('IDLE', null, null, true);
        broadcastStateToPopups();
        sendResponse({ status: "Captured data cleared in background." });
        return true;
    } else if (message.type === 'UPDATE_SERVER_ADDRESS') {
        baseServerApiUrl = message.serverApiUrl;
        chrome.storage.local.set({ [STORAGE_KEYS.SERVER_API_URL]: baseServerApiUrl }); 
        updateApiCallStatus('IDLE', null, null, true);
        sendResponse({status: "API 端点 URL 已在后台更新。"});
        broadcastStateToPopups();
        return true;
    } else if (message.type === 'GET_APP_STATUS') { 
        sendFullStatusResponse(sendResponse);
        return true;
    } else if (message.type === 'MANUAL_TOGGLE_SELECTION') { 
        console.log("Background: Received MANUAL_TOGGLE_SELECTION, new state:", message.enabled);
        setElementSelectionEnabled(message.enabled, true); 
        sendResponse({status: "Selection toggled by user."});
        return true;
    } 
    else if (message.type === 'GET_CURRENT_SELECTION_STATE_FOR_TAB') {
        console.log(`Background: Content script (tab ${sender.tab?.id}) requested current selection state. Sending: ${selectionGloballyEnabled}`);
        sendResponse({ selectionEnabled: selectionGloballyEnabled });
        return true; 
    }
    return false;
});

function sendFullStatusResponse(sendResponseCallback) {
    sendResponseCallback({
        baseServerApiUrl: baseServerApiUrl,
        apiCallStatus: apiCallStatus,
        lastApiResponse: lastApiResponse,
        lastApiError: lastApiError,
        currentCapturedData: lastCapturedElementData,
        selectionEnabled: selectionGloballyEnabled
    });
}

function broadcastStateToPopups() {
    const keysToGet = [STORAGE_KEYS.SERVER_API_URL, STORAGE_KEYS.LAST_CAPTURED_DATA]; 
    chrome.storage.local.get(keysToGet, (result) => {
        // --- MODIFICATION START: Use imported DEFAULT_SERVER_API_URL ---
        baseServerApiUrl = result[STORAGE_KEYS.SERVER_API_URL] || DEFAULT_SERVER_API_URL;
        // --- MODIFICATION END ---
        lastCapturedElementData = result[STORAGE_KEYS.LAST_CAPTURED_DATA] || null;
        doBroadcast();
    });
}

function doBroadcast() {
    chrome.runtime.sendMessage({
        type: 'BACKGROUND_STATUS_UPDATE',
        status: {
            baseServerApiUrl: baseServerApiUrl,
            apiCallStatus: apiCallStatus,
            lastApiResponse: lastApiResponse,
            lastApiError: lastApiError,
            currentCapturedData: lastCapturedElementData,
            selectionEnabled: selectionGloballyEnabled
        }
    }).catch(error => {
        if (!(error.message.includes("Could not establish connection") || error.message.includes("Receiving end does not exist"))) {
            // console.warn("Background: Error broadcasting to popup:", error.message);
        }
    });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        console.log(`Background: Tab ${tabId} updated. Sending current selection state: ${selectionGloballyEnabled}`);
        setElementSelectionEnabled(selectionGloballyEnabled, false, tabId); 
    }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (chrome.runtime.lastError) {
            console.warn("Error getting tab info in onActivated:", chrome.runtime.lastError.message);
            return;
        }
        if (tab && tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
            console.log(`Background: Tab ${activeInfo.tabId} activated. Sending current selection state: ${selectionGloballyEnabled}`);
            setElementSelectionEnabled(selectionGloballyEnabled, false, activeInfo.tabId);
        }
    });
});

chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        console.log("Background: Browser lost focus. Disabling element selection globally if it was enabled.");
        if (selectionGloballyEnabled) { 
            setElementSelectionEnabled(false, true); 
        }
    } else {
        console.log("Background: Browser gained focus. Current selection state:", selectionGloballyEnabled);
    }
});

console.log('Background service worker started (Using constants.js for default API URL, Enhanced Focus/Tab handling).');
