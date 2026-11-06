import type { Submission } from '../types'

// Pure logic for finding pasted images in a conversation and matching them to
// the messages they were sent with. No `$` here, so all of it is unit-tested.

export type PastedImage = { mediaType: string; base64: string }
export type SentWithImages = { prompt: string; images: PastedImage[] }

// The parts of a Messages API message this file reads.
type Block = { type: string; [field: string]: unknown }
type Message = { role: string; content: readonly Block[] }

const IMAGE_LABEL = /\[Image #(\d+)\]/g
// Text blocks Claude Code adds to a user message beside what was typed.
const ADDED_TEXT = [/^<system-reminder>/, /^\[Image: source:/]

// The prompts the person sent with images, oldest first, as Claude Code
// stores them: the image blocks and the typed text side by side in one user
// message. Images inside tool results are Claude's reads, not pastes.
export function sentWithImages(messages: readonly Message[]): SentWithImages[] {
  return messages.flatMap((message) => {
    if (message.role !== 'user') return []
    const images = message.content.flatMap(inlineImage)
    if (images.length === 0) return []
    return [{ prompt: promptKey(typedText(message.content)), images }]
  })
}

// One spelling per prompt: the transcript, the submit event and the drawn row
// each keep its whitespace a little differently.
export function promptKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function latestFor(list: readonly Submission[], prompt: string): Submission | undefined {
  const key = promptKey(prompt)
  return list.findLast((submission) => submission.prompt === key)
}

// The numbers of the images a draft holds, as its "[Image #n]" placeholders
// name them: in order of first mention, each once.
export function imageNumbers(draft: string): number[] {
  return [...new Set([...draft.matchAll(IMAGE_LABEL)].map((match) => Number(match[1])))]
}

// "[Image #3]" in the prompt names the third image pasted this session.
export function labelsFor(prompt: string, count: number): string[] {
  const named = [...prompt.matchAll(IMAGE_LABEL)].map((match) => `Image #${match[1]}`)
  return Array.from({ length: count }, (_, index) => named[index] ?? `Image ${index + 1}`)
}

// What the transcript holds, plus anything sent while it was being read,
// newest last and at most `limit`.
export function mergeSubmissions(
  rebuilt: readonly Submission[],
  current: readonly Submission[],
  limit: number,
): Submission[] {
  const rebuiltPrompts = new Set(rebuilt.map((submission) => submission.prompt))
  const sentMeanwhile = current.filter((submission) => !rebuiltPrompts.has(submission.prompt))
  return [...rebuilt, ...sentMeanwhile].slice(-limit)
}

function inlineImage(block: Block): PastedImage[] {
  if (block.type !== 'image') return []
  const source = block.source as { type?: string; media_type?: string; data?: string } | undefined
  if (source?.type !== 'base64' || !source.media_type || !source.data) return []
  return [{ mediaType: source.media_type, base64: source.data }]
}

function typedText(content: readonly Block[]): string {
  return content
    .flatMap((block) => (block.type === 'text' && typeof block.text === 'string' ? [block.text] : []))
    .filter((text) => !ADDED_TEXT.some((pattern) => pattern.test(text)))
    .join('\n')
}
