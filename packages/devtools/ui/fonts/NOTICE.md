# Embedded fonts

The devtools UI is a single self-contained document, so these typefaces are inlined
as `data:` URIs at build time.

| File                       | Family             | Source                                 | License                   |
| -------------------------- | ------------------ | -------------------------------------- | ------------------------- |
| `geist-400.woff2`          | Geist 400          | Google Fonts (latin subset)            | SIL Open Font License 1.1 |
| `geist-500.woff2`          | Geist 500          | Google Fonts (latin subset)            | SIL Open Font License 1.1 |
| `geist-mono-400.woff2`     | Geist Mono 400     | Google Fonts (latin subset)            | SIL Open Font License 1.1 |
| `geist-mono-500.woff2`     | Geist Mono 500     | Google Fonts (latin subset)            | SIL Open Font License 1.1 |
| `geist-pixel-circle.woff2` | Geist Pixel Circle | Vercube homepage (`home/public/fonts`) | SIL Open Font License 1.1 |

Geist and Geist Mono are © Vercel, released under the SIL Open Font License 1.1.
See <https://github.com/vercel/geist-font>.

Only latin subsets are vendored (~58 kB, ~78 kB once base64-encoded).
