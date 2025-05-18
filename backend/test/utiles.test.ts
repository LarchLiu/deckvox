import { countTotalDisplayLineBlocks, splitOriginalStringByDisplayLines } from '../src/utiles';
import { expect, test } from 'vitest';

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
const testString2 = "LineA\nLineB\n<div v-click=\"1\">\n\nContentC\n\n</div>LineD\n\nLineE<div>RegularF</div>LineG";
const testString3 = "Line1\nLine2<div v-click=\"1\">\nContent\n</div>Line3";
const testString4 = "abc\n\ndef\n\n";

test('countTotalDisplayLineBlocks counts newline blocks correctly', () => {

  expect(countTotalDisplayLineBlocks(testString1)).toBe(16);

  expect(countTotalDisplayLineBlocks(testString2)).toBe(4);

  expect(countTotalDisplayLineBlocks(testString3)).toBe(3);

  expect(countTotalDisplayLineBlocks(testString4)).toBe(2);
});

test('splitOriginalStringByDisplayLines splits string correctly', () => {
  const totalLines1 = 16;
  const targetLeftLines1 = 8;
  const result1 = splitOriginalStringByDisplayLines(testString1, targetLeftLines1, totalLines1);
  expect(result1.left.length + result1.right.length).toBe(testString1.length);
});
