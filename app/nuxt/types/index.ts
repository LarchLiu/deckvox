export interface TgBotInfo {
  token: string
  chatId: string
}

export interface FeishuBotInfo {
  url: string
}

export interface ElementData {
  url?: string
  tagName?: string
  id?: string | null
  classList?: string[]
  attributes?: { [key: string]: string }
  textContent?: string
  innerHTML?: string
  outerHTML?: string
}

export interface RequestData {
  taskData: TaskData
}

export interface BotInfo {
  tgBot?: TgBotInfo
  feishuBot?: FeishuBotInfo
}

export interface TaskData {
  contents?: string
  sha1?: string
  botInfo: BotInfo
  elementData?: ElementData
}
