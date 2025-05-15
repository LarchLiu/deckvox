// src/server.ts
import express, { Request, Response } from 'express';
import http from 'http'; // http is still needed for server.listen
import TurndownService from 'turndown';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { prompt } from './constants';
import { sha256 } from './utiles';

dotenv.config();

const turndownService = new TurndownService();
const app = express();
const server = http.createServer(app); // Express app runs on an HTTP server
const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY,
  baseURL: process.env.AI_API_URL,
})

// --- Express API 端点 ---
// app.use(express.json()); // 中间件，用于解析 JSON 请求体
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: true}));

// API endpoint to process data and (conceptually) send to Telegram
// The URL for this endpoint is configured directly in the Chrome extension popup.
app.post('/api/initiate-task', async (req: Request, res: Response) => {
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
    const innerHTML_UniqueID = await sha256(elementData.innerHTML);
    const md = turndownService.turndown(elementData.innerHTML);
    // Create markdown directory if it doesn't exist
    const markdownDir = path.join(__dirname, '../markdown');
    if (!fs.existsSync(markdownDir)) {
      fs.mkdirSync(markdownDir, { recursive: true });
    }
    
    const markdownPath = path.join(markdownDir, `${innerHTML_UniqueID}.md`);
    if (!fs.existsSync(markdownPath)) {
      fs.writeFileSync(markdownPath, md);
    }

    setTimeout(async () => {
      try {
        const startTime = Date.now();
        const response: any = await openai.chat.completions.create({
          model: process.env.AI_MODEL || '',
          // reasoning_effort: "medium",
          messages: [
            { role: 'system', content: prompt },
            {
              role: 'user',
              content: md,
            },
          ],
        })
        const duration = (Date.now() - startTime) / 1000;

        // gemini format
        const data = response.candidates[0].content.parts[0].text || 'error'

        // openai format
        // const data = response.choices[0].message.content || 'error'

        const slidesDir = path.join(__dirname, '../slides');
        if (!fs.existsSync(slidesDir)) {
          fs.mkdirSync(slidesDir, { recursive: true });
        }

        // Generate filename with timestamp if file exists
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let slidePath = path.join(slidesDir, `${innerHTML_UniqueID}.md`);
        let counter = 1;
        while (fs.existsSync(slidePath)) {
          slidePath = path.join(slidesDir, `${innerHTML_UniqueID}-${timestamp}-${counter}.md`);
          counter++;
        }

        // Write data to markdown file
        try {
          fs.writeFileSync(slidePath, data);
        } catch (error) {
          console.error(`Error writing to file ${slidePath}:`, error);
          throw error;
        }
        
        fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: `ID: ${innerHTML_UniqueID} duration: ${duration} seconds`,
          }),
        });
      } catch (error: any) {
        fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: `ID: ${innerHTML_UniqueID}) error: ${error.message}`, // Telegram message limit is 4096 characters
          }),
        });
      }
    });

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
  const startTime = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  console.log(`Express API 服务器正在运行在 http://localhost:${PORT} (${startTime})`);
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
