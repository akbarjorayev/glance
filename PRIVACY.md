# Glance privacy policy

Effective date: November 6, 2026

Glance is a Claude Code plugin that shows the images you paste into Claude Code as previews in your terminal. In short: glance collects nothing, sends nothing and saves nothing. Everything it does happens on your computer.

## What glance reads

- **Your prompt box**, about five times a second, to notice `[Image #n]` placeholders when you paste an image.
- **The images you paste**, from the folder where Claude Code itself keeps them on your computer, and, for older chats, from the chat history Claude Code keeps.

Glance reads these only to draw the previews you see.

## What leaves your computer

Nothing. Glance makes no network connections. It has no analytics, no telemetry, no accounts and no servers, and the author receives no data from it.

## What glance stores

Nothing. Glance writes no files. The previews it draws exist only in memory while Claude Code is running.

## Programs it starts

Glance runs its own script with Node.js to decode and draw images. When you press **Open original**, it asks your system to open the image with your default image viewer. Both run on your computer only.

## Changes

If glance's handling of data changes, this policy will be updated in the [glance repository](https://github.com/akbarjorayev/glance), with a new effective date.

## Contact

Questions about privacy: open an issue at [github.com/akbarjorayev/glance/issues](https://github.com/akbarjorayev/glance/issues), or contact Akbar Jorayev through [akbarjon.uz](https://akbarjon.uz).
