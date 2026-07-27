import type { Metadata } from "next";
import { LegalDocument } from "../components/LegalDocument";

export const metadata: Metadata = {
  title: "Licensing",
  description:
    "Handmade Games source code is licensed under the GNU AGPL v3; some game worlds carry their own content licence.",
};

export default function LicensePage() {
  return (
    <LegalDocument
      eyebrow="Software and content licensing"
      title="Licensing"
      summary="The source code is free software under the GNU Affero General Public License v3. Game worlds are separate works: most share the code licence, and one — the Astana island — is published under a non-commercial, no-derivatives content licence."
    >
      <section className="legal-license-text" aria-label="Source code licence">
        <h2>Source code — GNU AGPL v3 or later</h2>
        <p>Copyright © 2026 Igor Kirisiuk</p>
        <p>
          This program is free software: you can redistribute it and/or modify
          it under the terms of the GNU Affero General Public License as
          published by the Free Software Foundation, either version 3 of the
          License, or (at your option) any later version.
        </p>
        <p>
          This program is distributed in the hope that it will be useful, but
          WITHOUT ANY WARRANTY; without even the implied warranty of
          MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
          Affero General Public License for more details.
        </p>
        <p>
          You should have received a copy of the GNU Affero General Public
          License along with this program. If not, see{" "}
          <a
            href="https://www.gnu.org/licenses/"
            target="_blank"
            rel="noopener noreferrer"
          >
            gnu.org/licenses
          </a>
          .
        </p>
      </section>

      <section className="legal-license-text" aria-label="World content licences">
        <h2>Game worlds — content licences</h2>
        <p>
          A world is a work of its own: its layout, palette, texts and placement
          are content rather than code. Open House, Viking Village, Grand
          Terminal and Basalt Stronghold are published under the same AGPL
          licence as the code.
        </p>
        <p>
          The Astana island is different. It is a portrait of a real city —
          Bayterek, the tent, the pyramid, the courtyards of the old railway
          district — so its content is published under the Creative Commons
          Attribution-NonCommercial-NoDerivatives 4.0 International licence
          (CC BY-NC-ND 4.0). The world may be played and shared as it is; it may
          not be redistributed in modified form, and it is not part of any
          commercial release. The engine feature that keeps it unbreakable is
          ordinary AGPL code and carries no such restriction.
        </p>
        <p>
          The island is an artistic interpretation. It is not affiliated with,
          endorsed by or sponsored by any of the organisations whose buildings
          inspired it.
        </p>
      </section>

      <section className="legal-references">
        <h2>References</h2>
        <ol>
          <li>
            <a
              href="https://github.com/horde-works/playgate/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
            >
              Repository license file — GNU AGPL v3
            </a>
          </li>
          <li>
            <a
              href="https://github.com/horde-works/playgate/blob/main/LICENSING.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              How code and world content are licensed
            </a>
          </li>
          <li>
            <a
              href="https://www.gnu.org/licenses/agpl-3.0.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              GNU Affero General Public License v3.0
            </a>
          </li>
          <li>
            <a
              href="https://creativecommons.org/licenses/by-nc-nd/4.0/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Creative Commons BY-NC-ND 4.0
            </a>
          </li>
          <li>
            <a href="/third-party-notices">Third-Party Notices</a>
          </li>
        </ol>
      </section>
    </LegalDocument>
  );
}
