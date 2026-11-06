import { expect, mock, test } from 'claude-code/testing'

const PROMPT = 'What is wrong here? [Image #2]'

// A row of `columns` orange cells.
function wideCells(columns: number) {
  const words = Array.from({ length: columns }, () => [0x2580, 0xff8800, 0x01000000]).flat()
  return { columns, rows: 1, strips: [{ rows: 1, cells: new Uint8Array(Uint32Array.from(words).buffer).toBase64() }] }
}

const CELLS = wideCells(1)
const SHOT = { label: 'Image #2', width: 800, height: 400, thumb: CELLS, source: { number: 2 } }
// What scripts/glance.mjs answers for one image.
const PAINTED = { width: 800, height: 400, ...CELLS, sourceIndex: 0 }

// The shape tags the module's atoms are kept under.
const SHAPES: Record<string, string> = { submissions: 'submissions-5', draft: 'draft-3', viewing: 'viewing-4' }

const BAND = {
  plugin: 'glance',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 19 }, view: {} },
} as const

function message(text: string) {
  return {
    plugin: 'glance',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'message-1',
    props: { text, origin: { kind: 'composer' }, isExpanded: true },
  } as const
}

// Stands for the engine beneath the plugin: its own drawing of a row, and
// the state glance left behind.
function engine(on: any, stored: Record<string, unknown>) {
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text ?? 'engine'}</Text>
  })
  on('state.get', (_: unknown, e: { key: string }) => {
    if (!(e.key in stored)) return { value: { value: undefined, version: 0 } }
    const value = e.key in SHAPES ? { shape: SHAPES[e.key], value: stored[e.key] } : stored[e.key]
    return { value: { value, version: 1 } }
  })
}

// Stands for scripts/glance.mjs: records each command and its input, and
// answers PAINTED for every image asked to be painted.
function fakeScript(on: any) {
  const asked: { sessionId: string; requests?: { sources: unknown[]; box: unknown }[]; number?: number }[] = []
  const commands: string[] = []
  on('process.run', (_: unknown, e: { argv: readonly string[]; init?: { stdin?: string } }) => {
    const input = JSON.parse(e.init?.stdin ?? '{}')
    asked.push(input)
    commands.push(e.argv[2] ?? '')
    const answer = input.requests ? input.requests.map(() => PAINTED) : { opened: true }
    return { value: { exitCode: 0, stdout: JSON.stringify(answer), stderr: '' } }
  })
  on('session.id', () => ({ value: 'session-1' }))
  return Object.assign(asked, { commands })
}

test('a message without images is drawn as the engine draws it', async ($, on) => {
  engine(on, { submissions: [] })

  const ui = await $.ui.mount(message('Hello'))

  expect((await ui.find({ type: 'Text', text: /Hello/ }))?.text).toBe('Hello')
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('a message sent with an image shows it in a tile with a Preview button', async ($, on) => {
  engine(on, { submissions: [{ prompt: PROMPT, shots: [SHOT] }] })

  const ui = await $.ui.mount(message(PROMPT))

  expect((await ui.find({ type: 'Text', text: /What is wrong/ }))?.text).toBe(PROMPT)
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'open-0' }))?.text).toBe('Preview')
  await ui.unmount()
})

test('pressing Preview opens the full view pane', async ($, on) => {
  engine(on, { submissions: [{ prompt: PROMPT, shots: [SHOT] }] })
  const opened: string[] = []
  on('ui.open', (_: unknown, e: { id: string }) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  const clock = mock.clock(on)

  const ui = await $.ui.mount(message(PROMPT))
  await ui.press({ key: 'open-0' })
  await clock.settle()

  expect(opened).toEqual(['glance-view'])
  await ui.unmount()
})

test('the full view paints the image again to fill the pane', async ($, on) => {
  engine(on, { viewing: SHOT })
  const asked = fakeScript(on)

  const ui = await $.ui.mount({
    plugin: 'glance',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'glance-view',
    props: {
      title: 'Image #2',
      isFocused: true,
      bodyColumns: 60,
      placement: 'inline',
      scroll: { offset: 0, bodyRows: 21 },
      view: {},
    },
  })

  expect(asked).toEqual([{ sessionId: 'session-1', requests: [{ sources: [{ number: 2 }], box: { columns: 60, rows: 20 } }] }])
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /Esc closes/ }))?.text).toBe('800×400 · Esc closes')
  await ui.unmount()
})

test('while a prompt is written, its pasted images show above it', async ($, on) => {
  engine(on, { draft: [{ number: 2, shot: SHOT }] })

  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Button', key: 'open-0' })).toBeDefined()
  await ui.unmount()
})

test('a paste that can not be shown keeps its tile, saying so', async ($, on) => {
  engine(on, { draft: [{ number: 4, shot: null }] })

  const ui = await $.ui.mount(BAND)

  expect((await ui.find({ type: 'Text', text: /no preview/ }))?.text).toBe('no preview')
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('tiles that do not fit across are counted, not squeezed', async ($, on) => {
  const draft = [1, 2, 3].map((number) => ({ number, shot: { ...SHOT, label: `Image #${number}` } }))
  engine(on, { draft })

  // Tiles are 26 cells wide with a gap of 1: two fit in 60.
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 60 } })

  expect(await ui.findAll({ type: 'Button' })).toHaveLength(2)
  expect((await ui.find({ type: 'Text', text: /more/ }))?.text).toBe('+1 more')
  await ui.unmount()
})

test('a survey keeps the band', async ($, on) => {
  engine(on, { draft: [{ number: 2, shot: SHOT }] })

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true } })

  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('pasting shows the image above the prompt at once, and deleting its placeholder removes it', async ($, on) => {
  const clock = mock.clock(on)
  const asked = fakeScript(on)
  let box = ''
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  box = 'look at [Image #3]'
  await clock.advance(250)
  box = 'look at [Image #3] please'
  await clock.advance(250)

  let ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Button', key: 'open-0' })).toBeDefined()
  await ui.unmount()
  const paintedForDraft = asked.filter((input) => JSON.stringify(input.requests).includes('"number":3'))
  expect(paintedForDraft).toHaveLength(1)

  box = 'look at please'
  await clock.advance(250)

  ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

const PANE = {
  plugin: 'glance',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'glance-view',
  props: { title: 'Image #2', isFocused: true, bodyColumns: 60, placement: 'inline', scroll: { offset: 0, bodyRows: 21 }, view: {} },
} as const

test('the full view offers the original, opened by the system image viewer', async ($, on) => {
  engine(on, { viewing: SHOT })
  const asked = fakeScript(on)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'open-original' })

  expect(asked.commands).toEqual(['paint', 'open'])
  expect(asked.at(-1)).toEqual({ sessionId: 'session-1', number: 2 })
  await ui.unmount()
})

test('an image known only from the chat has no original to open', async ($, on) => {
  engine(on, { viewing: { ...SHOT, source: { prompt: 'earlier', index: 0 } } })
  fakeScript(on)
  on('session.messages', () => ({ value: [] }))

  const ui = await $.ui.mount(PANE)

  expect(await ui.find({ type: 'Button', key: 'open-original' })).toBeUndefined()
  await ui.unmount()
})
