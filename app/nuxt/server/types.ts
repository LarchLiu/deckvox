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

export interface GitHubResponse {
  sha: string
  url: string
  object?: {
    sha: string
    type: string
    url: string
  }
  tree?: Array<{
    path: string
    mode: string
    type: string
    sha: string
  }>
}

export interface GithubTree {
  path: string
  mode: '100644' | '100755' | '040000' | '160000' | '120000'
  type: 'blob' | 'tree' | 'commit'
  content?: string
  sha?: string
}

export interface GithubFiles {
  name: string
  path: string
  sha: string
  size: number
  url: string
  html_url: string
  git_url: string
  download_url: string
  type: string
}
