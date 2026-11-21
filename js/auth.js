// kerNEl accounts: username + password, stored on the kerNEl server (backend/).
// The browser keeps only a session token; passwords are sent once over HTTPS and hashed on the server.
import { CONFIG } from './config.js';
import { store } from './utils.js';

const GUEST_PROFILE = { nickname: 'Guest Kernel', avatar: '🥔', topics: [] };
export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

class Auth extends EventTarget {
  constructor() {
    super();
    const s = store.get('session', null);
    this.user = s && s.username && s.apiToken ? s : null; // drop sessions from older versions
    if (!this.user && s) store.del('session');
  }

  get apiBase() { return String(CONFIG.apiBase || '').trim().replace(/\/+$/, ''); }
  /** Accounts need the kerNEl server. */
  get ready() { return !!this.apiBase; }

  /** Call the kerNEl backend. Throws an Error with .status on failure. */
  async api(path, { method = 'GET', body, auth = true } = {}) {
    if (!this.apiBase) throw Object.assign(new Error('Accounts need the kerNEl server, and it isn’t set up yet.'), { status: 0 });
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && this.user?.apiToken) headers.Authorization = `Bearer ${this.user.apiToken}`;
    let res;
    try {
      res = await fetch(this.apiBase + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw Object.assign(new Error('Can’t reach the kerNEl server right now — check your connection.'), { status: 0 });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && auth && this.user?.apiToken && !path.startsWith('/api/auth/')) this.sessionExpired();
      throw Object.assign(new Error(data.error || `Server error ${res.status}`), { status: res.status });
    }
    return data;
  }

  // ---------------- sign up / in ----------------
  checkUsername(username) {
    return this.api(`/api/auth/available?username=${encodeURIComponent(username)}`, { auth: false });
  }

  async register(username, password, { leaderboard = true, invite = null } = {}) {
    const r = await this.api('/api/auth/register', { method: 'POST', auth: false, body: { username, password, leaderboard, ...(invite ? { invite } : {}) } });
    return this.start(r);
  }

  async login(username, password) {
    return this.start(await this.api('/api/auth/login', { method: 'POST', auth: false, body: { username, password } }));
  }

  /** Forgot password: username + recovery code + new password. Returns the NEW recovery code. */
  async recover(username, recoveryCode, newPassword) {
    return this.start(await this.api('/api/auth/recover', { method: 'POST', auth: false, body: { username, recoveryCode, newPassword } }));
  }

  start(r) {
    const u = r.user;
    this.user = { id: u.id, username: u.username, apiToken: r.token, since: Date.now() };
    store.set('session', this.user);
    const profile = { ...GUEST_PROFILE, ...u.profile };
    store.set(`profile:${this.profileKey()}`, profile);
    const detail = { user: this.user, profile, isNew: !!r.isNew, recoveryCode: r.recoveryCode || null, serverData: u.data || null, streak: u.streak || 0 };
    this.dispatchEvent(new CustomEvent('signin', { detail }));
    return detail;
  }

  changePassword(currentPassword, newPassword) {
    return this.api('/api/me/password', { method: 'POST', body: { currentPassword, newPassword } });
  }

  newRecoveryCode(password) {
    return this.api('/api/me/recovery-code', { method: 'POST', body: { password } });
  }

  async deleteAccount() {
    await this.api('/api/me', { method: 'DELETE' });
    const key = this.profileKey();
    store.del(`profile:${key}`);
    store.del(`data:${key}`);
    this.signOut({ quiet: true });
  }

  checkin() { return this.api('/api/me/checkin', { method: 'POST' }); }
  leaderboard() { return this.api('/api/leaderboard'); }

  sessionExpired() {
    if (!this.user) return;
    this.signOut({ quiet: true });
    this.dispatchEvent(new CustomEvent('expired'));
  }

  /** Re-check a saved session on page load and pull the latest profile/data. */
  async refreshFromServer() {
    if (!this.user?.apiToken) return null;
    const { user } = await this.api('/api/me');
    store.set(`profile:${this.profileKey()}`, { ...this.getProfile(), ...user.profile });
    this.dispatchEvent(new CustomEvent('profile', { detail: this.getProfile() }));
    return user;
  }

  signOut({ quiet = false } = {}) {
    const was = this.user;
    if (was?.apiToken && !quiet) this.api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    this.user = null;
    store.del('session');
    this.dispatchEvent(new CustomEvent('signout', { detail: { user: was, quiet } }));
  }

  // ---------------- profiles (cached in this browser) ----------------
  profileKey() { return this.user ? `user:${this.user.id}` : 'guest'; }

  getProfile() {
    if (!this.user) return { ...GUEST_PROFILE, ...store.get('profile:guest', {}) };
    return { ...GUEST_PROFILE, nickname: this.user.username, ...store.get(`profile:${this.profileKey()}`, {}) };
  }

  saveProfile(p) {
    store.set(`profile:${this.profileKey()}`, p);
    if (this.user?.apiToken) {
      const body = { nickname: p.nickname, avatar: p.avatar, topics: p.topics, leaderboard: p.leaderboard !== false, hat: p.hat || 'none', frame: p.frame || 'none', ...(p.lang ? { lang: p.lang } : {}), bio: p.bio || '', dms: p.dms || 'everyone' };
      this.api('/api/me/profile', { method: 'PUT', body })
        .then((r) => { // the server double-checks hats and frames against your XP
          if (r?.profile && (r.profile.hat !== body.hat || r.profile.frame !== body.frame)) {
            store.set(`profile:${this.profileKey()}`, { ...this.getProfile(), hat: r.profile.hat, frame: r.profile.frame });
            this.dispatchEvent(new CustomEvent('profile', { detail: this.getProfile() }));
          }
        })
        .catch(() => {});
    }
    this.dispatchEvent(new CustomEvent('profile', { detail: p }));
  }
  /** 📷 Upload a cropped profile photo (a JPEG data URL). */
  async setPhoto(dataUrl) {
    const r = await this.api('/api/me/photo', { method: 'PUT', body: { data: dataUrl } });
    store.set(`profile:${this.profileKey()}`, { ...this.getProfile(), photo: r.photo });
    this.dispatchEvent(new CustomEvent('profile', { detail: this.getProfile() }));
    return r.photo;
  }

  async removePhoto() {
    await this.api('/api/me/photo', { method: 'DELETE' });
    const p = { ...this.getProfile() };
    delete p.photo;
    store.set(`profile:${this.profileKey()}`, p);
    this.dispatchEvent(new CustomEvent('profile', { detail: p }));
  }

}

export const auth = new Auth();

/** 0–4 strength score with a friendly label (shown while choosing a password). */
export function passwordStrength(pw, username = '') {
  if (!pw) return { score: 0, label: 'Type a password', emoji: '🌽' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < 8 || (username && pw.toLowerCase().includes(username.toLowerCase()))) score = Math.min(score, 1);
  return [
    { score: 0, label: 'Way too easy to crack', emoji: '🌽' },
    { score: 1, label: 'Still raw — make it longer', emoji: '🌽' },
    { score: 2, label: 'Warming up…', emoji: '♨️' },
    { score: 3, label: 'Sizzling! Pretty strong', emoji: '🔥' },
    { score: 4, label: 'Fully popped — super strong!', emoji: '🍿' },
  ][score];
}
