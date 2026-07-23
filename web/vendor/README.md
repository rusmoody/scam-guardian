# Vendored dependency

`guardrails/` is a verbatim copy of the JavaScript implementation from
[guardrails-core](https://github.com/rusmoody/guardrails-core) (`js/src/`).

It is vendored rather than installed so the page stays a static file with no
build step and no third-party requests. To refresh, copy `js/src/*.js` from the
core repo over this directory — the conformance suite in that repo is what
guarantees the copy behaves identically to the Python implementation.
