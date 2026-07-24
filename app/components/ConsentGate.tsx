"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  TERMS_ACCEPTANCE_STORAGE_KEY,
  canAcceptTerms,
  hasAcceptedCurrentTerms,
  serializeTermsAcceptance,
} from "../legal/consent";

const LEGAL_PATHS = new Set([
  "/license",
  "/privacy",
  "/terms-of-usage",
  "/third-party-notices",
]);

const TERMS_ACCEPTED_EVENT = "handmade-games:terms-accepted";

function subscribeToStoredAcceptance(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(TERMS_ACCEPTED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(TERMS_ACCEPTED_EVENT, onChange);
  };
}

function getStoredAcceptance(): boolean {
  try {
    return hasAcceptedCurrentTerms(
      window.localStorage.getItem(TERMS_ACCEPTANCE_STORAGE_KEY),
    );
  } catch {
    return false;
  }
}

export function ConsentGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLegalDocument = LEGAL_PATHS.has(pathname);
  const hasStoredAcceptance = useSyncExternalStore(
    subscribeToStoredAcceptance,
    getStoredAcceptance,
    () => false,
  );
  const [acceptedInMemory, setAcceptedInMemory] = useState(false);
  const [hasOpenedTerms, setHasOpenedTerms] = useState(false);
  const [hasConfirmedAgreement, setHasConfirmedAgreement] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requiresConsent =
    !isLegalDocument && !hasStoredAcceptance && !acceptedInMemory;

  useEffect(() => {
    if (!requiresConsent) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    headingRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [requiresConsent]);

  const accept = () => {
    if (!canAcceptTerms(hasOpenedTerms, hasConfirmedAgreement)) {
      return;
    }

    try {
      window.localStorage.setItem(
        TERMS_ACCEPTANCE_STORAGE_KEY,
        serializeTermsAcceptance(),
      );
      window.dispatchEvent(new Event(TERMS_ACCEPTED_EVENT));
    } catch {
      // Storage may be disabled. Acceptance still lasts for this page session.
    }
    setAcceptedInMemory(true);
  };

  return (
    <>
      <div
        className={`consent-content${requiresConsent ? " consent-content-blocked" : ""}`}
        aria-hidden={requiresConsent || undefined}
        inert={requiresConsent || undefined}
      >
        {children}
      </div>
      {requiresConsent ? (
        <div className="consent-backdrop">
          <section
            className="consent-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-title"
            aria-describedby="consent-summary"
          >
            <p className="consent-kicker">Before you continue</p>
            <h1 id="consent-title" ref={headingRef} tabIndex={-1}>
              Please review the Terms of Usage.
            </h1>
            <div id="consent-summary" className="consent-summary">
              <p>
                Handmade Games and Make a Mess are provided as-is. The game
                contains fictional destruction, weapons, strong motion and
                sound. If this may cause distress or affect your wellbeing, do
                not play.
              </p>
              <p>
                There are no advertising, analytics or tracking cookies. This
                device only stores your language preference and the version of
                the Terms you accepted.
              </p>
              <p>
                Access may change, become paid or be discontinued. Use is at
                your own risk, subject to applicable law.
              </p>
            </div>

            <Link
              className="consent-terms-link"
              href="/terms-of-usage"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setHasOpenedTerms(true)}
            >
              Open Terms of Usage in a new tab
              <span aria-hidden="true">↗</span>
            </Link>

            <label
              className={`consent-confirmation${
                hasOpenedTerms ? " consent-confirmation-ready" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={hasConfirmedAgreement}
                disabled={!hasOpenedTerms}
                onChange={(event) =>
                  setHasConfirmedAgreement(event.currentTarget.checked)
                }
              />
              <span>I have opened, read and agree to the Terms of Usage.</span>
            </label>
            {!hasOpenedTerms ? (
              <p className="consent-requirement" role="status">
                Open the Terms first. Agreement cannot be confirmed before
                that.
              </p>
            ) : null}

            <button
              className="button button-primary consent-accept"
              type="button"
              disabled={!canAcceptTerms(hasOpenedTerms, hasConfirmedAgreement)}
              onClick={accept}
            >
              Agree and continue
            </button>

            <nav className="consent-legal-links" aria-label="Legal documents">
              <Link href="/privacy" target="_blank" rel="noopener noreferrer">
                Privacy
              </Link>
              <Link href="/license" target="_blank" rel="noopener noreferrer">
                MIT License
              </Link>
              <Link
                href="/third-party-notices"
                target="_blank"
                rel="noopener noreferrer"
              >
                Third-Party Notices
              </Link>
            </nav>
            <p className="consent-exit">
              If you do not agree, close this site and do not use the games.
            </p>
          </section>
        </div>
      ) : null}
    </>
  );
}
