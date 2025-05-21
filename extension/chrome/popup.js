// popup.js

// --- MODIFICATION START: Import STORAGE_KEYS and DEFAULT_SERVER_API_URL from constants.js ---
import { STORAGE_KEYS, DEFAULT_SERVER_API_URL } from './constants.js';
// --- MODIFICATION END ---

document.addEventListener('DOMContentLoaded', () => {
    const enableSwitch = document.getElementById('enableSwitch');
    const notesTextarea = document.getElementById('notes');
    const saveNotesButton = document.getElementById('saveNotesButton');
    const statusMessage = document.getElementById('statusMessage');

    const serverApiUrlInput = document.getElementById('serverApiUrlInput'); 
    const saveServerApiUrlButton = document.getElementById('saveServerApiUrlButton'); 

    const telegramTokenInput = document.getElementById('telegramTokenInput');
    const telegramChatIdInput = document.getElementById('telegramChatIdInput');
    const saveTelegramConfigButton = document.getElementById('saveTelegramConfigButton');

    const selectedDataForSendingDisplay = document.getElementById('selectedDataForSendingDisplay');
    const sendDataButton = document.getElementById('sendDataButton');
    const apiCallStateDisplay = document.getElementById('apiCallStateDisplay');
    const apiServerResponseDisplay = document.getElementById('apiServerResponseDisplay');
    const apiCallErrorDisplay = document.getElementById('apiCallErrorDisplay');

    let currentDataForSending = null; 
    // --- MODIFICATION START: DEFAULT_SERVER_API_URL is now imported ---
    // const DEFAULT_SERVER_API_URL = 'http://localhost:8080/api/process-data'; // This local definition is removed
    // --- MODIFICATION END ---

    chrome.storage.local.get(
        [STORAGE_KEYS.USER_NOTES, STORAGE_KEYS.SERVER_API_URL, STORAGE_KEYS.TELEGRAM_BOT_TOKEN, STORAGE_KEYS.TELEGRAM_CHAT_ID], 
        (result) => {
            notesTextarea.value = result[STORAGE_KEYS.USER_NOTES] || '';
            // --- MODIFICATION START: Use imported DEFAULT_SERVER_API_URL ---
            serverApiUrlInput.value = result[STORAGE_KEYS.SERVER_API_URL] || DEFAULT_SERVER_API_URL; 
            // --- MODIFICATION END ---
            telegramTokenInput.value = result[STORAGE_KEYS.TELEGRAM_BOT_TOKEN] || '';
            telegramChatIdInput.value = result[STORAGE_KEYS.TELEGRAM_CHAT_ID] || '';
            
            requestAndUpdateFullStatus();
        }
    );

    function requestAndUpdateFullStatus() {
        if (!chrome.runtime || !chrome.runtime.sendMessage) {
            console.warn("Popup: Chrome runtime not available for status update.");
            return;
        }
        chrome.runtime.sendMessage({ type: 'GET_APP_STATUS' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Popup: Error getting status from background:", chrome.runtime.lastError.message);
                apiCallErrorDisplay.textContent = "无法从后台获取状态: " + chrome.runtime.lastError.message;
                return;
            }
            if (response) {
                updatePopupUI(response); 
                if (response.currentCapturedData && !currentDataForSending) {
                    currentDataForSending = response.currentCapturedData;
                    selectedDataForSendingDisplay.textContent = JSON.stringify(currentDataForSending, null, 2);
                }
                sendDataButton.disabled = !currentDataForSending || !telegramTokenInput.value.trim() || !telegramChatIdInput.value.trim() || !serverApiUrlInput.value.trim();
            } else {
                 apiCallErrorDisplay.textContent = "后台脚本未响应状态请求。";
            }
        });
    }

    function updatePopupUI(status) { 
        apiCallErrorDisplay.textContent = ''; 

        let apiStatusText = '空闲';
        switch (status.apiCallStatus) {
            case 'IDLE': apiStatusText = '空闲 (等待发送)'; break;
            case 'API_CALLING': apiStatusText = '正在调用API...'; break;
            case 'API_SUCCESS': 
                apiStatusText = 'API调用成功'; 
                if (enableSwitch.checked) { 
                    enableSwitch.checked = false; 
                }
                break;
            case 'API_ERROR': 
                apiStatusText = 'API调用失败'; 
                apiCallErrorDisplay.textContent = status.lastApiError || 'API调用出错。'; 
                break;
            default: apiStatusText = status.apiCallStatus || '空闲';
        }
        apiCallStateDisplay.textContent = apiStatusText;
        
        if (status.lastApiResponse) {
            try {
                apiServerResponseDisplay.textContent = JSON.stringify(status.lastApiResponse, null, 2);
            } catch (e) {
                apiServerResponseDisplay.textContent = String(status.lastApiResponse); 
            }
        } else {
            apiServerResponseDisplay.textContent = '无';
        }
        
        if (status.currentCapturedData !== undefined) {
            if (!status.currentCapturedData && currentDataForSending) { 
                currentDataForSending = null;
                selectedDataForSendingDisplay.textContent = "未选择任何元素 (背景已清除)";
            } else if (status.currentCapturedData && (!currentDataForSending || JSON.stringify(currentDataForSending) !== JSON.stringify(status.currentCapturedData))) {
                currentDataForSending = status.currentCapturedData;
                selectedDataForSendingDisplay.textContent = JSON.stringify(currentDataForSending, null, 2);
            }
        } else if (!currentDataForSending) { 
             selectedDataForSendingDisplay.textContent = "未选择任何元素";
        }

        if (status.baseServerApiUrl && serverApiUrlInput.value !== status.baseServerApiUrl) {
            if (document.activeElement !== serverApiUrlInput) {
                // serverApiUrlInput.value = status.baseServerApiUrl; 
            }
        }
        
        if (status.selectionEnabled !== undefined && enableSwitch.checked !== status.selectionEnabled) {
            enableSwitch.checked = status.selectionEnabled;
        }

        sendDataButton.disabled = !currentDataForSending || 
                                  !telegramTokenInput.value.trim() || 
                                  !telegramChatIdInput.value.trim() || 
                                  !serverApiUrlInput.value.trim() ||
                                  status.apiCallStatus === 'API_CALLING'; 
    }

    enableSwitch.addEventListener('change', () => {
        const isEnabled = enableSwitch.checked;
        showTemporaryStatus(`元素选择已${isEnabled ? '启用' : '禁用'}.`);
        if (chrome.runtime && chrome.runtime.sendMessage) {
             chrome.runtime.sendMessage({ type: 'MANUAL_TOGGLE_SELECTION', enabled: isEnabled });
        }
    });

    saveNotesButton.addEventListener('click', () => {
        chrome.storage.local.set({ [STORAGE_KEYS.USER_NOTES]: notesTextarea.value }, () => showTemporaryStatus('备注已保存!'));
    });

    saveServerApiUrlButton.addEventListener('click', () => { 
        const newServerApiUrl = serverApiUrlInput.value.trim(); 
        if (newServerApiUrl && (newServerApiUrl.startsWith('http://') || newServerApiUrl.startsWith('https://'))) {
            chrome.storage.local.set({ [STORAGE_KEYS.SERVER_API_URL]: newServerApiUrl }, () => { 
                showTemporaryStatus('API 端点 URL 已保存!');
                if (chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({ type: 'UPDATE_SERVER_ADDRESS', serverApiUrl: newServerApiUrl }, () => {
                         if (chrome.runtime.lastError) console.error("Popup: Error sending UPDATE_SERVER_ADDRESS:", chrome.runtime.lastError.message);
                         setTimeout(requestAndUpdateFullStatus, 100);
                    });
                }
            });
        } else {
            showTemporaryStatus('请输入有效的 API 端点 URL (以 http:// 或 https:// 开头)。');
        }
    });

    saveTelegramConfigButton.addEventListener('click', () => {
        const token = telegramTokenInput.value.trim();
        const chatId = telegramChatIdInput.value.trim();

        if (!token || !chatId) {
            showTemporaryStatus('请输入 Bot Token 和 Chat ID。');
            sendDataButton.disabled = true; 
            return;
        }
        chrome.storage.local.set({ 
            [STORAGE_KEYS.TELEGRAM_BOT_TOKEN]: token, 
            [STORAGE_KEYS.TELEGRAM_CHAT_ID]: chatId 
        }, () => {
            showTemporaryStatus('Telegram Bot 信息已保存!');
            sendDataButton.disabled = !currentDataForSending || !token || !chatId || !serverApiUrlInput.value.trim();
        });
    });

    [serverApiUrlInput, telegramTokenInput, telegramChatIdInput].forEach(input => {
        input.addEventListener('input', () => {
            sendDataButton.disabled = !currentDataForSending || 
                                      !telegramTokenInput.value.trim() || 
                                      !telegramChatIdInput.value.trim() || 
                                      !serverApiUrlInput.value.trim() ||
                                      apiCallStateDisplay.textContent === '正在调用API...'; 
        });
    });


    sendDataButton.addEventListener('click', () => {
        console.log("Send Data button clicked."); 
        const token = telegramTokenInput.value.trim();
        const chatId = telegramChatIdInput.value.trim();
        const apiUrl = serverApiUrlInput.value.trim();

        if (!currentDataForSending) {
            showTemporaryStatus('没有选中的数据可发送。');
            console.log("Send Data: No data to send.");
            return;
        }
        if (!apiUrl || !(apiUrl.startsWith('http://') || apiUrl.startsWith('https://'))) {
            showTemporaryStatus('请先配置并保存有效的 API 端点 URL。');
            console.log("Send Data: Invalid API URL.");
            return;
        }
        if (!token || !chatId) {
            showTemporaryStatus('请先配置并保存 Telegram Bot Token 和 Chat ID。');
            console.log("Send Data: Missing Telegram config.");
            return;
        }

        showTemporaryStatus('正在发送数据到服务器...');
        apiCallStateDisplay.textContent = '正在调用API...';
        apiCallErrorDisplay.textContent = ''; 
        apiServerResponseDisplay.textContent = '无'; 
        sendDataButton.disabled = true; 

        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ 
                type: 'SEND_DATA_TO_API', 
                payload: {
                    elementData: currentDataForSending,
                    botInfo: {
                        tgBot: {
                            token,
                            chatId
                        }
                    }
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Popup: Error in sendMessage for SEND_DATA_TO_API:", chrome.runtime.lastError.message);
                    showTemporaryStatus('发送数据请求时出错: ' + chrome.runtime.lastError.message);
                    apiCallStateDisplay.textContent = 'API调用失败'; 
                    apiCallErrorDisplay.textContent = chrome.runtime.lastError.message;
                } else if (response && response.error) { 
                    showTemporaryStatus(`发送失败: ${response.message}`);
                    apiCallStateDisplay.textContent = 'API调用失败'; 
                    apiCallErrorDisplay.textContent = response.message;
                } else if (response && response.status) {
                    console.log("Popup: SEND_DATA_TO_API message acknowledged by background:", response.status);
                }
            });
        } else {
            showTemporaryStatus('无法与后台脚本通信。');
            apiCallStateDisplay.textContent = 'API调用失败';
            apiCallErrorDisplay.textContent = '无法与后台脚本通信。';
            sendDataButton.disabled = !currentDataForSending || !token || !chatId || !apiUrl; 
        }
    });
    
    if (chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'ELEMENT_DATA_CAPTURED') {
                currentDataForSending = message.data;
                selectedDataForSendingDisplay.textContent = JSON.stringify(message.data, null, 2);
                apiCallStateDisplay.textContent = "数据已选中 (等待发送)";
                apiServerResponseDisplay.textContent = "无";
                sendDataButton.disabled = !currentDataForSending || 
                                          !telegramTokenInput.value.trim() || 
                                          !telegramChatIdInput.value.trim() || 
                                          !serverApiUrlInput.value.trim();
                sendResponse({ status: "Data received by popup." });
                return true;
            } else if (message.type === 'ELEMENT_SELECTION_CLEARED') {
                currentDataForSending = null;
                selectedDataForSendingDisplay.textContent = "选择已清除";
                apiCallStateDisplay.textContent = "空闲"; 
                apiServerResponseDisplay.textContent = "无";
                apiCallErrorDisplay.textContent = "";
                sendDataButton.disabled = true;
                sendResponse({ status: "Selection cleared in popup." });
                return true;
            } else if (message.type === 'BACKGROUND_STATUS_UPDATE') {
                console.log("Popup: Received BACKGROUND_STATUS_UPDATE", message.status);
                updatePopupUI(message.status); 
                return false; 
            }
            return false; 
        });
    }

    function showTemporaryStatus(message) {
        statusMessage.textContent = message;
        setTimeout(() => { statusMessage.textContent = ''; }, 3500);
    }

    requestAndUpdateFullStatus();
});
