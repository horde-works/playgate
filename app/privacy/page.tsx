import type { Metadata } from "next";
import { LegalDocument } from "../components/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Notice",
  description: "How Handmade Games handles data, cookies and local storage.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Effective 24 July 2026"
      title="Privacy Notice"
      summary="The application does not create accounts, track players or set cookies. This notice states exactly what is and is not stored."
    >
      <section>
        <h2>1. Operator</h2>
        <p>
          Handmade Games and Make a Mess are operated by Igor Kirisiuk,
          Astana, Kazakhstan. Contact: <a href="mailto:igor@horde.works">igor@horde.works</a>.
        </p>
      </section>

      <section>
        <h2>2. No application-level collection</h2>
        <p>
          The application is designed not to collect or process personal data.
          It has no user accounts, profiles, contact forms, purchases,
          advertising, analytics, telemetry, behavioural tracking, social
          plugins or user-content submission. The application does not sell,
          rent or share personal data because it does not collect it.
        </p>
      </section>

      <section>
        <h2>3. Cookies and device-local storage</h2>
        <p>
          The application does not set cookies. It uses browser local storage
          for two device-local preferences only:
        </p>
        <ul>
          <li>
            <code>handmade-games-language</code> — the language you selected;
          </li>
          <li>
            <code>handmade-games:terms-acceptance</code> — the version of the
            Terms of Usage you accepted.
          </li>
        </ul>
        <p>
          These values stay in your browser and are not transmitted to the
          operator by the application. They contain no account identifier,
          contact detail, advertising identifier or gameplay history. You can
          remove them at any time by clearing this site’s browser data; the
          Service will then ask for your preferences and consent again.
        </p>
      </section>

      <section>
        <h2>4. Hosting and network delivery</h2>
        <p>
          Like any website, the Service must be delivered through hosting,
          content-delivery, domain and network infrastructure. Those providers
          may automatically process limited technical request data such as an
          IP address, request time, requested URL, browser headers and security
          events to transmit the site, prevent abuse and maintain their
          systems. This processing is performed by the relevant provider under
          its own terms and privacy documentation, not by an analytics or
          tracking feature in the game.
        </p>
      </section>

      <section>
        <h2>5. Future changes</h2>
        <p>
          If the Service later introduces accounts, analytics, non-essential
          cookies or any other personal-data processing, this notice and the
          product controls will be updated first. Non-essential cookies or
          similar tracking storage will not be enabled before any prior consent
          required by applicable law.
        </p>
      </section>

      <section>
        <h2>6. Your questions and rights</h2>
        <p>
          Because the application does not hold a user account or application
          dataset about you, it ordinarily has no personal record to access,
          correct or delete. For a privacy question or a request concerning
          operator-held data, contact <a href="mailto:igor@horde.works">igor@horde.works</a>.
          Any applicable statutory rights remain unaffected.
        </p>
      </section>

      <section className="legal-references">
        <h2>References</h2>
        <ol>
          <li>
            <a
              href="https://adilet.zan.kz/eng/docs/Z1300000094"
              target="_blank"
              rel="noopener noreferrer"
            >
              Republic of Kazakhstan — On Personal Data and their Protection
            </a>
          </li>
          <li>
            <a
              href="https://eur-lex.europa.eu/eli/dir/2002/58/art_5/par_3/oj/eng"
              target="_blank"
              rel="noopener noreferrer"
            >
              EUR-Lex — ePrivacy Directive, Article 5(3)
            </a>
          </li>
          <li>
            <a
              href="https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/"
              target="_blank"
              rel="noopener noreferrer"
            >
              UK Information Commissioner — Cookies and similar technologies
            </a>
          </li>
          <li>
            <a
              href="https://www.cloudflare.com/privacypolicy/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Cloudflare Privacy Policy
            </a>
          </li>
          <li>
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Privacy Policy (including Firebase hosting services)
            </a>
          </li>
        </ol>
      </section>
    </LegalDocument>
  );
}
