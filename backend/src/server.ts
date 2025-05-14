// src/server.ts
import express, { Request, Response } from 'express';
import http from 'http'; // http is still needed for server.listen
import { v4 as uuidv4 } from 'uuid'; // Can still be used for logging or other IDs if needed
import TurndownService from 'turndown';

const turndownService = new TurndownService();
const app = express();
const server = http.createServer(app); // Express app runs on an HTTP server

// --- Express API 端点 ---
// app.use(express.json()); // 中间件，用于解析 JSON 请求体
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: true}));

// API endpoint to process data and (conceptually) send to Telegram
// The URL for this endpoint is configured directly in the Chrome extension popup.
app.post('/api/initiate-task', (req: Request, res: Response) => {
  try {
    // The payload from the extension is expected to be:
    // req.body = { taskData: { elementData, telegramBotToken, telegramChatId } }
    const taskPayload = req.body.taskData;

    if (!taskPayload || !taskPayload.elementData || !taskPayload.telegramBotToken || !taskPayload.telegramChatId) {
      return res.status(400).json({ 
        error: true, 
        message: '请求体中缺少 taskData 或其必要属性 (elementData, telegramBotToken, telegramChatId)。' 
      });
    }

    const { elementData, telegramBotToken, telegramChatId } = taskPayload;
    const innerHTML_UniqueID = uuidv4();
    const md = turndownService.turndown(elementData.innerHTML);
    console.log(md)

    setTimeout(() => {
      fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: `ID: ${innerHTML_UniqueID}) markdown:\n${md.substring(0, 3000)}`, // Telegram message limit is 4096 characters
        }),
      });
    }, 3000);

    // 返回给 Chrome 插件的响应
    return res.status(200).json({
      success: true,
      message: '数据已在服务器接收并已处理。Telegram 通知（模拟）已发送。',
      contentId: innerHTML_UniqueID // 返回这个基于内容的唯一ID
    });

  } catch (error: any) {
    console.error('API: 处理 /api/initiate-task 请求时出错:', error);
    return res.status(500).json({ error: true, message: error.message || '服务器内部错误 (Internal Server Error)' });
  }
});

// --- 启动服务器 ---
const PORT = process.env.PORT || 8080; 
server.listen(PORT, () => {
  console.log(`Express API 服务器正在运行在 http://localhost:${PORT}`);
  console.log(`API 端点示例: POST http://localhost:${PORT}/api/initiate-task`);
});

// 可选：优雅关闭处理
process.on('SIGINT', () => {
  console.log('收到 SIGINT，正在关闭服务器...');
  server.close(() => {
    console.log('HTTP 服务器已关闭。');
    process.exit(0);
  });
});
