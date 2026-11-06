// Colored terminal cells for `Raster`s, sized to fit a box: one Raster per
// strip, stacked, since a Raster paints a limited number of color pairs.
export type Cells = { columns: number; rows: number; strips: { rows: number; cells: string }[] }

// Where an image can be read again: Claude Code's own file for "[Image #n]",
// or the n-th image of a message in the chat, when that file is gone.
export type ShotSource = { number: number } | { prompt: string; index: number }

// One pasted image, ready to draw, and where to read it again.
export type Shot = {
  label: string
  width: number
  height: number
  thumb: Cells
  source: ShotSource
}

// The images sent with one prompt, found again by the prompt's text.
export type Submission = { prompt: string; shots: Shot[] }

// An image in the prompt being written, by its "[Image #n]" number; no shot
// while it can't be shown (not saved yet, or not a PNG or JPEG).
export type DraftImage = { number: number; shot: Shot | null }

declare module 'claude-code' {
  interface PluginState {
    glance: {
      submissions: Shaped<Submission[]>
      draft: Shaped<DraftImage[]>
      viewing: Shaped<Shot | null>
    }
  }
}
