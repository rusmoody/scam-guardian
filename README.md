# scam-guardian

**Check a suspicious message without sending it anywhere.**

A web page and a Telegram bot that explain which phrases in a message are
manipulation — in plain language, without verdicts and without guarantees.

Built on [guardrails-core](https://github.com/rusmoody/guardrails-core).

---

## Why not an article about staying safe

Someone being defrauded does not stop to read safety advice. The decision happens
in minutes, under pressure, usually by phone or messenger. Protection has to be
where the attack is, and it has to cost one action.

Two surfaces, two jobs:

| | Reaches the moment | What it costs the user |
|---|---|---|
| **Web page** | they have to come to it | nothing — paste and read |
| **Telegram bot** | forwarding is one tap | nothing — the app is already installed |

The web page is also the honest answer to "let me try it" — no install, no
account, works in ten seconds.

---

## Privacy is architectural, not a promise

The web version runs the whole analysis **in the browser**. The message you paste
is never transmitted, because there is nothing to transmit it to: the page is
static files and the engine is JavaScript that executes on your device.

That is why the JavaScript port of the engine exists at all. For a tool that
inspects private messages, not receiving them beats promising not to look.

The bot necessarily sees what is forwarded to it, so it stores nothing: the log
records the decision and the kinds of artifacts found, never the text.

---

## Works with no network at all

The page installs to a phone's home screen as a progressive web app and runs
**fully offline** after the first visit — the engine, both datasets, and the
interface add up to a few dozen kilobytes with no model to download.

This is not an optimisation. Someone being pressured on a call may have a weak
signal and a cheap handset; a defence that needs connectivity is missing exactly
when it is needed. It also means the privacy claim holds in the strongest
possible form: with the network off, the analysis still works.

## What it does

1. Pulls out what can be checked — links, domains, wallet addresses, phone numbers.
2. Matches the message against an open dataset of social-engineering tactics.
3. Highlights the matching phrases **inside the message itself**, so you can see
   which words are doing the manipulating.
4. Explains what to do next.

## Works with no network at all

The page installs to a phone's home screen as a progressive web app and runs
**fully offline** after the first visit — the engine, both datasets, and the
interface add up to a few dozen kilobytes with no model to download.

This is not an optimisation. Someone being pressured on a call may have a weak
signal and a cheap handset; a defence that needs connectivity is missing exactly
when it is needed. It also means the privacy claim holds in the strongest
possible form: with the network off, the analysis still works.

## What it does not do

**It does not look up people.** We evaluate what participates in the scheme, not
who is on the other side. Knowing a scammer's identity does not stop the transfer;
recognising the tactic does. A tool that profiles people serves stalking as
readily as safety, so it is out of scope by design.

**It never says "safe".** The best it offers is "no known warning signs", followed
immediately by the caveat that a new approach can pass unnoticed. A false alarm
costs the user a moment of annoyance. False reassurance costs them money.

**It does not show a score.** A confidence percentage is false precision dressed
as certainty. What helps someone under pressure is knowing *which phrase* is the
manipulation and *what to do now* — the numbers stay in a technical detail panel
for developers.

---

## Datasets

`data/patterns_en.json` and `data/patterns_ru.json` — social-engineering markers
grouped by tactic, each with a plain-language explanation. CC-BY-4.0.

Each language is **authored, not translated.** The tactics that dominate differ by
region: gift cards and wire transfers in English-language fraud, transfers to a
non-existent "safe account" in Russian-language fraud. A translated marker list
matches nothing and only adds noise.

`data/known_bad.json` — artifacts with confirmed reports, added only with a source.

### How the grouping works

One signal per tactic, not per phrase. Three synonyms for the same trick are one
trick, not triple certainty — otherwise a wordy scammer inflates the score by
being wordy. Group severity is tuned so that an ambiguous tactic warns on its own
and only blocks in combination: "install AnyDesk" may well be a nephew helping
set up a laptop.

Adding a language means writing a `patterns_<code>.json` from observed local
scams. The structure is ready; the observations have to be real.

---

## Running it

Web page — it is static, so anything that serves files will do:

```bash
python -m http.server 8000     # then open http://localhost:8000
```

Deploying to Netlify needs no build — `netlify.toml` publishes the repository root
and `index.html` sits there, so there is nothing to configure.

Telegram bot:

```bash
pip install -r requirements.txt
cp .env.example .env      # add the token from @BotFather
python bot.py
```

If `api.telegram.org` is unreachable from your network, set `TELEGRAM_PROXY` in
`.env` — the bot checks the connection at startup and says so plainly.

## Tests

```bash
python -m unittest discover -s tests -v
```

## License

Code Apache-2.0. Datasets CC-BY-4.0.
