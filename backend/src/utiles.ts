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


// --- 使用示例 ---
// TODO: add to test
const testString1 = `
这是一个段落1
<div v-click="1">
这里是 div 内容 1
</div>
这是一个段落2，带一个换行符\n在这里
<div v-click="99">\n\n多行内容\n\n</div>
这是一个段落3，带两个换行符\n\n在这里
<div>普通 div 1
换行
</div>
这是段落4
<div v-click="5">单行内容</div>
<div v-click="2">\n内容后没有换行</div>
前面没有换行\n</div>
结尾文本
`;
/*
分析 testString1 中符合 SPECIAL_BLOCK_CAPTURE_PATTERN 的块:
1. <div v-click="1">\n\n多行内容\n\n</div>  <-- 匹配 (\n+ 后， \n+ 前)
其他 <div v-click="1">...</div> 结构都不匹配，因为不满足 \n+ 在后/\n+ 在前的条件:
- <div v-click="1">\n这里是 div 内容 1\n</div> : \n 后，但没有 \n+ 前 (只有一个 \n)
- <div>普通 div 1\n换行\n</div> : 普通 div
- <div v-click="1">单行内容</div> : 后面没有 \n+
- <div v-click="1">\n内容后没有换行</div> : 后面有 \n，但结尾没有 \n+
- 前面没有换行\n</div> : 前面没有 <div v-click="1">
*/

// 移除匹配块后的概念字符串:
// "\n这是一个段落1\n<div v-click=\"1\">\n这里是 div 内容 1\n</div>\n这是一个段落2，带一个换行符\n在这里\n这是一个段落3，带两个换行符\n\n在这里\n<div>普通 div 1\n换行\n</div>\n这是段落4\n<div v-click=\"1\">单行内容</div>\n<div v-click=\"1\">\n内容后没有换行</div>\n前面没有换行\n</div>\n结尾文本\n"
// (注意：那些不匹配特殊模式的 div 标签 *保留* 在用于计数的字符串中)

// 连续换行块 (\n+) 在移除匹配块后的字符串中 (手动数):
// 1. 开头的 \n
// 2. 段落1 后的 \n
// 3. 内容1 后的 \n (在保留的 <div...> 结构内)
// 4. 段落2 后的 \n
// 5. 在这里 后的 \n
// 6. 段落3 后的 \n\n (一个块)
// 7. 在这里 后的 \n
// 8. 普通 div 后的 \n (在保留的 <div>...</div> 结构内)
// 9. 换行 后的 \n (在保留的 <div>...</div> 结构内)
// 10. 段落4 后的 \n
// 11. 单行内容 后的 \n (在保留的 <div...> 结构内)
// 12. <div...> 后面的 \n (在保留的 <div...> 结构内)
// 13. 前面没有换行 后的 \n (在保留的 ...</div> 结构内)
// 14. 结尾文本 后的 \n
// 总计 14 个显示行块。目标左边 = ceil(14/2) = 7。


console.log("--- 示例 1 ---");
console.log("原始字符串:\n", testString1);

// 步骤 1: 计算总显示行数
const totalLines1 = countTotalDisplayLineBlocks(testString1);
console.log("总显示行块数:", totalLines1); // 预期 14

// 步骤 2: 确定左边目标行数
const targetLeftLines1 = Math.ceil(totalLines1 / 2);
console.log("目标左边显示行块数 (ceil(14/2)):", targetLeftLines1); // 预期 7

// 步骤 3: 根据目标行数切分原始字符串
const result1 = splitOriginalStringByDisplayLines(testString1, targetLeftLines1, totalLines1);

console.log("\n切分结果:");
console.log("--- Left Side (Target Lines: " + targetLeftLines1 + ") ---");
console.log(result1.left);
console.log("--- Right Side ---");
console.log(result1.right);
// 预期切分点在第 7 个显示行块之后。
// 块1: 开头 \n (i=0)
// 块2: 段落1 后 \n (i=1+10)
// 块3: 内容1 后 \n (i=1+10+25+1 + 11) -> 在保留的 div 结构内
// 块4: 段落2 后 \n (i=... + 14)
// 块5: 在这里 后 \n (i=... + 4 + 2 + 4 + 1)
// -- 匹配的块被跳过 -- <div v-click="1">\n\n多行内容\n\n</div> (length ~45)
// 块6: 段落3 后 \n\n (i=... + 45 + 14) -> 这是一个 \n\n 块，只计一次
// 块7: 在这里 后 \n (i=... + 5)
// 切分点应该在第 7 个块后面，即 "在这里\n" 的后面。


