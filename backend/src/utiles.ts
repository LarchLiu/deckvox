export async function sha256(message: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * 从 fetch ReadableStream 中读取并解析类似 SSE 的数据流，
 * 寻找特定事件 ("workflow_finished") 并提取其 data.outputs。
 *
 * @param {string} url - 要 fetch 的 URL
 * @returns {Promise<any | undefined>} - Promise resolved with the outputs of the 'workflow_finished' event, or undefined if not found by the time the stream ends.
 */
export async function parseWorkflowStreamAndReturnOutputs(url: string, input: string, token: string): Promise<any | undefined> {
    return new Promise(async (resolve, reject) => {
        let reader = undefined;
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  "inputs": {
                    input,
                  },
                  "response_mode": "streaming",
                  "user": "test"
                })
              });

            if (!response.ok) {
                // 使用 response.statusText 包含更多信息
                reject(new Error(`HTTP error! status: ${response.status} - ${response.statusText}`));
                return;
            }

            // 确保 response body 是可读流
            if (!response.body) {
                 reject(new Error('Response body is not a ReadableStream'));
                 return;
            }

            reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = ''; // 用于存储未处理的文本块
            let workflowFinishedOutputs = undefined; // Variable to store the outputs

            // 循环读取流数据块
            while (true) {
                const { done, value } = await reader.read();

                // 如果 done 为 true，表示流已结束
                if (done) {
                    console.log('Stream finished.');
                    // 处理 buffer 中可能剩余的任何文本
                    if (buffer.length > 0) {
                         console.warn('Stream ended with unprocessed buffer:', buffer);
                         // 可以尝试处理最后一部分，但这取决于服务器是否总以换行符结束
                         // 如果是 SSE 标准，最后应该是 \n\n，buffer 应该处理完
                         // processLineWithReturn(buffer); // 尝试处理最后一行
                    }
                    // 解析剩余的 TextDecoder 缓冲
                    const remaining = decoder.decode();
                     if (remaining.length > 0) {
                         console.warn('TextDecoder had remaining data after stream end:', remaining);
                         // const outputs = processLineWithReturn(remaining); // Potentially process last part
                         // if (outputs !== undefined) {
                         //    workflowFinishedOutputs = outputs;
                         // }
                     }


                    // Resolve the promise with the found outputs (could be undefined if not found)
                    resolve(workflowFinishedOutputs);
                    break; // Exit the loop
                }

                // value 是一个 Uint8Array，解码并添加到 buffer
                // { stream: true } 选项表示这只是流的一部分，解码器会缓冲不完整的字符
                buffer += decoder.decode(value, { stream: true });

                // 查找 buffer 中的换行符并处理完整的行
                // SSE 标准使用 \n 作为分隔符，但也可能遇到 \r\n
                let newlineIndex;
                // Keep processing lines as long as there's a newline in the buffer
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex);
                    // 从 buffer 中移除已处理的行（包括换行符）
                    buffer = buffer.substring(newlineIndex + 1);

                    // 处理提取出的完整行，并检查是否找到了 outputs
                    const outputs = processLineWithReturn(line);
                    if (outputs !== undefined) {
                         // Store the found outputs. If multiple workflow_finished events occur,
                         // this will store the outputs from the *last* one processed before stream ends.
                         // If you only want the *first* one, you'd add logic here to break and resolve.
                         workflowFinishedOutputs = outputs;
                         // Example: If you only want the first one:
                         // reader.cancel(); // Cancel the stream reading
                         // resolve(workflowFinishedOutputs); // Resolve immediately
                         // return; // Exit the promise function
                    }
                }
            } // End of while loop

            // If the loop finished normally (done === true) and the promise hasn't been resolved yet
            // (e.g., because reader.cancel() wasn't called for the first match),
            // the resolve(workflowFinishedOutputs) after the loop will handle it.


        } catch (error) {
            console.error('Error fetching or reading stream:', error);
            // Ensure the reader is cancelled on error to release resources
            if (reader && !reader.closed) {
                reader.cancel('Error during stream processing').catch(e => console.error('Error cancelling reader:', e));
            }
            reject(error); // Reject the promise on error
        }
    });
}

/**
 * 处理从流中提取的每一行文本。
 * 根据 SSE 格式识别不同行类型 (data:, event:, 空行等)。
 * 如果行是 'data:' 且其 JSON 内容表示 'workflow_finished' 事件，则返回 data.outputs。
 *
 * @param {string} line - 从流中读取的一行文本。
 * @returns {any | undefined} - 返回找到的 workflow_finished outputs，否则返回 undefined。
 */
function processLineWithReturn(line: string): any | undefined {
    // 移除行首尾的空白字符，包括可能的 \r
    const trimmedLine = line.trim();

    // 忽略完全的空行
    if (trimmedLine.length === 0) {
        // console.log('Skipping empty line'); // 可选：用于调试
        return undefined;
    }

    // 处理 event: 行
    if (trimmedLine.startsWith('event: ')) {
        const eventType = trimmedLine.substring(7).trim();
        console.log(`Received SSE event type: ${eventType}`);
        // 对于 'ping' 或其他非数据事件，我们通常只记录或忽略
        // 不需要返回 outputs
        return undefined;
    }

    // 处理 data: 行
    if (trimmedLine.startsWith('data: ')) {
        // 提取 JSON 字符串部分 (移除 'data: ')
        const jsonString = trimmedLine.substring(6);

        try {
            // 解析 JSON 字符串
            const eventData = JSON.parse(jsonString);

            // 打印解析后的事件数据（可选）
            // console.log('Received Data Event:', eventData);

            // 检查 JSON 数据中的事件类型
            // 注意这里是检查 JSON 对象内部的 'event' 字段
            if (eventData.event === 'workflow_finished') {
                console.log('Workflow finished event detected in data payload.');
                // 提取并返回 outputs
                // 使用可选链 ?. 以防 data 或 outputs 不存在
                const outputs = eventData.data?.outputs;
                // console.log('Extracted outputs:', outputs);
                return outputs; // 返回找到的 outputs
            } else {
                // 打印其他类型的 data 事件（可选）
                 console.log(`Received data event type: ${eventData.event}`);
            }

        } catch (e) {
            console.error('Failed to parse JSON from data line:', jsonString, e);
            // 可以在这里处理解析错误，例如，如果某一行的数据格式不正确
            // 默认行为是忽略解析失败的行，不返回 outputs
        }
        return undefined; // 是 data 行，但不是 workflow_finished 或解析失败
    }

    // 处理其他未知类型的行
    console.warn('Skipping unknown line type:', trimmedLine);
    return undefined;
}
