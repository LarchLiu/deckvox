export interface ResponseData {
  type: string
  think: string[]
  markdown: string
}

export type ResponseSubtitles = Record<string, string[]>

export interface ResponseDify {
  page: number
  slide: string
  subtitles: ResponseSubtitles[]
}

export type Subtitles = Record<string, Record<string, string[]>>
export interface Slides {
  page: number
  slide: string
  subtitles: Subtitles
}
