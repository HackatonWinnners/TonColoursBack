const toIsoString = () => new Date().toISOString();

export class TelegramSessionStore {
  constructor() {
    this.sessions = new Map();
  }

  upsertUser(user) {
    if (!user || typeof user.id !== 'number') {
      throw new Error('Cannot upsert Telegram user without a numeric id');
    }

    const existing = this.sessions.get(user.id);
    const now = toIsoString();
    if (existing) {
      const patched = {
        ...existing,
        username: user.username ?? existing.username ?? null,
        firstName: user.first_name ?? existing.firstName ?? null,
        lastName: user.last_name ?? existing.lastName ?? null,
        languageCode: user.language_code ?? existing.languageCode ?? null,
        lastInteractionAt: now,
        updatedAt: now,
      };
      this.sessions.set(user.id, patched);
      return patched;
    }

    const created = {
      userId: user.id,
      username: user.username ?? null,
      firstName: user.first_name ?? null,
      lastName: user.last_name ?? null,
      languageCode: user.language_code ?? null,
      walletAddress: null,
      lastColor: null,
      lastMint: null,
      totalMints: 0,
      createdAt: now,
      updatedAt: now,
      lastInteractionAt: now,
    };
    this.sessions.set(user.id, created);
    return created;
  }

  touch(userId) {
    const session = this.sessions.get(userId);
    const now = toIsoString();
    if (session) {
      const patched = {
        ...session,
        lastInteractionAt: now,
        updatedAt: now,
      };
      this.sessions.set(userId, patched);
      return patched;
    }
    const created = {
      userId,
      username: null,
      firstName: null,
      lastName: null,
      languageCode: null,
      walletAddress: null,
      lastColor: null,
      lastMint: null,
      totalMints: 0,
      createdAt: now,
      updatedAt: now,
      lastInteractionAt: now,
    };
    this.sessions.set(userId, created);
    return created;
  }

  get(userId) {
    return this.sessions.get(userId) ?? null;
  }

  setWallet(userId, walletAddress) {
    if (!this.sessions.has(userId)) {
      this.touch(userId);
    }
    const now = toIsoString();
    const session = this.sessions.get(userId);
    const patched = {
      ...session,
      walletAddress: walletAddress ?? null,
      updatedAt: now,
    };
    this.sessions.set(userId, patched);
    return patched;
  }

  setLastColor(userId, color) {
    if (!this.sessions.has(userId)) {
      this.touch(userId);
    }
    const now = toIsoString();
    const session = this.sessions.get(userId);
    const patched = {
      ...session,
      lastColor: color ?? null,
      updatedAt: now,
    };
    this.sessions.set(userId, patched);
    return patched;
  }

  recordMint(userId, mintSummary) {
    if (!this.sessions.has(userId)) {
      this.touch(userId);
    }
    const now = toIsoString();
    const session = this.sessions.get(userId);
    const mintedAt = mintSummary?.mintedAt ?? mintSummary?.timestamp ?? now;
    const summary = {
      itemIndex: mintSummary?.itemIndex ?? null,
      metadataUri: mintSummary?.metadataUri ?? null,
      nftAddress: mintSummary?.nftAddress ?? null,
      color: mintSummary?.color ?? null,
      ownerAddress: mintSummary?.ownerAddress ?? null,
      mintedAt,
      timestamp: mintSummary?.timestamp ?? mintedAt ?? now,
      source: mintSummary?.source ?? null,
    };
    const patched = {
      ...session,
      lastMint: summary,
      lastColor: summary.color ?? session.lastColor ?? null,
      totalMints: (session.totalMints ?? 0) + 1,
      updatedAt: now,
    };
    this.sessions.set(userId, patched);
    return patched;
  }

  all() {
    return Array.from(this.sessions.values());
  }

  clear() {
    this.sessions.clear();
  }
}

export function createTelegramSessionStore() {
  return new TelegramSessionStore();
}

export default TelegramSessionStore;
