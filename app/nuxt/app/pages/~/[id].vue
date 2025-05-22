<script setup lang="ts">
import { processLineWithReturn } from '~/utiles'

const taskStore = useTaskStore()
const workflowFinishedOutputs = ref('') // Variable to store the outputs

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
onMounted(async () => {
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
  <div>
    hi
    <div>{{ workflowFinishedOutputs }}</div>
  </div>
</template>

<style scoped>

</style>
