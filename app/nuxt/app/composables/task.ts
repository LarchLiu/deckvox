import type { BotInfo } from '~~/types'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { sha1 } from '~/utiles'

export const useTaskStore = defineStore('task', () => {
  const taskType = ref('slides')
  const contents = ref('')
  const botInfo = ref<BotInfo>({ tgBot: { token: '', chatId: '' }, feishuBot: { url: '' } })

  const contentsSha1 = computedAsync(
    async () => {
      const sha = await sha1(contents.value)
      return sha
    },
    '',
  )

  function setContents(text: string) {
    contents.value = text
  }

  function clearData() {
    contents.value = ''
    taskType.value = 'slides'
    botInfo.value = { tgBot: { token: '', chatId: '' }, feishuBot: { url: '' } }
  }

  return {
    contents,
    taskType,
    botInfo,
    contentsSha1,
    setContents,
    clearData,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useTaskStore, import.meta.hot))
