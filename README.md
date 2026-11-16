# wiki-this

An agent skill that builds one merged, local wiki from the folders, repos or projects you name.
Articles, guides and a glossary land as ordinary HTML on your machine. A normal run sends
nothing anywhere.

The only network step is optional: step 2b may look up **public concept names only**
(for example "idempotence") on Wikipedia and Grokipedia, to catch missing or conflicting
definitions. Source text, file paths and private names are never sent. You can skip that
step offline.

A five-step lesson preview can be written next to an article. Full courses are not live.
Each lesson ends with a link to join a waitlist. The lesson file itself collects nothing.

## Install

Copy this folder into your agent's skills directory, or add the repo with your agent's
skill installer once it is public.

| Agent | Skills folder |
| --- | --- |
| Claude Code | `~/.claude/skills/wiki-this/` |
| Cursor | `.cursor/skills/wiki-this/` in the project, or your user skills folder |
| Codex | `~/.codex/skills/wiki-this/` |

The folder must contain `SKILL.md`. Then ask the agent to `/wiki-this` on a source you can read.

Smoke test, from this folder:

```sh
sh scripts/build-sample.sh /tmp/sample-wiki
```

Open `/tmp/sample-wiki/article.html`.

## Example output

`examples/http-caching-lesson.html` is a five-step lesson on HTTP caching, written from
public docs (MDN and RFC 9111). The footer reads "Want a full course on this? Join the list".
The link opens the waitlist at `https://sunnypatneedi.com/prompts#wiki-this`. The lesson file itself
sends nothing.

## Privacy

- Wikis are built locally. Nothing is uploaded unless you later ask to publish.
- The optional cross-check sends public concept names only, over GET, with no keys.
- Generated lesson files send nothing and collect nothing.
- The waitlist, when it exists, stores an email and that the signup came from wiki-this.
  It is a page you open in the browser, not something the HTML file posts on its own.

## License

MIT. Copyright (c) 2026 Sunny Patneedi.
