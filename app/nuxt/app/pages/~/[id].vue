<script setup lang="ts">
import { WebContainer } from '@webcontainer/api'
import { Terminal } from '@xterm/xterm'
import { processLineWithReturn } from '~/utiles'
import '@xterm/xterm/css/xterm.css'

definePageMeta({
  layout: false,
})

const taskStore = useTaskStore()
const workflowFinishedOutputs = ref('')
const textareaValue = ref('')
const iframeEl = ref<HTMLIFrameElement | null>(null)
const textareaEl = ref<HTMLTextAreaElement | null>(null)
const terminalEl = ref<HTMLDivElement | null>(null)

const botInfo = computed(() => {
  const info: any = {}
  const botInfo = taskStore.botInfo
  if (botInfo.feishuBot && botInfo.feishuBot.url) {
    info.feishuBot = { ...botInfo.feishuBot }
  }
  if (botInfo.tgBot && botInfo.tgBot.chatId && botInfo.tgBot.token) {
    info.tgBot = { ...botInfo.tgBot }
  }
  return info
})

let webcontainerInstance: WebContainer | null = null
const files: any = {}

function loadFile(name: string) {
  const xhr = new XMLHttpRequest()
  const okStatus = document.location.protocol === 'file:' ? 0 : 200
  xhr.open('GET', name, false)
  xhr.overrideMimeType('text/html;charset=utf-8')// 默认为utf-8
  xhr.send(null)
  return xhr.status === okStatus ? xhr.responseText : null
}

async function installDependencies(terminal: Terminal) {
  // Install dependencies
  const installProcess = await webcontainerInstance?.spawn('npm', ['install'])
  installProcess?.output.pipeTo(
    new WritableStream({
      write(data) {
        terminal.write(data)
      },
    }),
  )
  // Wait for install command to exit
  return installProcess?.exit
}

async function startDevServer(terminal: Terminal) {
  // Run `npm run start` to start the Express app
  const serverProcess = await webcontainerInstance?.spawn('npm', ['run', 'dev'])

  serverProcess?.output.pipeTo(
    new WritableStream({
      write(data) {
        terminal.write(data)
      },
    }),
  )

  // Wait for `server-ready` event
  webcontainerInstance?.on('server-ready', (port, url) => {
    iframeEl.value && (iframeEl.value.src = url)
  })
}

/**
 * @param {string} content
 */

