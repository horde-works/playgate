# Third-Party Notices

Handmade Games includes third-party software, fonts, and audio. Each component
remains subject to its own license. The repository AGPL-3.0 License does not
replace or narrow those licenses, and a commercial license to this project does
not relicense them either.

## Principal runtime software

| Component | Copyright / project | License |
| --- | --- | --- |
| React and React DOM | Meta Platforms, Inc. and affiliates | MIT |
| Next.js | Vercel, Inc. | MIT |
| three.js | three.js authors | MIT |
| React Three Fiber and Drei | PMNDRS contributors | MIT |
| React Three Rapier | PMNDRS contributors | MIT |
| Rapier | Dimforge contributors | Apache-2.0 |
| N8AO | N8python contributors | CC0-1.0 |
| postprocessing | vanruesc contributors | Zlib |
| sharp | Lovell Fuller and contributors | Apache-2.0 |
| libvips (`@img/sharp-libvips-*`, prebuilt binary) | libvips contributors | LGPL-3.0-or-later |

`libvips` reaches the tree as an optional platform binary behind `sharp`, which
Next.js uses for image optimisation. It is dynamically loaded and is not
statically linked into this project's code. Its LGPL-3.0 terms are compatible
with the repository's AGPL-3.0 license; recipients retain the LGPL right to
replace that component.

The complete production dependency graph and exact versions are recorded in
`package-lock.json`. Copyright and license notices shipped with those packages
remain applicable.

## Typeface

Geist Sans and Geist Mono are copyright © 2023 Vercel, in collaboration with
basement.studio, and are licensed under the SIL Open Font License 1.1.

## Audio

- Kenney Impact Sounds — Kenney — CC0 1.0.
- Big Explosion — elnineo — CC0 1.0.
- Explosion Heavy — Delta12 Studio — CC0 1.0.

File-level details are also recorded in
`public/games/make-a-mess/audio/LICENSES.md`.

## License texts and sources

1. Project AGPL-3.0 License: https://github.com/horde-works/playgate/blob/main/LICENSE
2. React: https://github.com/facebook/react/blob/main/LICENSE
3. Next.js: https://github.com/vercel/next.js/blob/canary/license.md
4. three.js: https://github.com/mrdoob/three.js/blob/dev/LICENSE
5. React Three Fiber: https://github.com/pmndrs/react-three-fiber/blob/master/LICENSE
6. Drei: https://github.com/pmndrs/drei/blob/master/LICENSE
7. React Three Rapier: https://github.com/pmndrs/react-three-rapier/blob/master/LICENSE
8. Rapier: https://github.com/dimforge/rapier.js/blob/master/LICENSE
9. N8AO: https://github.com/N8python/n8ao/blob/master/LICENSE
10. postprocessing: https://github.com/vanruesc/postprocessing/blob/main/LICENSE.md
11. Geist: https://github.com/vercel/geist-font/blob/main/LICENSE.txt
12. CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
13. Kenney Impact Sounds: https://www.kenney.nl/assets/impact-sounds
14. Big Explosion: https://opengameart.org/content/explosion-tilesets
15. Explosion Heavy: https://opengameart.org/content/rpg-sound-effect-pack
