import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { Cells, DraftImage, Shot, ShotSource, Submission } from '../types'
import { imageNumbers, labelsFor, latestFor, mergeSubmissions, promptKey, sentWithImages } from './transcript'
import type { SentWithImages } from './transcript'

// Shows pasted images as previews: above the prompt while it is written,
// under the message once sent, and full size in a pane when a tile is pressed.
// Glance saves nothing. Claude Code keeps every paste as a file, and every
// sent image in the chat; glance paints from those, in memory. Decoding
// happens in scripts/glance.mjs, because this module has no Node.
// The engine's `$` may only be called, never stored or passed on, so the
// classes below receive plain functions instead (see `compose`).

const VIEW_PANE = 'glance-view'
const KEPT_SUBMISSIONS = 30
// Pasting an image raises no edit until the next key, so the draft is read
// on a timer: the preview shows as soon as the image lands.
const DRAFT_CHECK_MS = 200
// Every tile is this size whatever the image's shape: the image is fitted
// inside it and centered.
const THUMB_BOX = Object.freeze({ columns: 24, rows: 6 })
const TILE_BORDER = 2
const TILE_GAP = 1
const NO_PREVIEW = 'no preview'
const PREVIEW_LABEL = 'Preview'
const OPEN_ORIGINAL_LABEL = 'Open original'
const PANE_HINT_ROWS = 1
const FALLBACK_PANE_ROWS = 24
const NODE_MISSING = 'Glance needs Node.js to show image previews. You can get it at nodejs.org.'

// Change a shape tag when what that atom holds changes: it declines what an
// earlier version stored, which outlives a reload.
const submissions = atom({ plugin: 'glance', key: 'submissions' } as const, [], { shape: 'submissions-5' })
const draft = atom({ plugin: 'glance', key: 'draft' } as const, [], { shape: 'draft-3' })
const viewing = atom({ plugin: 'glance', key: 'viewing' } as const, null, { shape: 'viewing-4' })

