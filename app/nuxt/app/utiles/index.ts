/* eslint-disable no-console */
export async function sha1(message: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

/**
 * 处理从流中提取的每一行文本。
 * 根据 SSE 格式识别不同行类型 (data:, event:, 空行等)。
 * 如果行是 'data:' 且其 JSON 内容表示 'workflow_finished' 事件，则返回 data.outputs。
 *
 * @param {string} line - 从流中读取的一行文本。
 * @returns {any | undefined} - 返回找到的 workflow_finished outputs，否则返回 undefined。
 */
export function processLineWithReturn(line: string): any | undefined {
  // 移除行首尾的空白字符，包括可能的 \r
  const trimmedLine = line.trim()

  // 忽略完全的空行
  if (trimmedLine.length === 0) {
    // console.log('Skipping empty line'); // 可选：用于调试
    return undefined
  }

  // 处理 event: 行
  if (trimmedLine.startsWith('event: ')) {
    const eventType = trimmedLine.substring(7).trim()
    console.log(`Received SSE event type: ${eventType}`)
    // 对于 'ping' 或其他非数据事件，我们通常只记录或忽略
    // 不需要返回 outputs
    return undefined
  }

  // 处理 data: 行
  if (trimmedLine.startsWith('data: ')) {
    // 提取 JSON 字符串部分 (移除 'data: ')
    const jsonString = trimmedLine.substring(6)

    try {
      // 解析 JSON 字符串
      const eventData = JSON.parse(jsonString)

      // 打印解析后的事件数据（可选）
      // console.log('Received Data Event:', eventData);

      // 检查 JSON 数据中的事件类型
      // 注意这里是检查 JSON 对象内部的 'event' 字段
      if (eventData.event === 'workflow_finished') {
        console.log('Workflow finished event detected in data payload.')
        // 提取并返回 outputs
        // 使用可选链 ?. 以防 data 或 outputs 不存在
        const outputs = eventData.data?.outputs
        // console.log('Extracted outputs:', outputs)
        return outputs // 返回找到的 outputs
      }
      else {
        // 打印其他类型的 data 事件（可选）
        console.log(`Received data event type: ${eventData.event}`)
      }
    }
    catch (e) {
      console.error('Failed to parse JSON from data line:', jsonString, e)
      // 可以在这里处理解析错误，例如，如果某一行的数据格式不正确
      // 默认行为是忽略解析失败的行，不返回 outputs
    }
    return undefined // 是 data 行，但不是 workflow_finished 或解析失败
  }

  // 处理其他未知类型的行
  console.warn('Skipping unknown line type:', trimmedLine)
  return undefined
}
