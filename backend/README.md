### **Express \+ TypeScript API 后端说明 (无WebSocket)**

本项目使用 Express.js 和 TypeScript 实现一个后端服务，它提供：

1. 一个 API 端点 (例如，用户在插件中配置的 http://localhost:8080/api/process-data)：接收包含元素数据和 Telegram Bot 信息的 taskData，对元素数据进行处理（例如 Base64 编码 innerHTML 作为 contentId），然后（概念上）使用 Telegram Bot 信息发送处理结果，并向插件返回一个确认响应。

**步骤 1: 初始化项目和安装依赖**

1. 创建项目文件夹:

   ```bash
   mkdir express-ts-api-backend
   cd express-ts-api-backend
   npm init \-y
   ```

2. 安装必要的依赖:

   ```bash
   npm install express uuid
   npm install \-D typescript @types/express @types/uuid @types/node ts-node nodemon
   ```

   - express: Web 框架。
   - uuid: 生成唯一 ID (如果 innerHTML 为空时备用)。
   - typescript, @types/\*, ts-node, nodemon: TypeScript 和开发工具。
   - **注意**: ws 库已不再需要。

**步骤 2: 配置 TypeScript (tsconfig.json)**

(与您之前提供的 tsconfig.json 内容一致，此处不再重复)

```json
{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "rootDir": "./src",
    "outDir": "./dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": \["src/\*\*/\*"\],
  "exclude": \["node\_modules", "\*\*/\*.spec.ts"\]
}
```

**步骤 3: 更新 package.json 的脚本**

(与您之前提供的 package.json 内容类似，确保移除了 ws 依赖，如果之前有的话)

```json
{
  "name": "express-ts-api-backend",
  "version": "1.0.0",
  "description": "Express.js \+ TypeScript backend for processing data",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "nodemon src/server.ts"
  },
  "dependencies": {
    "express": "^4.18.2",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.17",
    "@types/node": "^20.5.0",
    "@types/uuid": "^9.0.2",
    "nodemon": "^3.0.1",
    "ts-node": "^10.9.1",
    "typescript": "^5.1.6"
  }
}
```

**步骤 4: 创建服务器代码 (src/server.ts)**

您在 Canvas "src/server.ts (Express \- No WS, Base64 Processing \- innerHTML as ID \- textContent不编码 \- 已修改)" 中提供的代码是正确的实现，它不包含 WebSocket 逻辑，并对 innerHTML 进行 Base64 编码。

**步骤 5: 运行后端服务器**

1. **开发模式**:  
   npm run dev

2. **生产模式**:  
   npm run build  
   npm run start

服务器将运行在您代码中配置的端口（默认为 8080），并监听您在插件中配置的完整 API 端点路径。

**工作流程:**

1. 客户端 (Chrome 插件) 向用户在插件中配置的**完整 API 端点 URL** (例如 http://localhost:8080/api/initiate-task) 发送 POST 请求。请求体结构为：

   ```json
   {
     "taskData": {
       "elementData": { /\* ... 选中的元素数据 ... \*/ },
       "telegramBotToken": "YOUR_BOT_TOKEN",
       "telegramChatId": "YOUR_CHAT_ID"
     }
   }
   ```

2. Express API (src/server.ts 中的相应路由处理器) 接收请求。
3. API 从 req.body.taskData 中提取 elementData、telegramBotToken 和 telegramChatId。
4. API 对 elementData.innerHTML (如果存在) 进行 Base64 编码，生成一个 contentId。如果 innerHTML 为空，则使用 uuidv4() 生成备用 ID。elementData.textContent 保持原始格式。
5. **(概念上)** 服务器使用提供的 telegramBotToken 和 telegramChatId 以及处理后的数据（例如 contentId 和原始 textContent）通过 Telegram Bot API 发送消息。这部分逻辑需要在您的 server.ts 中自行实现。
6. API 向 Chrome 插件返回一个 JSON 响应，例如：

   ```json
   {
     "success": true,
     "message": "数据已在服务器接收并已处理。Telegram 通知（模拟）已发送。",
     "contentId": "BASE64_ENCODED_INNERHTML_OR_UUID"
   }
   ```
