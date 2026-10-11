# Third-Party Notices

## harfbuzzjs

`vendor/harfbuzzjs/` contains `index.mjs`, `harfbuzz.js` and `harfbuzz.wasm`
from the `dist/` folder of the harfbuzzjs 1.6.2 npm package
(<https://github.com/harfbuzz/harfbuzzjs>), a WebAssembly build of HarfBuzz
(<https://github.com/harfbuzz/harfbuzz>).

harfbuzzjs is licensed under the MIT License. Its license text is preserved
in `vendor/harfbuzzjs/LICENSE`.

## Apple Macintosh Skeletal

McIntosh Writer reads `MacintoshSkeletal.otf`, a font distributed by Apple Inc.
with macOS 27 and iOS 27. The font, its letterforms and its stroke data are
the property of Apple Inc. and aren’t included in this repository. McIntosh
Writer reads the user’s own copy at run time, and the optional tools write
extracted data only to `data/apple/`, which is excluded from version control.

The forms of o that join through the middle, in `apple-extras.js`, use a
short list of coordinates traced from Apple’s “hola” animation as published
in SF-Hello (<https://github.com/JaceThings/SF-Hello>), whose JSON files are
© Apple Inc.
