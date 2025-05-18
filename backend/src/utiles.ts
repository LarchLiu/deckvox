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
                console.log('Extracted outputs:', outputs);
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

// 定义需要从字符串中移除/跳过以计算“显示行”的模式
// 现在只包含一个模式：特定的成对 div 结构
const SPECIAL_BLOCK_CAPTURE_PATTERN = /<div v-click="\d+">(\n+.*?\n+)<\/div>/gs;
// Explanation:
// <div v-click="1"> : matches the literal opening tag
// \n+             : matches one or more newline characters
// .*?             : matches any character (except newline by default), non-greedily
//                 : with the 's' flag below, '.' matches newline too, so this matches *anything* between the newlines
// \\n+            : matches one or more newline characters (escaped for regex literal)
// <\/div>          : matches the literal closing tag (escaped '/')
// g               : Global flag - match all occurrences
// s               : Dotall flag - '.' matches newline characters (essential for matching content across lines)


/**
 * 计算字符串中移除特定成对 div 模式块后，剩余的连续换行块 (\n+) 的数量。
 * 这些连续换行块代表了能够显示的“行”的数量。
 *
 * @param {string} originalString 原始输入字符串。
 * @returns {number} 移除指定模式块后，剩余字符串中的连续换行块数量。
 */
export function countTotalDisplayLineBlocks(originalString: string): number {
    // 使用 replace 配合 callback function，将每个匹配到的完整块替换为其捕获组的内容
    // (match, p1) => p1: match 是整个匹配到的字符串，p1 是第一个捕获组的内容 (.*?)
    const stringWithBlocksReplacedByContent = originalString.replace(
        SPECIAL_BLOCK_CAPTURE_PATTERN,
        (match: any, content: any) => content // Replace the whole matched block with just its content
    );

    // console.log("--- 移除后 ---")
    // console.log(stringWithBlocksReplacedByContent)
    // 在替换后的字符串中计算连续 \n 块的数量
    const matches = stringWithBlocksReplacedByContent.match(/\n+/g);

    // 如果 matches 是 null (没有匹配到任何 \n+), 则数量为 0
    // 否则，数量就是匹配到的块的数量 (数组的长度)
    return matches ? matches.length : 0;
}

/**
 * 根据目标左边显示行块数量，切分原始字符串。
 * 遍历原始字符串，同时模拟计算显示行，找到对应切分点。
 * 在计算显示行时，会跳过符合特定成对 div 模式的整个块。
 *
 * @param {string} originalString 原始输入字符串。
 * @param {number} targetLeftLineBlocks 目标左边需要包含的显示行块数量。
 * @param {number} totalDisplayLineBlocks 原始字符串中总的显示行块数量 (由 countTotalDisplayLineBlocks 计算得出)。
 * @returns {{left: string, right: string}} 包含左右两侧字符串的对象。
 */
export function splitOriginalStringByDisplayLines(originalString: string, targetLeftLineBlocks: number, totalDisplayLineBlocks: number): { left: string; right: string; } {
    // 处理边缘情况：如果目标大于或等于总数，整个字符串都在左边
    if (targetLeftLineBlocks <= 0 || targetLeftLineBlocks >= totalDisplayLineBlocks) {
         return { left: originalString, right: "" };
    }

    // 构建一个用于在遍历原始字符串时，检查是否需要跳过当前位置的正则表达式。
    // 这个正则表达式需要锚定到当前检查的子字符串的开头 (^)。
    const patternToSkipRegex = new RegExp(
        '^' + SPECIAL_BLOCK_CAPTURE_PATTERN.source,
        SPECIAL_BLOCK_CAPTURE_PATTERN.flags.replace('g', '') // Keep 's' flag, remove 'g'
    );

    let currentDisplayLineBlocks = 0;
    let lastDisplayCharWasNewline = false; // 追踪模拟的显示字符串中上一个字符是否是换行符
    let splitOriginalIndex = originalString.length; // 默认切分点在末尾

    for (let i = 0; i < originalString.length; i++) {
        // 检查当前位置 i 是否是需要跳过的特定块的开始
        const subStringFromI = originalString.substring(i);
        const match = subStringFromI.match(patternToSkipRegex);

        if (match) {
            // 如果匹配到需要跳过的模式块
            const matchedPattern = match[0];
            const patternLength = matchedPattern.length;

            // 跳过整个匹配到的模式块
            i += patternLength - 1; // -1 因为外层循环会自增 i

            // 在模拟的显示字符串中，跳过的模式块不产生可见字符或换行影响
            lastDisplayCharWasNewline = false; // 确保下一个有效字符不被认为是紧跟在换行后面

            continue; // 继续外层循环，处理下一个字符（或跳过的位置之后）
        }

        // 如果当前位置 i 不匹配需要跳过的模式块的开始
        const currentChar = originalString[i];

        // 模拟当前字符在显示字符串中的行为以计数行块
        if (currentChar === '\n') {
            // 如果当前字符是换行符，并且在模拟的显示字符串中它不紧跟在另一个换行符后面
            if (!lastDisplayCharWasNewline) {
                currentDisplayLineBlocks++; // 发现一个新的显示行块的开始
            }
            lastDisplayCharWasNewline = true; // 模拟显示字符串中当前是换行符
        } else {
            // 如果当前字符不是换行符
            lastDisplayCharWasNewline = false; // 模拟显示字符串中当前不是换行符
        }

        // 检查是否达到了切分点 (在处理完当前字符后检查)
        // splitOriginalIndex 默认为末尾，一旦找到切分点就会更新并 break
        if (currentDisplayLineBlocks >= targetLeftLineBlocks) {
             // 切分点是当前字符的 *后面*
             splitOriginalIndex = i + 1;
             // 找到切分点后，无需继续遍历
             // console.log(`找到切分点在原始字符串索引: ${splitOriginalIndex}. 对应字符: ${originalString[splitOriginalIndex-1]}. 模拟行块数: ${currentDisplayLineBlocks}`);
             break;
        }
    }

    // 6. 根据找到的切分点切分原始字符串
    const leftSide = originalString.substring(0, splitOriginalIndex);
    const rightSide = originalString.substring(splitOriginalIndex);

    return { left: leftSide, right: rightSide };
}
