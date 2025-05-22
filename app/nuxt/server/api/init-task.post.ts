import type { RequestData } from '~~/types'
import TurndownService from 'turndown'
import { sha1 } from '../utiles'

const turndownService = new TurndownService()

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig()
  const body = await readBody<RequestData>(event)
  const { elementData, botInfo, contents, sha1: contentsSha1 } = body.taskData

  try {
    if (body && !botInfo) {
      throw createError({
        status: 400,
        statusMessage: 'Bad Request',
        message: 'Missing bot info',
      })
    }

    let innerHTML_UniqueID = contentsSha1
    let md = ''
    if (elementData && elementData.innerHTML) {
      if (!innerHTML_UniqueID) {
        innerHTML_UniqueID = await sha1(elementData.innerHTML)
      }

      md = turndownService.turndown(elementData.innerHTML)
    }
    else if (contents) {
      if (!innerHTML_UniqueID) {
        innerHTML_UniqueID = await sha1(contents)
      }

      md = turndownService.turndown(contents)
    }
    else {
      throw createError({
        status: 400,
        statusMessage: 'Bad Request',
        message: 'Missing required fields',
      })
    }

    // ====dify====
    const stream = await $fetch<ReadableStream>(runtimeConfig.difyApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${runtimeConfig.difyApiKey || ''}`,
      },
      responseType: 'stream',
      body: {
        inputs: {
          input: md,
        },
        response_mode: 'streaming',
        user: 'test',
      },
    })
    return stream
  }
  catch (error: any) {
    console.error('API: 处理 /api/initiate-task 请求时出错:', error)
    throw createError({
      status: 500,
      statusMessage: 'Internal Server Error',
      message: error.message || '服务器内部错误 (Internal Server Error)',
    })
  }
})