type Box = { columns: number; rows: number }
type Source = { number: number } | { base64: string }
type Painted = Cells & { width: number; height: number; sourceIndex: number }
type PaintRequest = { sources: Source[]; box: Box }
// Raster is drawn by the terminal alone.
type TerminalElements = Elements['terminal']
type RunProcess = (argv: readonly string[], stdin?: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>
type Notify = (text: string) => void
type ReadSent = () => Promise<SentWithImages[]>
type Open = (shot: Shot) => void

// Runs scripts/glance.mjs, which reads and paints images. A preview is never
// worth interrupting anyone, so failures go to the debug log; only a missing
// Node.js is told, once, because only the person can fix it.
class GlanceCli {
  private readonly runProcess: RunProcess
  private readonly scriptPath: string
  private readonly log: Notify
  private readonly onNodeMissing: () => void

  constructor({ runProcess, scriptPath, log, onNodeMissing }: {
    runProcess: RunProcess
    scriptPath: string
    log: Notify
    onNodeMissing: () => void
  }) {
    this.runProcess = runProcess
    this.scriptPath = scriptPath
    this.log = log
    this.onNodeMissing = onNodeMissing
  }

  // One answer per request: the painted image, or null when it can't be read.
  async paint(sessionId: string, requests: readonly PaintRequest[]): Promise<(Painted | null)[]> {
    if (requests.length === 0) return []
    return (await this.run('paint', { sessionId, requests })) ?? requests.map(() => null)
  }

  // Opens Claude Code's file of "[Image #n]" in the system's image viewer.
  async open(sessionId: string, number: number): Promise<void> {
    await this.run('open', { sessionId, number })
  }

  private async run(command: string, input: object) {
    let outcome
    try {
      outcome = await this.runProcess(['node', this.scriptPath, command], JSON.stringify(input))
    } catch (error) {
      this.log(`glance: node could not start (${error})`)
      this.onNodeMissing()
      return undefined
    }
    if (outcome.exitCode === 0) return JSON.parse(outcome.stdout)
    this.log(`glance ${command}: ${outcome.stderr.trim()}`)
    return undefined
  }
}

// Turns images into shots: thumbnails, and full views on demand.
class ShotPainter {
  private readonly cli: GlanceCli
  private readonly sessionId: () => Promise<string>
  private readonly readSent: ReadSent

  constructor({ cli, sessionId, readSent }: { cli: GlanceCli; sessionId: () => Promise<string>; readSent: ReadSent }) {
    this.cli = cli
    this.sessionId = sessionId
    this.readSent = readSent
  }

  // Thumbnails of the session's pasted images "[Image #n]", by number.
  async ofNumbers(numbers: readonly number[]): Promise<(Shot | null)[]> {
    const painted = await this.cli.paint(
      await this.sessionId(),
      numbers.map((number) => ({ sources: [{ number }], box: THUMB_BOX })),
    )
    return painted.map((image, index) => {
      const number = numbers[index] ?? 0
      return image && shotOf(image, `Image #${number}`, { number })
    })
  }

  // The thumbnails of a sent message: from Claude Code's files where they
  // still are, else from the image data the chat holds.
  async ofSent({ prompt, images }: SentWithImages): Promise<Submission | undefined> {
    const numbers = imageNumbers(prompt)
    const labels = labelsFor(prompt, images.length)
    const requests = images.map((image, index) => {
      const number = numbers[index]
      const fromChat = { base64: image.base64 }
      return { sources: number === undefined ? [fromChat] : [{ number }, fromChat], box: THUMB_BOX }
    })
    const painted = await this.cli.paint(await this.sessionId(), requests)
    const shots = painted.flatMap((image, index) => {
      if (!image) return []
      const number = numbers[index]
      const fromFile = number !== undefined && image.sourceIndex === 0
      const source: ShotSource = fromFile ? { number } : { prompt: promptKey(prompt), index }
      return [shotOf(image, labels[index] ?? '', source)]
    })
    return shots.length > 0 ? { prompt: promptKey(prompt), shots } : undefined
  }

  // A shot painted again to fill `box`.
  async view(shot: Shot, box: Box): Promise<Cells | undefined> {
    const source = await this.sourceOf(shot.source)
    if (!source) return undefined
    const [painted] = await this.cli.paint(await this.sessionId(), [{ sources: [source], box }])
    return painted ?? undefined
  }

  private async sourceOf(source: ShotSource): Promise<Source | undefined> {
    if ('number' in source) return { number: source.number }
    const sent = (await this.readSent()).findLast((message) => message.prompt === source.prompt)
    const image = sent?.images[source.index]
    return image && { base64: image.base64 }
  }
}

function shotOf(image: Painted, label: string, source: ShotSource): Shot {
  const { width, height, columns, rows, strips } = image
  return { label, width, height, thumb: { columns, rows, strips }, source }
}

// Keeps the draft's previews in step with its "[Image #n]" placeholders: a
// new one is painted from Claude Code's file of that paste, a deleted one
// drops its preview. A paste whose file isn't written yet is tried again on
// the next check.
class DraftWatcher {
  private readonly painter: ShotPainter
  private readonly readDraft: () => Promise<readonly DraftImage[]>
  private readonly writeDraft: (list: DraftImage[]) => Promise<void>

  constructor({ painter, readDraft, writeDraft }: {
    painter: ShotPainter
    readDraft: () => Promise<readonly DraftImage[]>
    writeDraft: (list: DraftImage[]) => Promise<void>
  }) {
    this.painter = painter
    this.readDraft = readDraft
    this.writeDraft = writeDraft
  }

  async follow(text: string): Promise<void> {
    const numbers = imageNumbers(text)
    const key = numbers.join(',')
    if (key === draftKey) return
    const known = await this.readDraft()
    const shown = (number: number) => known.find((image) => image.number === number && image.shot)
    const missing = numbers.filter((number) => !shown(number))
    const painted = await this.painter.ofNumbers(missing)
    const list = numbers.map((number) => shown(number) ?? { number, shot: painted[missing.indexOf(number)] ?? null })
    await this.writeDraft(list)
    draftKey = list.every((image) => image.shot) ? key : undefined
  }
}

// Draws images: thumbnails as tiles of one size, each with a Preview button
// that opens the full view, and the full view itself.
class PictureDrawer {
  private readonly elements: TerminalElements

  constructor(elements: TerminalElements) {
    this.elements = elements
  }

  // As many tiles as fit across `width`; the rest are counted.
  row(shots: readonly (Shot | null)[], width: number, open: Open) {
    const { Box, Text } = this.elements
    const tileWidth = THUMB_BOX.columns + TILE_BORDER
    const fitting = Math.max(1, Math.floor((width + TILE_GAP) / (tileWidth + TILE_GAP)))
    const hidden = shots.length - Math.min(fitting, shots.length)
    return (
      <Box flexDirection="row" gap={TILE_GAP} alignItems="center">
        {shots.slice(0, fitting).map((shot, index) => this.tile(shot, index, open))}
        {hidden > 0 && <Text dimColor>+{hidden} more</Text>}
      </Box>
    )
  }

  // The image painted as `Raster`s, one per strip.
  picture(cells: Cells, key: string) {
    const { Box, Raster } = this.elements
    return (
      <Box flexDirection="column">
        {cells.strips.map((strip, index) => (
          <Raster key={`${key}-${index}`} columns={cells.columns} rows={strip.rows} cells={strip.cells} />
        ))}
      </Box>
    )
  }

  // A frame of one size whatever the image's shape: the image is centered in
  // a fixed area, with the Preview button under it.
  private tile(shot: Shot | null, index: number, open: Open) {
    const { Box, Button, Text } = this.elements
    return (
      <Box borderStyle="round" borderDimColor flexDirection="column" alignItems="center" width={THUMB_BOX.columns + TILE_BORDER}>
        <Box width={THUMB_BOX.columns} height={THUMB_BOX.rows} alignItems="center" justifyContent="center">
          {shot ? this.picture(shot.thumb, `thumb-${index}`) : <Text dimColor>{NO_PREVIEW}</Text>}
        </Box>
        {shot
          ? <Button key={`open-${index}`} plain dimColor label={PREVIEW_LABEL} onPress={() => open(shot)} />
          : <Text> </Text>}
      </Box>
    )
  }
}

// The draft's numbers when last painted in full, so an unchanged draft costs
// nothing; undefined while a paste is still to be read.
let draftKey: string | undefined
let isCheckingDraft = false
// Full views are painted again only when the pane's size changes.
const viewCache = new Map<string, Promise<Cells | undefined>>()
let hasToldNodeMissing = false

function compose($: EngineInterface) {
  const cli = new GlanceCli({
    runProcess: (argv, stdin) => $.process.run(argv, { stdin }),
    scriptPath: `${$.plugin.root}/scripts/glance.mjs`,
    log: (text) => $.ui.log(text, { to: 'debug' }),
    onNodeMissing: () => {
      if (hasToldNodeMissing) return
      hasToldNodeMissing = true
      $.ui.toast(NODE_MISSING)
    },
  })
  const painter = new ShotPainter({
    cli,
    sessionId: () => $.session.id(),
    readSent: async () => sentWithImages(await $.session.messages({ as: 'api' })),
  })
  return {
    cli,
    painter,
    drafts: new DraftWatcher({
      painter,
      readDraft: () => read($, draft),
      writeDraft: async (list) => {
        await update($, draft, () => list)
      },
    }),
    open: (shot: Shot) => {
      void (async () => {
        await update($, viewing, () => shot)
        await $.ui.open({ id: VIEW_PANE, title: shot.label, focus: true, closeOnEscape: true })
      })()
    },
  }
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    $.clock.every(DRAFT_CHECK_MS, () => {
      if (isCheckingDraft) return
      isCheckingDraft = true
      void (async () => {
        try {
          await compose($).drafts.follow((await $.prompt.read()).text)
        } finally {
          isCheckingDraft = false
        }
      })()
    })

    // Reading a long chat's images takes a few seconds the first time, so it
    // runs after the session is ready instead of holding up the first prompt.
    $.clock.after(0, () => {
      void (async () => {
        const { painter } = compose($)
        const sent = sentWithImages(await $.session.messages({ as: 'api' })).slice(-KEPT_SUBMISSIONS)
        const rebuilt: Submission[] = []
        for (const message of sent) {
          const submission = await painter.ofSent(message)
          if (submission) rebuilt.push(submission)
        }
        await update($, submissions, (current) => mergeSubmissions(rebuilt, current, KEPT_SUBMISSIONS))
      })()
    })
    return started
  })

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    const numbers = imageNumbers(e.text)
    if (numbers.length === 0) return result

    // Sent: the previews move from above the prompt to under the message.
    const known = await read($, draft)
    await update($, draft, () => [])
    draftKey = undefined
    const missing = numbers.filter((number) => !known.some((image) => image.number === number && image.shot))
    const painted = await compose($).painter.ofNumbers(missing)
    const shots = numbers.flatMap((number) => {
      const shot = known.find((image) => image.number === number)?.shot ?? painted[missing.indexOf(number)]
      return shot ? [shot] : []
    })
    if (shots.length > 0) {
      const submission = { prompt: promptKey(e.text), shots }
      await update($, submissions, (list) => [...list, submission].slice(-KEPT_SUBMISSIONS))
    }
    return result
  })
    // A preview must never hold up the prompt: on any failure it goes on as sent.
    .catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const images = await read($, draft)
    if (e.surface !== 'terminal' || e.props.hasSurvey || images.length === 0) return next(e)

    const drawer = new PictureDrawer($.ui.resolve(e) as TerminalElements)
    return drawer.row(
      images.map((image) => image.shot),
      e.props.bodyColumns,
      compose($).open,
    )
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    const submission = latestFor(await read($, submissions), e.props.text)
    if (!submission) return row

    const elements = $.ui.resolve(e) as TerminalElements
    const { Box } = elements
    const width = e.viewport?.columns ?? THUMB_BOX.columns + TILE_BORDER

    return (
      <Box flexDirection="column">
        {row}
        {new PictureDrawer(elements).row(submission.shots, width, compose($).open)}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: VIEW_PANE }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    const shot = await read($, viewing)
    if (!shot) return <Text dimColor>No image open.</Text>
    if (e.surface !== 'terminal') return <Text dimColor>{shot.label} can be seen in the terminal.</Text>
    const elements = $.ui.resolve(e) as TerminalElements
    const { Box, Button } = elements

    const room = {
      columns: e.props.bodyColumns,
      rows: (e.props.scroll?.bodyRows ?? e.viewport?.rows ?? FALLBACK_PANE_ROWS) - PANE_HINT_ROWS,
    }
    const { cli, painter } = compose($)
    const key = `${JSON.stringify(shot.source)}|${room.columns}x${room.rows}`
    if (!viewCache.has(key)) viewCache.set(key, painter.view(shot, room))
    const cells = await viewCache.get(key)
    // Full quality is the image viewer's: a terminal shows block characters.
    // Only an image Claude Code keeps as a file can be opened, since glance
    // writes none of its own.
    const source = shot.source
    const openOriginal = 'number' in source
      ? async () => cli.open(await $.session.id(), source.number)
      : undefined

    return (
      <Box flexDirection="column">
        {cells ? new PictureDrawer(elements).picture(cells, 'view') : <Text dimColor>{NO_PREVIEW}</Text>}
        <Box flexDirection="row" gap={2}>
          <Text dimColor>
            {shot.width}×{shot.height} · Esc closes
          </Text>
          {openOriginal && <Button key="open-original" plain label={OPEN_ORIGINAL_LABEL} onPress={() => void openOriginal()} />}
        </Box>
      </Box>
    )
  })
}
