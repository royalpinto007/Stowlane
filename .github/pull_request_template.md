## What does this change?

<!-- One or two sentences. What behaviour is different after this? -->

## Why?

<!-- The problem being solved. Link an issue if there is one. -->

## How was it checked?

<!-- What you actually ran or clicked, not what you intended to. -->

- [ ] `npm run typecheck && npm test && npm run build`
- [ ] Loaded unpacked, stowed a real window and restored it

## Notes

- [ ] No network request was added. Stowlane talks to nothing.
- [ ] No `innerHTML`. Tab titles are untrusted input.
- [ ] No new manifest permission, or the reason is explained above
- [ ] Nothing closes a tab before the write has resolved
- [ ] README and CHANGELOG updated, if behaviour changed
