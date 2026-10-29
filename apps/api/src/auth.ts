import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export interface VerifiedToken {
  uid: string;
  /** True when the user signed in with a second factor (TOTP). */
  mfa: boolean;
}

/** Provider-agnostic: Identity Platform in production, the Auth emulator locally, a fake in tests. */
export interface TokenVerifier {
  verify(idToken: string): Promise<VerifiedToken>;
}

export function firebaseVerifier(projectId: string): TokenVerifier {
  const app = getApps()[0] ?? initializeApp({ projectId });
  const auth = getAuth(app);
  return {
    async verify(idToken) {
      const t = await auth.verifyIdToken(idToken, true);
      return { uid: t.uid, mfa: Boolean(t.firebase?.sign_in_second_factor) };
    },
  };
}
