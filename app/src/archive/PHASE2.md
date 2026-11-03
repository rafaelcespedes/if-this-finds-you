# Lost Letters, phase 2: letters written here

Phase 1 (this folder) is the browsing side: found letters only, no backend. This note is the plan for the
second drawer, **Written here**: anyone writes a letter in the tool and sends it in; approved letters join the
archive. Nothing below is built yet. The index and letter page already read the shared model, so a written letter
shows up without changes to them.

## 1. Data model

One shape for both drawers (`model.ts`, `ArchiveLetter`):

```ts
{
  id: string;                       // 'w-' + a short random id, never derived from the text or the writer
  origin: 'found' | 'written';
  text: string;                     // the letter as it reads (the ink log's logical text)
  kind: 'letter' | 'note';
  lang: string;                     // BCP 47, detected and confirmed by the writer
  title?: string;                   // optional, the writer's own
  author?: string;                  // found letters only (the curator's record)
  credit?: { name?: string; anonymous: boolean };   // written letters: the writer's choice, see §3
  license?: string;                 // written letters: 'CC BY 4.0' when credited, 'CC0 1.0' when anonymous
  createdAt?: string;               // ISO date the letter was sent in
  look?: Look;                      // the look it was written in, see below
  place?: string; year?: number;    // optional; year defaults to createdAt's year
}
```

**The look travels with the letter.** A submitted letter stores the exact look the writer saw, and the engine
draws it live, the same way the index and letter page draw found letters:

```ts
look: {
  seed, style,            // the writer (word seed) and their taught hand
  pen, tip, ink, paper,   // what they wrote with and on (tool ids)
  size,                   // the tool's Size (relative to the paper)
  params: { ... },        // absolute slider values (neatness, slant, pressure, hurry, ...)
}
ink?: string              // optional: the Ink-mode log (encodeDoc), so corrections replay as they were written
engine?: string           // the engine version it was written with (INK_VERSION), so old letters keep their look
```

No images are stored: the letter is text plus a look, a few kilobytes, and it can be re-drawn at any size, in the
write-on animation, or as a JPEG. If the engine changes how a hand looks, letters written with an older engine
version are drawn with that version's look (the `engine` field), or flagged for re-review.

**Storage.** One table (or a JSON document store) for letters with `status: 'queued' | 'approved' | 'declined'`.
The public archive reads a static, versioned file of approved letters (`letters-written-<n>.json`) built after each
batch, so browsing never touches the database and the archive keeps working with no backend at all.

## 2. Submission flow (in the tool)

1. The writer finishes a letter (Ink mode or fair copy). A new action, **Send to Lost Letters**, sits beside Share
   link and Download.
2. A short sheet, one screen:
   - The letter, small, as it will appear.
   - **How should we credit you?** Two choices, nothing preselected:
     - *Credit me as* [name field]: shown under the letter; licence CC BY 4.0.
     - *Keep me anonymous*: shown as "Anonymous"; licence CC0 1.0.
   - Optional: title, place (city or country, free text), language (detected, editable).
   - Three plain checks the writer confirms: it's their own words; it names no private person without consent
     (first names are fine); they agree to the licence shown.
3. **Send.** The confirmation says what happens next in one line: "Thanks. Letters are read in batches, usually
   within a couple of days. If it's approved, it will appear in Written here." No account is needed; the writer
   gets a private link to check the status (and to withdraw the letter before or after approval).
4. Rate limits: a few letters per device per day; a honeypot field instead of a CAPTCHA.

## 3. Credit and privacy

- The writer chooses credit or anonymity on every letter; the default is neither (they must pick).
- Anonymous letters store no name at all. The status link is the only tie back to the writer.
- No email or account is required. If one is offered later (to be told when a letter is approved), it is stored
  apart from the letter and never shown.
- A withdrawn letter leaves the archive in the next batch build; its id stays reserved so old links say
  "This letter was taken out of the archive" instead of showing another letter.

## 4. Moderation queue

Letters wait in a private queue and are approved **in batches**: daily, or every couple of days when traffic is
low (DECISIONS.md: Claude approves batches; an automatic screening step comes later).

- **Screening (later, automatic):** language detection, length limits, personal data (phone numbers, addresses,
  emails, full names of private people), hate and harassment, spam and links. Screening only sorts the queue
  (clear / needs a look / likely decline); a person (or Claude, per the decision log) makes every call.
- **Review:** each letter is read as text and as it will be drawn. Approve, decline, or approve with a small
  redaction (e.g. a phone number replaced with "…"), which the writer sees on their status link.
- **Batch:** approved letters are appended to the next `letters-written-<n>.json`, ordered by approval, and the
  site picks up the new file. A batch log records who approved what and when.
- **Reports:** every written letter gets a quiet "Report this letter" link; a report hides nothing by itself but
  puts the letter back in the queue for the next batch.

## 5. What the archive shows for a written letter

- Index card: the letter's opening in its own stored look; under it the title (or the opening words), "by
  {credit name}" or "Anonymous", and "{place}, {month year}".
- Letter page: the same write-on, with the provenance card replaced by: who wrote it (as credited), when it was
  sent in, the licence, and "Written here in {writer name}'s hand", where the hand is the fictional writer
  they chose in the tool.
- Write a reply works as for found letters: a reply can itself be sent in, and links back to the letter it answers
  (`replyTo` in the tool's state).

## 6. What phase 1 already has for this

- The model (`model.ts`) with `origin`, `credit`, `license`, `createdAt` and `look`.
- `lookFor()` uses a stored `look` as is (`letterLook`: `if (l.look) return l.look`).
- The Written here drawer, with an empty state that says sending isn't open yet.
- Cards and letter pages keyed by id and look, so a written letter's stored look renders like any other.
