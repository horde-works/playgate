import type { Metadata } from "next";
import { LegalDocument } from "../components/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Usage",
  description: "Terms governing access to Handmade Games and Make a Mess.",
};

export default function TermsOfUsagePage() {
  return (
    <LegalDocument
      eyebrow="Effective 24 July 2026 · Version 2026-07-24"
      title="Terms of Usage"
      summary="These Terms govern access to the Handmade Games website and the Make a Mess game. Read them before using either."
    >
      <section>
        <h2>1. Operator and agreement</h2>
        <p>
          Handmade Games and Make a Mess (together, the “Service”) are created
          and operated by Igor Kirisiuk, Astana, Kazakhstan (“Igor”, “I”, “me”
          or “my”). By selecting “Agree and continue” or otherwise using the
          Service after these Terms are presented, you confirm that you have
          read, understood and agreed to these Terms.
        </p>
        <p>
          If you do not agree, do not access or use the Service. You must have
          legal capacity to accept these Terms. If applicable law requires a
          parent or guardian to consent for you, that person must review and
          accept these Terms on your behalf.
        </p>
      </section>

      <section>
        <h2>2. Nature of the Service</h2>
        <p>
          The Service is an experimental game and software project. It may be
          incomplete, unstable, unavailable, changed or discontinued. Features,
          levels, content, controls, technical requirements and access methods
          may change at any time.
        </p>
        <p>
          Access is currently offered without charge. I do not promise that the
          Service, any feature or any future version will remain free. Paid
          access or other commercial terms may be introduced prospectively.
        </p>
      </section>

      <section>
        <h2>3. Content and wellbeing notice</h2>
        <p>
          Make a Mess depicts fictional destruction and includes weapons,
          explosions, impacts, sudden sounds, camera movement, flashing or
          rapidly changing visual effects and simulated physical collapse. The
          content is not an instruction, endorsement or encouragement to cause
          real-world harm.
        </p>
        <p>
          You are solely responsible for deciding whether the Service is
          suitable for you. If its subject matter, motion, sound, imagery or
          interactivity may offend you, cause emotional distress, trigger a
          health condition or otherwise negatively affect your wellbeing, do
          not use it. Stop immediately if you feel discomfort. The Service is
          not medical advice and is not designed as a health or safety tool.
        </p>
      </section>

      <section>
        <h2>4. Software license and intellectual property</h2>
        <p>
          Source code and associated documentation identified in the public
          repository are licensed under the MIT License. Subject to that
          license, recipients may use, copy, modify, merge, publish, distribute,
          sublicense and sell copies of the software. The MIT License, not these
          Terms, governs those granted software rights.
        </p>
        <p>
          Third-party components and assets remain subject to their own
          licenses. Those components are identified in the Third-Party Notices.
          The MIT License does not grant rights in third-party material, names,
          marks, branding, personalities or other rights that I do not own.
        </p>
        <p>
          Except for third-party material or references expressly identified,
          characters, events, locations, organisations and situations depicted
          in the Service are fictional; any resemblance to actual persons,
          events or entities is coincidental. All third-party names and marks
          belong to their respective owners. Their appearance does not imply
          sponsorship, affiliation or endorsement, and I claim no ownership of
          them.
        </p>
      </section>

      <section>
        <h2>5. Permitted use</h2>
        <p>
          You may use the hosted Service for personal entertainment and may
          exercise all rights granted by the applicable open-source licenses.
          You must not use the hosted Service unlawfully; attempt to disrupt,
          overload or compromise it; evade access controls; introduce malicious
          code; or misrepresent an affiliation with me or Handmade Games.
        </p>
      </section>

      <section>
        <h2>6. Privacy, cookies and local storage</h2>
        <p>
          The application is designed without accounts, advertising, analytics,
          behavioural tracking or user-content submission. It does not set
          cookies. It stores only a language preference and the accepted Terms
          version in local storage on your device. These values are not sent to
          me by the application. The Privacy Notice explains the limited
          technical data that network or hosting providers may necessarily
          process to deliver and secure a website.
        </p>
        <p>
          If non-essential cookies, analytics or additional personal-data
          processing are introduced later, they will not be enabled for you
          before any notice and consent required by applicable law.
        </p>
      </section>

      <section>
        <h2>7. No warranties</h2>
        <p className="legal-caps">
          To the maximum extent permitted by applicable law, the Service and
          all software and content are provided “as is” and “as available”, with
          all faults and without warranties, representations, promises or
          conditions of any kind, whether express, implied or statutory.
        </p>
        <p>
          Without limitation, I do not warrant availability, continuity,
          security, accuracy, compatibility, performance, merchantability,
          fitness for a particular purpose, title, non-infringement, freedom
          from defects or harmful components, preservation of state, or that
          the Service will meet your expectations. You use it entirely at your
          own risk.
        </p>
      </section>

      <section>
        <h2>8. Limitation of liability</h2>
        <p className="legal-caps">
          To the maximum extent permitted by applicable law, Igor Kirisiuk and
          any contributors, licensors, service providers or affiliates will not
          be liable for any direct, indirect, incidental, consequential,
          special, exemplary or punitive loss or damage arising from or related
          to the Service or these Terms.
        </p>
        <p>
          This exclusion includes, without limitation, physical or personal
          injury, emotional distress, offence, disappointment, financial loss,
          loss of profits, revenue, opportunity, goodwill, data or device use,
          business interruption, replacement costs and claims by third parties,
          whether based in contract, tort, negligence, strict liability,
          statute or any other theory, even if the possibility was known.
        </p>
        <p>
          Where liability cannot lawfully be excluded, the total aggregate
          liability for all claims is limited to the amount, if any, that you
          actually paid directly to me for access to the Service during the
          twelve months before the event giving rise to the claim. For free
          access, that amount is zero. Nothing in these Terms excludes a right
          or liability that applicable law does not permit the parties to
          exclude or limit.
        </p>
      </section>

      <section>
        <h2>9. Your responsibility and indemnity</h2>
        <p>
          You are responsible for your use of the Service, your device and your
          compliance with law. To the maximum extent permitted by law, you will
          defend, indemnify and hold harmless Igor Kirisiuk from third-party
          claims, losses and reasonable costs arising from your unlawful use,
          your breach of these Terms or your infringement of another person’s
          rights.
        </p>
      </section>

      <section>
        <h2>10. Changes, suspension and termination</h2>
        <p>
          I may modify, restrict, suspend or discontinue any part of the Service
          at any time, with or without notice, subject to mandatory law. I may
          also deny access where reasonably necessary to protect the Service,
          other users or legal rights.
        </p>
        <p>
          I may update these Terms at any time. A new effective date and version
          will be published. The Service will require explicit acceptance of a
          new version before continued access; acceptance of an earlier version
          is not automatic acceptance of a later version. Changes apply
          prospectively unless applicable law requires otherwise.
        </p>
      </section>

      <section>
        <h2>11. Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws of the Republic of Kazakhstan,
          without regard to conflict-of-law rules. Subject to any mandatory
          consumer jurisdiction, courts located in Astana, Kazakhstan have
          exclusive jurisdiction over disputes arising from these Terms or the
          Service.
        </p>
      </section>

      <section>
        <h2>12. General terms</h2>
        <p>
          These Terms, the Privacy Notice, the MIT License and applicable
          third-party licenses form the entire agreement on their respective
          subjects. If a provision is unenforceable, it will be limited only as
          necessary and the remainder will continue. Failure to enforce a
          provision is not a waiver. You may not assign these Terms without my
          consent; I may assign them in connection with a transfer of the
          Service. The English version controls to the extent permitted by law.
        </p>
      </section>

      <section>
        <h2>13. Contact</h2>
        <address>
          Igor Kirisiuk
          <br />
          Astana, Kazakhstan
          <br />
          <a href="mailto:igor@horde.works">igor@horde.works</a>
        </address>
      </section>

      <section className="legal-references">
        <h2>References and related documents</h2>
        <ol>
          <li>
            <a href="/license">Handmade Games MIT License</a>
          </li>
          <li>
            <a href="/privacy">Handmade Games Privacy Notice</a>
          </li>
          <li>
            <a href="/third-party-notices">Third-Party Notices</a>
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
        </ol>
      </section>
    </LegalDocument>
  );
}
