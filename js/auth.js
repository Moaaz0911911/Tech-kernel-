// Real "Sign in with Google" (Google Identity Services) and "Sign in with Apple" (Sign in with Apple JS).
// Works on a static site such as GitHub Pages: both providers return a signed ID token (JWT) to the page.
// We check the token's claims (issuer, audience, expiry, nonce) and keep a small profile in localStorage.
// NOTE: if you ever add your own backend, verify the token's signature there before trusting it.
import { CONFIG } from './config.js';
import { store, decodeJwt, randomString, loadScript } from './utils.js';

const GOOGLE_SRC = 'https://accounts.google.com/gsi/client';
const APPLE_SRC = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const APPLE_ISSUER = 'https://appleid.apple.com';

const GUEST_PROFILE = { nickname: 'Guest Kernel', avatar: '🥔', topics: [] };

class Auth extends EventTarget {
  constructor() {
    super();
    this.user = store.get('session', null);
    this._googleInit = null;
  }

  get googleClientId() { return (CONFIG.auth?.google?.clientId || '').trim(); }
  get appleClientId() { return (CONFIG.auth?.apple?.clientId || '').trim(); }
  get googleReady() { return /\.apps\.googleusercontent\.com$/.test(this.googleClientId); }
  get appleReady() { return this.appleClientId.length > 3; }
  /** OAuth popups need https (GitHub Pages) or localhost — not file:// */
  get originOk() {
    return location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  }

  // ---------------- Google ----------------
  initGoogle() {
    if (!this.googleReady) return Promise.reject(new Error('Google sign-in is not configured yet.'));
    if (!this._googleInit) {
      this._googleInit = loadScript(GOOGLE_SRC).then(() => {
        if (!window.google?.accounts?.id) throw new Error('Google sign-in library did not start.');
        this.googleNonce = randomString(32);
        window.google.accounts.id.initialize({
          client_id: this.googleClientId,
          callback: (resp) => this.onGoogleCredential(resp),
          nonce: this.googleNonce,
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
          use_fedcm_for_prompt: true,
          context: 'signin',
        });
      });
      this._googleInit.catch(() => { this._googleInit = null; });
    }
    return this._googleInit;
  }