const testString2 = "LineA\nLineB\n<div v-click=\"1\">\n\nContentC\n\n</div>LineD\n\nLineE<div>RegularF</div>LineG";
/*
分析 testString2 中符合 SPECIAL_BLOCK_CAPTURE_PATTERN 的块:
1. <div v-click="1">\n\nContentC\n\n</div>  <-- 匹配 (\n+ 后， \n+ 前)
*/
// 移除匹配块后的概念字符串: "LineA\nLineB\nLineD\n\nLineE<div>RegularF</div>LineG"
// 连续换行块 (\n+) 在移除匹配块后的字符串中 (手动数):
// 1. LineA 后的 \n
// 2. LineB 后的 \n
// 3. LineD 后的 \n\n (一个块)
// 4. RegularF 后的 \n (在保留的 <div>...</div> 结构内)
// 总计 4 个显示行块。目标左边 = ceil(4/2) = 2.

console.log("\n--- 示例 2 ---");
console.log("原始字符串:\n", testString2);

const totalLines2 = countTotalDisplayLineBlocks(testString2);
console.log("总显示行块数:", totalLines2); // 预期 4
const targetLeftLines2 = Math.ceil(totalLines2 / 2);
console.log("目标左边显示行块数 (ceil(4/2)):", targetLeftLines2); // 预期 2

const result2 = splitOriginalStringByDisplayLines(testString2, targetLeftLines2, totalLines2);

console.log("\n切分结果:");
console.log("--- Left Side (Target Lines: " + targetLeftLines2 + ") ---");
console.log(result2.left);
console.log("--- Right Side ---");
console.log(result2.right);
// 预期切分点在第 2 个显示行块之后。
// 块1: LineA\n (i=5)
// 块2: LineB\n (i=11)
// -- 匹配的块被跳过 -- <div v-click="1">\n\nContentC\n\n</div> (length ~35)
// 切分点应该在第 2 个块后面，即 LineB\n 后面，索引 12。

const testString3 = "Line1\nLine2<div v-click=\"1\">\nContent\n</div>Line3";
/*
分析 testString3 中符合 SPECIAL_BLOCK_CAPTURE_PATTERN 的块:
无匹配。因为 <div v-click="1"> 后面只有 \n，没有 \n+，并且 </div> 前面只有 \n，没有 \n+。
*/
// 移除匹配块后的概念字符串: 自身
// 连续换行块 (\n+) 在移除匹配块后的字符串中 (手动数):
// 1. Line1 后的 \n
// 2. Content 后的 \n (在保留的 <div...> 结构内)
// 总计 2 个显示行块。目标左边 = ceil(2/2) = 1.

console.log("\n--- 示例 3 ---");
console.log("原始字符串:\n", testString3);
const totalLines3 = countTotalDisplayLineBlocks(testString3);
console.log("总显示行块数:", totalLines3); // 预期 2
const targetLeftLines3 = Math.ceil(totalLines3 / 2);
console.log("目标左边显示行块数 (ceil(2/2)):", targetLeftLines3); // 预期 1

const result3 = splitOriginalStringByDisplayLines(testString3, targetLeftLines3, totalLines3);

console.log("\n切分结果:");
console.log("--- Left Side (Target Lines: " + targetLeftLines3 + ") ---");
console.log(result3.left);
console.log("--- Right Side ---");
console.log(result3.right);
// 预期切分点在第 1 个显示行块之后。
// 块1: Line1\n (i=5)
// 切分点应该在 Line1\n 后面，索引 6。

const testString4 = "abc\n\ndef\n\n";
/*
分析 testString4 中符合 SPECIAL_BLOCK_CAPTURE_PATTERN 的块:
无匹配。
*/
// 移除匹配块后的概念字符串: 自身
// 连续换行块 (\n+) 在移除匹配块后的字符串中 (手动数):
// 1. abc 后的 \n\n (一个块)
// 2. def 后的 \n\n (一个块)
// 总计 2 个显示行块。目标左边 = ceil(2/2) = 1.
console.log("\n--- 示例 4 ---");
console.log("原始字符串:\n", testString4);
const totalLines4 = countTotalDisplayLineBlocks(testString4);
console.log("总显示行块数:", totalLines4); // 预期 2
const targetLeftLines4 = Math.ceil(totalLines4 / 2);
console.log("目标左边显示行块数 (ceil(2/2)):", targetLeftLines4); // 预期 1

const result4 = splitOriginalStringByDisplayLines(testString4, targetLeftLines4, totalLines4);

console.log("\n切分结果:");
console.log("--- Left Side (Target Lines: " + targetLeftLines4 + ") ---");
console.log(result4.left);
console.log("--- Right Side ---");
console.log(result4.right);
// 预期切分点在第 1 个显示行块之后。
// 块1: abc\n\n (i=5)
// 切分点应该在 abc\n\n 后面，索引 6。

