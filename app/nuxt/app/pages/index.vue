<script setup lang="ts">
definePageMeta({
  layout: false,
})

const contents = ref('')
const showSettingsInput = ref(false)
const feishuBotUrl = useLocalStorage('feishu-bot', '')

async function onSendClick() {
  if (contents.value.trim() === '' || !feishuBotUrl.value) {
    // Show a toast or alert to inform the user to fill in the required fields
    if (!contents.value.trim()) {
      // eslint-disable-next-line no-alert
      alert('Please enter a message.')
    }
    if (!feishuBotUrl.value) {
      // eslint-disable-next-line no-alert
      alert('Please click settings and input Feishu bot URL.')
    }
    return
  }
  try {
    const res = await $fetch('/api/initiate-task', {
      method: 'POST',
      body: {
        taskData: {
          contents: contents.value,
          botInfo: {
            feishuBot: {
              url: feishuBotUrl.value,
            },
          },
        },
      },
    })
    contents.value = ''
    // eslint-disable-next-line no-alert
    alert(`ID: ${res.contentId} ${res.message}`)
  }
  catch (error) {
    console.error('Error:', error)
  }
}

function toggleSettings() {
  showSettingsInput.value = !showSettingsInput.value
}
</script>

<template>
  <div class="bg-white flex h-screen dark:text-white dark:bg-black">
    <div class="border-r flex flex-col w-[218px]">
      <div class="p-4 flex gap-2 items-center">
        <div class="text-xl font-bold">
          Sl<span class="text-red">ai</span>de
        </div>
        <div class="flex gap-1.5 items-center">
          <div class="rounded-full bg-green-500 h-4 w-4" />
          <span class="text-sm">Personal</span>
          <span class="text-xs text-gray-700 px-1.5 py-0.5 rounded bg-gray-100">Free</span>
        </div>
      </div>

      <div class="p-4">
        <button class="px-4 py-2 text-center border rounded-md w-full">
          New Chat
        </button>
      </div>

      <nav class="flex-1">
        <div class="px-4 py-2">
          <div class="py-1.5 flex gap-2 items-center text-primary">
            <div class="i-carbon-time" />
            <span>Recents</span>
          </div>
          <div class="py-1.5 flex gap-2 items-center text-primary">
            <div class="i-carbon-thumbnail-2" />
            <span>Projects</span>
          </div>
          <div class="py-1.5 flex gap-2 items-center text-primary">
            <div class="i-carbon-events" />
            <span>Community</span>
          </div>
        </div>

        <div class="mt-2">
          <div class="px-4 py-2 flex items-center justify-between text-primary">
            <span>Favorite Projects</span>
            <div class="i-carbon-chevron-right" />
          </div>
          <div class="px-4 py-2 flex items-center justify-between text-primary">
            <span>Favorite Chats</span>
            <div class="i-carbon-chevron-right" />
          </div>
          <div class="px-4 py-2 flex items-center justify-between text-primary">
            <span>Recent</span>
            <div class="i-carbon-chevron-down" />
          </div>
          <div class="pl-4 pr-2">
            <div class="text-sm px-2 py-1.5 text-primary">
              Landing page design
            </div>
            <div class="text-sm px-2 py-1.5 text-primary">
              Image Partial Selection
            </div>
          </div>
        </div>
      </nav>
    </div>

    <div class="flex flex-1 flex-col">
      <header class="p-4 flex justify-end">
        <button class="text-sm px-3 py-1.5 border rounded-md">
          Feedback
        </button>
        <DarkToggle class="text-2xl ml-2 cursor-pointer" />
        <div class="ml-2 rounded-full bg-green-500 h-8 w-8" />
      </header>

      <main class="px-4 flex flex-1 flex-col items-center justify-center">
        <h1 class="text-4xl font-bold mb-8 text-primary">
          What can I help you ship?
        </h1>

        <div class="mb-6 max-w-[800px] w-full">
          <div class="border rounded-lg shadow-sm">
            <div class="p-3">
              <input v-model="contents" type="text" placeholder="Write something to build..." class="outline-0 bg-transparent w-full text-primary">
            </div>
            <div class="p-2 border-t flex items-center justify-between">
              <div class="flex items-center">
                <button class="text-sm px-2 py-1 rounded flex gap-1 items-center text-primary hover:bg-gray-100">
                  <span>Nothing selected</span>
                  <div class="i-carbon-chevron-down" />
                </button>
              </div>
              <div class="flex gap-2 items-center">
                <div v-if="showSettingsInput" class="w-[200px]">
                  <input v-model="feishuBotUrl" type="text" placeholder="Enter feishu bot url" class="bg-transparent w-full text-primary">
                </div>
                <button class="text-gray-500 p-1 cursor-pointer hover:text-gray-700" @click="toggleSettings">
                  <div :class="showSettingsInput ? 'i-carbon-save' : 'i-carbon-settings'" />
                </button>
                <button class="text-gray-500 p-1 hover:text-gray-700">
                  <div class="i-cil-paperclip" />
                </button>
                <button class="text-gray-500 p-1 cursor-pointer hover:text-gray-700" @click="onSendClick">
                  <div class="i-carbon-arrow-up" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="mb-16 flex flex-wrap gap-3 justify-center">
          <button class="text-sm px-3 py-2 border rounded-md flex gap-2 items-center">
            <div class="i-carbon-camera" />
            Clone a Screenshot
          </button>
          <button class="text-sm px-3 py-2 border rounded-md flex gap-2 items-center">
            <div class="i-carbon-import" />
            Import from Figma
          </button>
          <button class="text-sm px-3 py-2 border rounded-md flex gap-2 items-center">
            <div class="i-carbon-upload" />
            Upload a Project
          </button>
          <button class="text-sm px-3 py-2 border rounded-md flex gap-2 items-center">
            <div class="i-carbon-layout" />
            Landing Page
          </button>
          <button class="text-sm px-3 py-2 border rounded-md flex gap-2 items-center">
            <div class="i-carbon-form-input" />
            Sign Up Form
          </button>
        </div>

        <div class="max-w-[1000px] w-full">
          <div class="mb-2 flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold">
                From the Community
              </h2>
              <p class="text-sm text-primary">
                Explore what the community is building with Slaide.
              </p>
            </div>
            <button class="text-sm flex items-center text-primary">
              Browse All
              <div class="i-carbon-chevron-right" />
            </button>
          </div>

          <div class="gap-4 grid grid-cols-3">
            <div class="border rounded-lg overflow-hidden">
              <div class="bg-indigo-900 h-48 relative">
                <div class="text-white p-4 text-center flex flex-col items-center inset-0 justify-center absolute">
                  <h3 class="text-xl font-bold">
                    Join Our Product Launch Waitlist
                  </h3>
                  <p class="text-sm mt-2">
                    Be part of something truly extraordinary. Join thousands of others already gaining early access to
                    our revolutionary new product.
                  </p>
                </div>
              </div>
              <div class="p-3 flex items-center">
                <div class="rounded-full bg-gray-300 h-8 w-8" />
                <div class="ml-2">
                  <div class="text-sm font-medium">
                    Product Launch Waitlist
                  </div>
                  <div class="text-xs text-gray-500">
                    4.6K Forks
                  </div>
                </div>
              </div>
            </div>

            <div class="border rounded-lg overflow-hidden">
              <div class="bg-white h-48 relative dark:bg-black">
                <div class="p-4 flex flex-col items-center inset-0 justify-center absolute">
                  <div class="max-w-[240px] w-full">
                    <div class="mb-2 border rounded-md">
                      <div class="p-2 border-b">
                        <div class="text-xs text-gray-500">
                          Search Commands
                        </div>
                        <div class="mt-1 border rounded-md flex items-center">
                          <input type="text" placeholder="What's up?" class="outline-none text-xs p-1 flex-1">
                          <div class="i-carbon-search" />
                        </div>
                      </div>
                      <div class="p-1">
                        <div class="text-xs p-1">
                          Book tickets
                        </div>
                        <div class="text-xs p-1">
                          Summarize
                        </div>
                        <div class="text-xs p-1">
                          Screen Studio
                        </div>
                        <div class="text-xs p-1">
                          Talk to Jarvis
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="p-3 flex items-center">
                <div class="rounded-full bg-gray-300 h-8 w-8" />
                <div class="ml-2">
                  <div class="text-sm font-medium">
                    Action Search Bar
                  </div>
                  <div class="text-xs text-gray-500">
                    5.3K Forks
                  </div>
                </div>
              </div>
            </div>

            <div class="border rounded-lg overflow-hidden">
              <div class="bg-gray-100 h-48 relative" />
              <div class="p-3 flex items-center">
                <div class="rounded-full bg-gray-300 h-8 w-8" />
                <div class="ml-2">
                  <div class="text-sm font-medium">
                    Supabase Starter
                  </div>
                  <div class="text-xs text-gray-500">
                    6.6K Forks
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
