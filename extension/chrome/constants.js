// constants.js

// 定义所有 chrome.storage.local 中使用的键名
export const STORAGE_KEYS = {
    // API 服务器的完整端点 URL
    SERVER_API_URL: 'serverApiUrl', 
    // 最后一次从页面捕获的元素数据
    LAST_CAPTURED_DATA: 'lastCapturedElementData', 
    // Telegram Bot Token (由用户在 popup 中配置)
    TELEGRAM_BOT_TOKEN: 'telegramBotToken', 
    // Telegram Chat ID (由用户在 popup 中配置)
    TELEGRAM_CHAT_ID: 'telegramChatId',
    // 用户备注
    USER_NOTES: 'userNotes' 
};

// --- MODIFICATION START: Add default server API URL constant ---
// 默认的后端 API 端点 URL
export const DEFAULT_SERVER_API_URL = 'http://localhost:8080/api/initiate-task';
// --- MODIFICATION END ---
