### **Chrome 元素选择器插件 (API \+ Telegram Bot \- v2)**

此插件允许您通过鼠标在任何网页上选择 HTML 元素，并将选定的数据发送到您配置的后端服务器。后端服务器随后可以使用您提供的 Telegram Bot 信息将处理结果发送到指定的 Telegram 聊天。

**核心功能**:

- **弹出控制面板**: 点击浏览器工具栏上的插件图标，会弹出一个控制面板。
  - **启用/禁用开关**: 启用或禁用整个元素选择和高亮功能。**插件加载或浏览器重启后，此开关默认为禁用状态。**
  - **服务器地址配置**:
    - 输入框，允许用户输入您的后端 **完整 API 端点 URL** (HTTP/HTTPS)，例如 http://localhost:8080/api/process-data。
    - “保存URL”按钮。
  - **Telegram Bot 配置**:
    - 输入框，用于填写您的 Telegram Bot Token。
    - 输入框，用于填写目标 Telegram Chat ID。
    - “保存Bot信息”按钮。
  - **数据显示与发送**:
    - 显示最近在页面上点击选中的元素数据。
    - “发送数据到 API”按钮：点击此按钮会将选中的元素数据、Bot Token 和 Chat ID 打包后，通过 taskData 键发送到您配置的完整 API 端点 URL。
  - **API 调用状态**: 显示 API 调用的状态（例如“正在调用API...”、“API调用成功”、“API调用失败”）和服务器的直接 JSON 响应（格式化显示）。
  - **备注输入框**: 输入和保存本地备注。
- **页面交互**:
  - 悬停高亮元素 (当“元素选择”功能启用时)。
  - 点击元素选择数据，数据会显示在弹出窗口中。
  - 按 Esc 清除选择。
- **状态管理**:
  - **API成功后自动关闭选择**: 当数据成功发送到 API 并收到成功响应后，“元素选择”功能会自动关闭。用户可以之后手动重新打开。
  - **浏览器失焦时自动关闭选择**: 当浏览器窗口失去焦点时，“元素选择”功能会自动关闭，以清除页面上的高亮效果。
  - **标签页切换/刷新时同步状态**: 当用户切换标签页或刷新页面时，插件会尝试与背景脚本同步“元素选择”的当前状态，确保高亮效果正确应用或清除。

**工作流程**:

1. **配置**:
   - 在弹出窗口中，设置您的后端 **完整 API 端点 URL** (例如 http://localhost:8080/api/your-endpoint) 并保存。
   - 设置您的 **Telegram Bot Token** 和 **Telegram Chat ID** 并保存。
2. **启用选择**: 打开弹出窗口，启用“元素选择”开关。
3. **选择元素**: 在网页上点击您想要捕获的元素。其数据会显示在弹出窗口的“当前选中数据”区域。
4. **发送数据**: 在弹出窗口中，点击“发送数据到 API”按钮。
5. **插件操作**:
   - 插件会将选中的元素数据、Bot Token 和 Chat ID 打包成一个对象，并将其作为 taskData 字段的值，通过 POST 请求发送到您配置的完整 API 端点 URL。
   - 弹出窗口会显示 API 调用的状态。
   - 如果 API 调用成功，“元素选择”功能会自动关闭。
6. **后端服务器操作 (您的责任)**:
   - 您的 Express 服务器接收到包含 taskData 的请求。
   - 服务器从 taskData 中提取 elementData、telegramBotToken 和 telegramChatId。
   - 服务器处理 elementData（例如，对 innerHTML 进行 Base64 编码以生成 contentId）。
   - 服务器使用提供的 Bot Token 和 Chat ID，通过 Telegram Bot API 将处理结果（例如 contentId 和原始 textContent）发送到指定的 Telegram 聊天。
   - 服务器向插件返回一个 JSON 响应 (例如 { "success": true, "message": "...", "contentId": "..." })。
7. **结果接收**:
   - 插件弹出窗口会显示来自您 API 服务器的直接 JSON 响应。
   - 您将在指定的 Telegram 聊天中收到最终的处理结果。

**文件结构 (插件部分):**

```plaintext
element\_selector\_extension/
├── manifest.json
├── background.js
├── content\_script.js
├── popup.html
├── popup.js
├── style.css
├── constants.js  \<-- 新增：用于存放共享常量
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

**注意事项**:

- **API 端点 URL**: 请确保在插件中配置的是您后端服务器上用于处理这些数据的**完整 API 端点 URL**。
- **Telegram Bot 实现**: 后端服务器与 Telegram Bot API 的交互逻辑需要您在服务器端自行实现。
- **数据持久化**: 插件会使用 chrome.storage.local 持久化 API 端点 URL、Telegram Bot 配置、用户备注和最后捕获的元素数据。“元素选择”的启用状态是内存中的，浏览器或插件重启后默认为关闭。
