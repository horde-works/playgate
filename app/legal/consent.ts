export const TERMS_VERSION = "2026-07-24";
export const TERMS_ACCEPTANCE_STORAGE_KEY =
  "handmade-games:terms-acceptance";

export interface StoredTermsAcceptance {
  readonly version: string;
}

export function serializeTermsAcceptance(): string {
  return JSON.stringify({ version: TERMS_VERSION } satisfies StoredTermsAcceptance);
}

export function hasAcceptedCurrentTerms(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const parsed = JSON.parse(value) as Partial<StoredTermsAcceptance>;
    return parsed.version === TERMS_VERSION;
  } catch {
    return false;
  }
}

export function canAcceptTerms(
  hasOpenedTerms: boolean,
  hasConfirmedAgreement: boolean,
): boolean {
  return hasOpenedTerms && hasConfirmedAgreement;
}
