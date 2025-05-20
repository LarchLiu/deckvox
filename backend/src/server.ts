// src/server.ts
import dotenv from 'dotenv';
dotenv.config();

import express, { Request, response, Response } from 'express';
import http from 'http'; // http is still needed for server.listen
import TurndownService from 'turndown';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { prompt } from './constants';
import { sha1, parseWorkflowStreamAndReturnOutputs, countTotalDisplayLineBlocks, splitOriginalStringByDisplayLines, updateGithubFiles } from './utiles';
import { ResponseData, ResponseDify, Subtitles, GithubTree } from './types';

const turndownService = new TurndownService();
const app = express();
const server = http.createServer(app); // Express app runs on an HTTP server
const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY,
  baseURL: process.env.AI_API_URL,
})

const difyUrl = process.env.DIFY_API_URL || 'https://api.dify.ai/v1/workflows/run'
const difyKey = process.env.DIFY_API_KEY
const ttsUrl = process.env.TTS_API_URL || ''
const ttsToken = process.env.TTS_API_KEY

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
    const innerHTML_UniqueID = await sha1(elementData.innerHTML);
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
      const startTime = Date.now();
      try {
        // const response = await openai.chat.completions.create({
        //   model: process.env.AI_MODEL || '',
        //   // reasoning_effort: "medium",
        //   messages: [
        //     { role: 'system', content: prompt },
        //     {
        //       role: 'user',
        //       content: md,
        //     },
        //   ],
        // })
        
        // gemini format
        // let yamlData = (response as any).candidates[0].content.parts[0].text || 'error'

        // openai format
        // let yamlData = response.choices[0].message.content || 'error'

        // if (yamlData.startsWith('```yaml')) {
        //   yamlData = yamlData.replace(/^```yaml\n/, '').replace(/```$/, '')
        // }

        // const res = yaml.load(yamlData) as ResponseData
        // let markdown = res.markdown
        //   ? res.markdown.replace(/\n\n---\n\n/g, '\n\n---\n')
        //     .replace(/\n\n---\n---\n/g, '\n\n---\n')
        //     .replace(/(?<!\n)(\n---\n)(?!\n)/g, '\n---\n\n')
        //     .replace(/---$/, '')
        //   : ''
        // // 匹配 <div v-click="数字"> 和 </div> 之间的内容
        // const regex = /<div v-click="(\d+)">\n([\s\S]*?)<\/div>/;
        // markdown = markdown.replace(regex, (match, number, content) => {
        //   // 修整内容前后的换行符
        //   let formattedContent = content.trim();
        //   // 如果内容不以\n开头，则添加\n
        //   if (!formattedContent.startsWith('\n')) {
        //     formattedContent = '\n' + formattedContent;
        //   }
        //   // 如果内容不以\n\n结尾，则添加\n\n
        //   if (!formattedContent.endsWith('\n\n')) {
        //     formattedContent += '\n\n';
        //   }
        //   // 返回新的字符串，包含原匹配的数字
        //   return `<div v-click="${number}">\n${formattedContent}</div>`;
        // });

        // ====dify====
        const response = await parseWorkflowStreamAndReturnOutputs(difyUrl, md, difyKey || '')

        if (!response?.slides)
          throw new Error('There is no slides')

        const slides: ResponseDify[] = response.slides
        const title = response.title as string

        const slaide = slides.map((s, i) => {
          let subtitles: Subtitles = {}
          let headmatter = ''
          s.slide = s.slide.replace(/\n---\n/g, '')
          if (i === 0) {
            headmatter = `
theme: seriph
background: https://cover.sli.dev
title: "${title}"
titleTemplate: '%s - Slaide'
layout: cover
presenter: dev
seoMeta:
  ogTitle: "${title}"
addons:
  - slidev-theme-viplay
subtitlesConfig:
  noTTSDelay: 2000
  ttsApi: "https://edgetts.deno.dev/v1/audio/speech"
  ttsLangName:
    en: "English(US)"
    zh_CN: "中文(简体)"
  apiCustom:
    voice: 'rate:-0.2|pitch:0.1'
  ttsModel:
    zh_CN:
      - value: "zh-CN-YunjianNeural"
        display: "云间"
      - value: "zh-CN-XiaoxiaoNeural"
        display: "晓晓"
    en:
      - value: "en-US-AndrewNeural"
        display: "Andrew"
      - value: "en-US-AriaNeural"
        display: "Aria"
`
          } else {
            const count = countTotalDisplayLineBlocks(s.slide)
            if (count < 10) {
              const layout = s.slide.length % 2 ? 'image-left' : 'image-right'
              headmatter = `
layout: ${layout}
image: "https://cover.sli.dev"
`
            } else {
              headmatter = `
layout: two-cols
`              
              const lines = splitOriginalStringByDisplayLines(s.slide, Math.ceil(count / 2), count)
              s.slide = `${lines.left}\n\n::right::\n\n${lines.right}`
            }
          }
          s.subtitles?.forEach((subtitle, index) => {
            if (index === 0) {
              subtitles.default = subtitle
            } else {
              subtitles[`click${index}`] = subtitle
            }
          })
          const subtitlesStr = s.subtitles?.length ? `subtitles: ${JSON.stringify(subtitles).replace(/\*\*/g, '')}` : ''
          return `---\npage: ${s.page}\n${headmatter}${subtitlesStr}\n---\n\n${s.slide}`
        }).join('\n\n')

        const duration = (Date.now() - startTime) / 1000;

        const slidesDir = path.join(__dirname, '../slides');
        if (!fs.existsSync(slidesDir)) {
          fs.mkdirSync(slidesDir, { recursive: true });
        }

        // Generate filename with timestamp if file exists
        const timestamp = Date.now();
        let slaideName = `${innerHTML_UniqueID}.md`;
        let counter = 1;
        while (fs.existsSync(path.join(slidesDir, slaideName))) {
          slaideName = `${innerHTML_UniqueID}-${timestamp}-${counter}.md`;
          counter++;
        }

        // Write data to markdown file
        try {
          fs.writeFileSync(path.join(slidesDir, slaideName), slaide);
        } catch (error) {
          console.error(`Error writing to file ${slaideName}:`, error);
          throw error;
        }

        const updateFiles: GithubTree[] = [
          {
            path: `contents/${innerHTML_UniqueID}.md`,
            mode: '100644',
            content: md,
            type: 'blob',
          },
          {
            path: `slides/${slaideName}`,
            mode: '100644',
            content: slaide,
            type: 'blob',
          }
        ]

        const tgBotInfo = {
          token: telegramBotToken,
          chatId: telegramChatId,
        }
        // console.log('update github files')
        await updateGithubFiles(updateFiles, slaideName, tgBotInfo)
        // console.log('update github files done')
        
        fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: `👨‍💻 Deploying...\n\nTitle: ${title}\nID: ${innerHTML_UniqueID}\nDuration: ${duration} seconds`,
          }),
        });
      } catch (error: any) {
        const duration = (Date.now() - startTime) / 1000;
        fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: `❌ Error\n\nID: ${innerHTML_UniqueID}\nMessage: ${error.message}\nDuration: ${duration}`,
          }),
        }).catch((error) => {
          console.log(error.message)
        })
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

app.get('/api/tts', async (req: Request, res: Response) => {
  const { format, input, model } = req.query
  const response = await fetch(ttsUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ttsToken}`,
    },
    body: JSON.stringify({
      input,
      model,
      format
    })
  })

  if (!response.ok) {
    throw new Error(`TTS API error: ${response.status}`)
  }

  // Get the audio response
  const audioBuffer = await response.arrayBuffer()

  // Set appropriate headers for audio response
  res.setHeader('Content-Type', 'audio/mpeg'); // Or the correct MIME type for your audio
  res.send(Buffer.from(audioBuffer));
})
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

server.setTimeout(500000);

// 可选：优雅关闭处理
process.on('SIGINT', () => {
  console.log('收到 SIGINT，正在关闭服务器...');
  server.close(() => {
    console.log('HTTP 服务器已关闭。');
    process.exit(0);
  });
});
