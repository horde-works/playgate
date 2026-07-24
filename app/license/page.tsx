import type { Metadata } from "next";
import { LegalDocument } from "../components/LegalDocument";

export const metadata: Metadata = {
  title: "MIT License",
  description: "The MIT License for Handmade Games source code.",
};

export default function LicensePage() {
  return (
    <LegalDocument
      eyebrow="Open-source software license"
      title="MIT License"
      summary="The source code and associated documentation are available under this license. Third-party components remain under their respective licenses."
    >
      <section className="legal-license-text" aria-label="MIT License text">
        <p>MIT License</p>
        <p>Copyright © 2026 Igor Kirisiuk</p>
        <p>
          Permission is hereby granted, free of charge, to any person obtaining
          a copy of this software and associated documentation files (the
          “Software”), to deal in the Software without restriction, including
          without limitation the rights to use, copy, modify, merge, publish,
          distribute, sublicense, and/or sell copies of the Software, and to
          permit persons to whom the Software is furnished to do so, subject to
          the following conditions:
        </p>
        <p>
          The above copyright notice and this permission notice shall be
          included in all copies or substantial portions of the Software.
        </p>
        <p>
          THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND,
          EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
          IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
          CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
          TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
          SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
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
              Repository license file
            </a>
          </li>
          <li>
            <a
              href="https://opensource.org/license/mit"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Source Initiative — The MIT License
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
