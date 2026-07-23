# Contributing

The most valuable thing anyone can add here is **a scam pattern in a language
the commercial market has no reason to serve.** The code is small and settled;
the observations are what make it work.

---

## Adding patterns to an existing language

Open `data/patterns_<lang>.json` and add markers to a group, or add a group.

Two rules matter more than the format:

**Write from observation, not translation.** The tactics that dominate differ by
region. Gift cards dominate English-language fraud; transfers to a non-existent
"safe account" dominate Russian-language fraud. Translating a marker list from
another language produces phrases nobody actually sends, which match nothing and
add noise.

**A group is a tactic, not a phrase.** The engine emits one signal per group, no
matter how many markers inside it hit — three synonyms for the same trick are one
trick, not triple certainty. If your new phrase is another way of saying
something already covered, add it to that group rather than making a new one.

### The shape

```json
{
  "id": "safe_account",
  "title": "Asking you to transfer to a 'safe account'",
  "explanation": "No such account exists. It is an invention — no bank has this mechanism.",
  "severity": 0.8,
  "markers": ["safe account", "secure account", "reserve account"]
}
```

`title` names the tactic. `explanation` is shown to a frightened person, so write
it the way you would say it out loud: what the tactic is, and why a real
institution would never do it. No jargon, no hedging.

### Choosing severity

Severity is a contribution to the picture, not a verdict. The engine combines
signals as `1 - Π(1 - severity)`, and the thresholds are 0.35 to warn and 0.75 to
block.

| Range | Meaning | Example |
|---|---|---|
| 0.25–0.4 | weak on its own, meaningful in company | urgency |
| 0.45–0.65 | suspicious, but has innocent uses | remote-access software |
| 0.7–0.85 | almost no legitimate use | asking for an SMS code |

Ask yourself the honest question: **can a decent person send this message?** If a
nephew helping his aunt set up a laptop might say it, the group belongs in the
middle band, where it warns alone and only blocks in combination.

---

## Adding a new language

1. Copy `data/patterns_en.json` to `data/patterns_<code>.json`, empty the
   `groups`, and write your own from scams you have actually seen.
2. Add the interface strings to `STRINGS` in `web/app.js` and two or three local
   examples to `EXAMPLES`.
3. Add a language button in `index.html`.
4. Add cases in both directions to `data/evals.json` — scams that must be caught,
   and ordinary messages that must stay quiet.

Please open an issue before starting a language, so two people don't write the
same one twice.

---

## The eval loop

`data/evals.json` is a labelled corpus: `flag` for messages that must raise
something, `clean` for ordinary messages that must not.

```bash
node eval.mjs
```

It exits non-zero on a miss or a false alarm, and CI runs it on every push.

**Add the case before you fix it.** If you found a scam that slipped through or an
innocent message that got flagged, put it in `evals.json` first, watch the run
fail, then change the dataset and watch it pass. That way a fix is visible as a
fix, and nothing quietly regresses later.

False alarms are worth more than misses here. A missed scam is one the tool never
promised to catch. A false alarm on an ordinary message teaches the user to
ignore the tool, and then it protects nobody.

---

## What does not belong here

**Anything that identifies people.** This project evaluates what participates in
the scheme — links, addresses, message structure — never who is on the other
side. There is no `identity` artifact kind, and adding one would be rejected.
Knowing a scammer's name does not stop the transfer, and a tool that profiles
people serves stalking as readily as safety.

**Anything phrased as certainty.** No explanation should tell a user something is
safe. The strongest claim available is that no known warning signs were found.

**Entries in `known_bad.json` without a source.** Include where the report came
from in the pull request.

---

## Changing the engine

The decision engine lives in
[guardrails-core](https://github.com/rusmoody/guardrails-core) and is implemented
twice, in Python and JavaScript. A change to one must be made in the other, and
covered in `conformance/cases.json` — the shared suite exists so the two cannot
quietly disagree.

The copy in `web/vendor/guardrails/` is verbatim. Do not edit it here; change the
core and copy it over.

---

## Licences

Code is Apache-2.0. Datasets are CC-BY-4.0. By contributing you agree your work
is released under the same terms.
