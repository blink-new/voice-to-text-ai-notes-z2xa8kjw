import { createClient } from '@blinkdotnew/sdk'

export const blink = createClient({
  projectId: 'voice-to-text-ai-notes-z2xa8kjw',
  authRequired: false,
  baseUrl: 'https://blink.new'
})