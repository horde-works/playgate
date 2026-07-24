import type { Metadata } from "next";
import { LegalDocument } from "../components/LegalDocument";

export const metadata: Metadata = {
  title: "Third-Party Notices",
  description: "Third-party software, fonts and audio used by Handmade Games.",
};

const software = [
  ["React and React DOM", "Meta Platforms, Inc. and affiliates", "MIT"],
  ["Next.js", "Vercel, Inc.", "MIT"],
  ["three.js", "three.js authors", "MIT"],
  ["React Three Fiber and Drei", "PMNDRS contributors", "MIT"],
  ["React Three Rapier", "PMNDRS contributors", "MIT"],
  ["Rapier", "Dimforge contributors", "Apache-2.0"],
  ["N8AO", "N8python contributors", "CC0-1.0"],
  ["postprocessing", "vanruesc contributors", "Zlib"],
] as const;

export default function ThirdPartyNoticesPage() {
  return (
    <LegalDocument
      eyebrow="Licenses and attribution"
      title="Third-Party Notices"
      summary="Handmade Games stands on open-source software and freely licensed assets. Their licenses remain in force for their respective components."
    >
      <section>
        <h2>Software</h2>
        <div className="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Copyright / project</th>
                <th scope="col">License</th>
              </tr>
            </thead>
            <tbody>
              {software.map(([component, owner, license]) => (
                <tr key={component}>
                  <td>{component}</td>
                  <td>{owner}</td>
                  <td>{license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Additional production dependencies and exact versions are recorded in
          the repository lockfile. Copyright and license notices supplied with
          those packages remain applicable. No third-party licensor endorses
          Handmade Games merely because its component is used.
        </p>
      </section>

      <section>
        <h2>Typeface</h2>
        <p>
          Geist Sans and Geist Mono: copyright © 2023 Vercel, in collaboration
          with basement.studio. Licensed under the SIL Open Font License 1.1.
        </p>
      </section>

      <section>
        <h2>Audio recordings</h2>
        <ul>
          <li>
            Kenney Impact Sounds — created by Kenney, released under CC0 1.0.
          </li>
          <li>
            Big Explosion — created by elnineo, released under CC0 1.0.
          </li>
          <li>
            Explosion Heavy — created by Delta12 Studio, released under CC0
            1.0.
          </li>
        </ul>
      </section>

      <section>
        <h2>Project material</h2>
        <p>
          Unless a file or notice says otherwise, Handmade Games source code and
          associated documentation are licensed under the project MIT License.
          Third-party material is not relicensed by that statement.
        </p>
      </section>

      <section className="legal-references">
        <h2>License texts and sources</h2>
        <ol>
          <li>
            <a href="/license">Handmade Games MIT License</a>
          </li>
          <li>
            <a
              href="https://github.com/facebook/react/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
            >
              React — MIT License
            </a>
          </li>
          <li>
            <a
              href="https://github.com/vercel/next.js/blob/canary/license.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              Next.js — MIT License
            </a>
          </li>
          <li>
            <a
              href="https://github.com/mrdoob/three.js/blob/dev/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
            >
              three.js — MIT License
            </a>
          </li>
          <li>
            <a
              href="https://github.com/pmndrs/react-three-fiber/blob/master/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
            >
              React Three Fiber — MIT License
            </a>
          </li>
          <li>
            <a
              href="https://github.com/pmndrs/drei/blob/master/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
            >
              Drei — MIT License
            </a>
          </li>
          <li>
            <a
              href="https://github.com/pmndrs/react-three-rapier/blob/master/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
            >
              React Three Rapier — MIT License
            </a>
          </li>
          <li>
            <a
              href="https://github.com/dimforge/rapier.js/blob/master/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
            >
              Rapier — Apache License 2.0
            </a>
          </li>
          <li>
            <a
              href="https://github.com/N8python/n8ao/blob/master/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
            >
              N8AO — CC0 1.0
            </a>
          </li>
          <li>
            <a
              href="https://github.com/vanruesc/postprocessing/blob/main/LICENSE.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              postprocessing — Zlib License
            </a>
          </li>
          <li>
            <a
              href="https://github.com/vercel/geist-font/blob/main/LICENSE.txt"
              target="_blank"
              rel="noopener noreferrer"
            >
              Geist — SIL Open Font License 1.1
            </a>
          </li>
          <li>
            <a
              href="https://creativecommons.org/publicdomain/zero/1.0/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Creative Commons CC0 1.0
            </a>
          </li>
          <li>
            <a
              href="https://www.kenney.nl/assets/impact-sounds"
              target="_blank"
              rel="noopener noreferrer"
            >
              Kenney Impact Sounds source
            </a>
          </li>
          <li>
            <a
              href="https://opengameart.org/content/explosion-tilesets"
              target="_blank"
              rel="noopener noreferrer"
            >
              Big Explosion source
            </a>
          </li>
          <li>
            <a
              href="https://opengameart.org/content/rpg-sound-effect-pack"
              target="_blank"
              rel="noopener noreferrer"
            >
              Explosion Heavy source
            </a>
          </li>
        </ol>
      </section>
    </LegalDocument>
  );
}
