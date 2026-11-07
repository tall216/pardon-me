# Lore — the show bible

This folder is the canon for the show built with **Cartoony**. The Director model
reads it before planning an episode, and every episode build reads it before
drawing a frame. It is versioned with the rest of the repo, so a change to canon
is a commit like any other and shows up in `git log`.

## Status of this draft

This first pass was written **without the Uncle D character sheet in hand** and
with only three names confirmed from the pipeline: **Uncle D**, **Winston**, and
the town of **Quail Hollow**. Everything else is a proposal to react to, not a
fact to defend.

Every claim in these files is tagged one of:

| Tag | Meaning |
| --- | --- |
| `CONFIRMED` | Came from the pipeline or the owner. Do not contradict. |
| `PROPOSED` | Invented here to make the world playable. Edit freely. |
| `OPEN` | A question only the owner can settle. Director should not guess at it. |

When the Uncle D sheet lands, copy its facts into
`characters/uncle-d.md`, flip the tags to `CONFIRMED`, and delete anything in
this folder that it contradicts. **The sheet wins over the lore on anything
visual** (proportions, colors, outfit construction). The lore wins on history,
relationships, and behavior.

## What is in here

| File | What it holds |
| --- | --- |
| `rules-of-the-show.md` | Format, tone, physics, what never happens, how the Director should use the lore. Read this first. |
| `world.md` | The world: era, scale, how Cartoony logic works inside the fiction. |
| `places.md` | Every location in and around Quail Hollow, with what each one is *for* in a story. |
| `characters/` | One file per character: history, voice, wants, outfits, relationships. |
| `continuity-log.md` | The running ledger of facts each episode has established. Append-only. |
| `episodes/TEMPLATE.md` | What an episode file should record so its facts can be logged. |

## How the Director model should read it

1. `rules-of-the-show.md`, whole file, every time.
2. `world.md` and `places.md`, whole files. They are short on purpose.
3. Only the `characters/` files for people who appear in the episode, plus
   `characters/_cast.md` for the one-line summaries of everyone else.
4. `continuity-log.md` from the bottom up, stopping once it reaches facts older
   than the current season.

An episode may *add* to canon. It may not silently *change* it. If a story needs
something the lore says is false, the episode notes say so, the owner decides,
and the lore is edited in the same commit as the episode.