async function writeIndexJS(content: string) {
  await webcontainerInstance?.fs.writeFile('/slides.md', content)
}
files['slides.md'] = { file: {
  contents: loadFile('/slidev/slides.md'),
} }
files['package.json'] = { file: {
  contents: loadFile('/slidev/package.json'),
} }
onMounted(async () => {
  nextTick(async () => {
    textareaValue.value = files['slides.md'].file.contents
    // textareaEl.value!.addEventListener('input', (e) => {
    //   writeIndexJS((e.currentTarget as HTMLTextAreaElement)?.value)
    // })
    // console.log(terminalEl.value, textareaEl.value)

    const terminal = new Terminal({
      convertEol: true,
    })
    terminal.open(terminalEl.value!)

    // Call only once
    webcontainerInstance = await WebContainer.boot()
    await webcontainerInstance.mount(files)

    const exitCode = await installDependencies(terminal)
    if (exitCode !== 0) {
      throw new Error('Installation failed')
    }

    startDevServer(terminal)
  })

  const data = await $fetch<ReadableStream>('/api/init-task/', {
    method: 'POST',
    responseType: 'stream',
    body: {
      taskData: {
        contents: taskStore.contents,
        sha1: taskStore.contentsSha1,
        botInfo: botInfo.value,
      },
    },
  })

  taskStore.clearData()

  const reader = data.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = '' // 用于存储未处理的文本块

  if (reader) {
    // 循环读取流数据块
    while (true) {
      const { done, value } = await reader.read()

      // 如果 done 为 true，表示流已结束
      if (done) {
      // eslint-disable-next-line no-console
        console.log('Stream finished.')
        // 处理 buffer 中可能剩余的任何文本
        if (buffer.length > 0) {
          console.warn('Stream ended with unprocessed buffer:', buffer)
          // 可以尝试处理最后一部分，但这取决于服务器是否总以换行符结束
          // 如果是 SSE 标准，最后应该是 \n\n，buffer 应该处理完
          // processLineWithReturn(buffer); // 尝试处理最后一行
        }
        // 解析剩余的 TextDecoder 缓冲
        const remaining = decoder.decode()
        if (remaining.length > 0) {
          console.warn('TextDecoder had remaining data after stream end:', remaining)
          // const outputs = processLineWithReturn(remaining); // Potentially process last part
          // if (outputs !== undefined) {
          //    workflowFinishedOutputs = outputs;
          // }
        }

        // Resolve the promise with the found outputs (could be undefined if not found)
        break
      }

      // value 是一个 Uint8Array，解码并添加到 buffer
      // { stream: true } 选项表示这只是流的一部分，解码器会缓冲不完整的字符
      buffer += decoder.decode(value, { stream: true })

      // 查找 buffer 中的换行符并处理完整的行
      // SSE 标准使用 \n 作为分隔符，但也可能遇到 \r\n
      let newlineIndex = buffer.indexOf('\n')
      // Keep processing lines as long as there's a newline in the buffer
      while (newlineIndex !== -1) {
        const line = buffer.substring(0, newlineIndex)
        // 从 buffer 中移除已处理的行（包括换行符）
        buffer = buffer.substring(newlineIndex + 1)

        // 处理提取出的完整行，并检查是否找到了 outputs
        const outputs = processLineWithReturn(line)
        if (outputs !== undefined) {
          // Store the found outputs. If multiple workflow_finished events occur,
          // this will store the outputs from the *last* one processed before stream ends.
          // If you only want the *first* one, you'd add logic here to break and resolve.
          workflowFinishedOutputs.value = outputs
          // Example: If you only want the first one:
          // reader.cancel(); // Cancel the stream reading
          // resolve(workflowFinishedOutputs); // Resolve immediately
          // return; // Exit the promise function
        }
        newlineIndex = buffer.indexOf('\n')
      }
    }
  }
})
</script>

<template>
  <client-only>
    <div class="flex flex-row h-screen w-screen">
      <div class="flex flex-col h-full">
        <div class="h-30rem">
          <iframe ref="iframeEl" src="/loading.html" />
        </div>
        <div ref="terminalEl" class="terminal" />
      </div>
      <div class="flex flex-col w-full">
        <textarea ref="textareaEl" v-model="textareaValue" @input="(e) => writeIndexJS((e.currentTarget as HTMLTextAreaElement).value || '')" />
      </div>
    <!-- <div>{{ workflowFinishedOutputs }}</div> -->
    </div>
  </client-only>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

body {
  margin: 0.5rem 1rem;
  height: 100vh;
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    'Roboto',
    'Oxygen',
    'Ubuntu',
    'Cantarell',
    'Fira Sans',
    'Droid Sans',
    'Helvetica Neue',
    sans-serif;
}

header {
  text-align: center;
}

header h1 {
  margin-bottom: 0;
}

header p {
  font-size: 1.5rem;
  margin-top: 0;
}

iframe,
textarea {
  border-radius: 3px;
}

iframe {
  height: 30rem;
  width: 100%;
  border: solid 2px #ccc;
}

textarea {
  width: 100%;
  height: 100%;
  resize: none;
  background: black;
  color: white;
  padding: 0.5rem 1rem;
  font-size: 120%;
}

.terminal {
  width: 100%;
  height: calc(100vh - 30rem) !important;
  border: solid 1px #ccc;
  border-radius: 3px;
}

:deep(.xterm-screen) {
  height: calc(100vh - 30rem) !important;
}

.wc {
  -webkit-text-fill-color: #0000;
  background-clip: text;
  -webkit-background-clip: text;
  background-image: linear-gradient(to right, #761fac 0, #8a19a9 20%, #d900a5 70%, #d917a3 100%);
  filter: drop-shadow(0 1px 0 #fff);
  font-weight: 800;
  color: #69f5ff;
  text-decoration: underline;
}

.docs {
  margin-left: 5px;
  text-decoration: none;
  font-weight: 600;
  color: #333;
  font-size: 80%;
  text-decoration: underline;
}
</style>
