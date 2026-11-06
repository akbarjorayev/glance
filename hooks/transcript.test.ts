import { expect, test } from 'claude-code/testing'
import { imageNumbers, labelsFor, latestFor, mergeSubmissions, promptKey, sentWithImages } from './transcript'

const IMAGE = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBOR' } }
const REMINDER = { type: 'text', text: '<system-reminder>\nToday is Friday.\n</system-reminder>' }
const SOURCE_NOTE = { type: 'text', text: '[Image: source: C:\\Temp\\images\\2.png]' }

test('finds the prompts sent with images, as Claude Code stores them', () => {
  const messages = [
    { role: 'user', content: [REMINDER, IMAGE, { type: 'text', text: '[Image #1] What is this?\n' }, SOURCE_NOTE] },
    { role: 'assistant', content: [{ type: 'text', text: 'A cat.' }] },
    { role: 'user', content: [{ type: 'text', text: 'Thanks' }] },
  ]

  expect(sentWithImages(messages)).toEqual([
    { prompt: '[Image #1] What is this?', images: [{ mediaType: 'image/png', base64: 'iVBOR' }] },
  ])
})

test('images Claude reads with a tool are not the user\'s pastes', () => {
  const toolResult = { type: 'tool_result', content: [IMAGE] }
  const messages = [{ role: 'user', content: [toolResult] }, { role: 'assistant', content: [IMAGE] }]

  expect(sentWithImages(messages)).toEqual([])
})

test('an image held other than as inline bytes is skipped', () => {
  const linked = { type: 'image', source: { type: 'url', url: 'https://example.com/a.png' } }
  const messages = [{ role: 'user', content: [linked, { type: 'text', text: 'look' }] }]

  expect(sentWithImages(messages)).toEqual([])
})

test('a prompt is found again however its whitespace was kept', () => {
  expect(promptKey('  [Image #1]\n  What is   this?\n')).toBe('[Image #1] What is this?')
  const list = [{ prompt: promptKey('look here'), shots: [] }]
  expect(latestFor(list, 'look  here\n')).toBe(list[0])
})

test('labels follow the image numbers in the prompt', () => {
  expect(labelsFor('compare [Image #3] with [Image #4]', 2)).toEqual(['Image #3', 'Image #4'])
  expect(labelsFor('look', 2)).toEqual(['Image 1', 'Image 2'])
})

test('the same prompt sent twice shows the latest images', () => {
  const list = [
    { prompt: 'again', shots: [] },
    { prompt: 'again', shots: [] },
  ]
  expect(latestFor(list, 'again')).toBe(list[1])
  expect(latestFor(list, 'other')).toBeUndefined()
})

test('rebuilt submissions keep ones sent meanwhile, newest last, within the limit', () => {
  const rebuilt = [{ prompt: 'a', shots: [] }, { prompt: 'b', shots: [] }]
  const current = [{ prompt: 'b', shots: [] }, { prompt: 'c', shots: [] }]

  expect(mergeSubmissions(rebuilt, current, 2).map((s) => s.prompt)).toEqual(['b', 'c'])
  expect(mergeSubmissions(rebuilt, current, 9).map((s) => s.prompt)).toEqual(['a', 'b', 'c'])
})

test('the images in a draft are read from their placeholders, in order, once each', () => {
  expect(imageNumbers('see [Image #2] and [Image #10], again [Image #2]')).toEqual([2, 10])
  expect(imageNumbers('no images here, not even [Image #x]')).toEqual([])
})