  /** Render Google's official button into `container`. mode: 'signin' | 'signup' */
  async renderGoogleButton(container, mode = 'signin') {
    await this.initGoogle();
    container.innerHTML = '';
    const width = Math.round(Math.min(360, Math.max(220, container.clientWidth || 300)));
    window.google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: mode === 'signup' ? 'signup_with' : 'signin_with',
      logo_alignment: 'left',
      width,
    });
  }

  onGoogleCredential(resp) {
    try {
      const p = decodeJwt(resp?.credential);
      if (!GOOGLE_ISSUERS.includes(p.iss)) throw new Error('That token did not come from Google.');
      if (p.aud !== this.googleClientId) throw new Error('That token was issued for a different app.');
      if (!p.exp || p.exp * 1000 < Date.now() - 60_000) throw new Error('That sign-in expired — please try again.');
      if (p.nonce && this.googleNonce && p.nonce !== this.googleNonce) throw new Error('Security check failed (nonce). Please try again.');
      this.complete({
        provider: 'google',
        sub: p.sub,
        name: p.name || [p.given_name, p.family_name].filter(Boolean).join(' ') || null,
        givenName: p.given_name || null,
        email: p.email || null,
        emailVerified: !!p.email_verified,
        picture: p.picture || null,
      }, { idToken: resp.credential, nonce: this.googleNonce });
    } catch (e) {
      this.fail(e);
    }
  }

  // ---------------- Apple ----------------
  appleRedirectURI() {
    const configured = (CONFIG.auth?.apple?.redirectURI || '').trim();
    return configured || location.origin + location.pathname.replace(/index\.html$/, '');
  }

  async signInWithApple() {
    if (!this.appleReady) throw new Error('Apple sign-in is not configured yet.');
    try {
      await loadScript(APPLE_SRC);
      if (!window.AppleID?.auth) throw new Error('Apple sign-in library did not start.');
      const state = randomString(24);
      const nonce = randomString(32);
      window.AppleID.auth.init({
        clientId: this.appleClientId,
        scope: 'name email',
        redirectURI: this.appleRedirectURI(),
        state,
        nonce,
        usePopup: true,
      });
      const res = await window.AppleID.auth.signIn();
      const a = res?.authorization || {};
      if (a.state && a.state !== state) throw new Error('Security check failed (state). Please try again.');
      const p = decodeJwt(a.id_token);
      if (p.iss !== APPLE_ISSUER) throw new Error('That token did not come from Apple.');
      if (p.aud !== this.appleClientId) throw new Error('That token was issued for a different app.');
      if (!p.exp || p.exp * 1000 < Date.now() - 60_000) throw new Error('That sign-in expired — please try again.');
      if (p.nonce && p.nonce !== nonce) throw new Error('Security check failed (nonce). Please try again.');
      // Apple only sends the user's name the very first time they authorise your app.
      const n = res.user?.name;
      const fullName = n ? [n.firstName, n.lastName].filter(Boolean).join(' ') : '';
      this.complete({
        provider: 'apple',
        sub: p.sub,
        name: fullName || null,
        givenName: n?.firstName || null,
        email: p.email || res.user?.email || null,
        emailVerified: p.email_verified === true || p.email_verified === 'true',
        privateEmail: p.is_private_email === true || p.is_private_email === 'true',
        picture: null,
      }, { idToken: a.id_token, nonce, name: fullName || null, givenName: n?.firstName || null });
    } catch (e) {
      const code = e?.error || e?.message || '';
      if (/popup_closed_by_user|user_cancelled_authorize|user_trigger_new_signin_flow/.test(code)) {
        this.dispatchEvent(new CustomEvent('cancel', { detail: { provider: 'apple' } }));
        return;
      }
      if (/popup_blocked/.test(code)) {
        this.fail(new Error('Your browser blocked the Apple popup. Allow popups for this site and try again.'));
        return;
      }
      this.fail(e instanceof Error ? e : new Error(String(code || 'Apple sign-in failed')));
    }
  }

  // ---------------- backend (optional) ----------------
  get apiBase() { return String(CONFIG.apiBase || '').trim().replace(/\/+$/, ''); }

  /** Call the kerNEl backend. Throws an Error with .status on failure. */
  async api(path, { method = 'GET', body, auth = true } = {}) {
    if (!this.apiBase) throw Object.assign(new Error('No backend configured'), { status: 0 });
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && this.user?.apiToken) headers.Authorization = `Bearer ${this.user.apiToken}`;
    let res;
    try {
      res = await fetch(this.apiBase + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw Object.assign(new Error('Can’t reach the kerNEl server right now'), { status: 0 });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && auth && this.user?.apiToken && path !== '/api/auth/logout') this.sessionExpired();
      throw Object.assign(new Error(data.error || `Server error ${res.status}`), { status: res.status });
    }
    return data;
  }

  sessionExpired() {
    if (!this.user) return;
    this.signOut({ quiet: true });
    this.dispatchEvent(new CustomEvent('expired'));
  }

  /** Re-check a saved backend session on page load and pull the latest profile/data. */
  async refreshFromServer() {
    if (!this.user?.apiToken) return null;
    const { user } = await this.api('/api/me');
    store.set(`profile:${this.user.key}`, { ...this.getProfile(), ...user.profile });
    this.dispatchEvent(new CustomEvent('profile', { detail: this.getProfile() }));
    return user;
  }

  // ---------------- session + profiles ----------------
  async complete(info, proof = {}) {
    if (!info.sub) return this.fail(new Error('No account id in the token.'));
    const key = `${info.provider}:${info.sub}`;
    let server = null;
    if (this.apiBase && proof.idToken) {
      // The backend re-verifies the token's signature and returns a synced account.
      try {
        server = await this.api(`/api/auth/${info.provider}`, {
          method: 'POST', auth: false,
          body: { idToken: proof.idToken, nonce: proof.nonce, name: proof.name, givenName: proof.givenName },
        });
      } catch (e) {
        if (e.status && e.status < 500) return this.fail(e);
        this.dispatchEvent(new CustomEvent('offline', { detail: e })); // server down: sign in on this device only
      }
    }
    let profile = store.get(`profile:${key}`, null);
    const isNew = server ? server.isNew : !profile;
    if (server) profile = { ...(profile || {}), ...server.user.profile };
    if (!profile) {
      const fromEmail = (info.email || '').split('@')[0];
      profile = {
        nickname: (info.givenName || info.name || fromEmail || 'New Kernel').slice(0, 24),
        avatar: info.picture ? 'photo' : '🍿',
        topics: [],
        created: Date.now(),
      };
    }
    if (info.name) profile.realName = info.name; // keep Apple's one-time name
    store.set(`profile:${key}`, profile);
    this.user = { ...info, name: info.name || server?.user.name || profile.realName || profile.nickname, key, since: Date.now(), apiToken: server?.token || null };
    store.set('session', this.user);
    this.dispatchEvent(new CustomEvent('signin', { detail: { user: this.user, profile, isNew, serverData: server?.user.data || null } }));
  }

  fail(err) {
    console.warn('[kerNEl auth]', err);
    this.dispatchEvent(new CustomEvent('error', { detail: err }));
  }

  signOut({ quiet = false } = {}) {
    const was = this.user;
    if (was?.apiToken && !quiet) this.api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    this.user = null;
    store.del('session');
    try { window.google?.accounts?.id?.disableAutoSelect(); } catch { /* not loaded */ }
    this.dispatchEvent(new CustomEvent('signout', { detail: { user: was, quiet } }));
  }

  profileKey() { return this.user ? this.user.key : 'guest'; }

  getProfile() {
    if (!this.user) return { ...GUEST_PROFILE, ...store.get('profile:guest', {}) };
    return store.get(`profile:${this.user.key}`, { nickname: this.user.name || 'Kernel', avatar: '🍿', topics: [] });
  }

  saveProfile(p) {
    store.set(`profile:${this.profileKey()}`, p);
    if (this.user?.apiToken) {
      this.api('/api/me/profile', { method: 'PUT', body: { nickname: p.nickname, avatar: p.avatar, topics: p.topics } }).catch(() => {});
    }
    this.dispatchEvent(new CustomEvent('profile', { detail: p }));
  }
}

export const auth = new Auth();
