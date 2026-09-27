import {
  hashInviteCode,
  normalizeInviteCode,
  type InviteRequestRateLimitOutcome,
} from './invite-policy.js';

export type InviteAccessConsumeOutcome =
  | { status: 'consumed'; alreadyConsented: boolean }
  | { status: 'invalid' }
  | { status: 'limited' }
  | Extract<InviteRequestRateLimitOutcome, { status: 'rate_limited' }>;

export interface InviteAccessStore {
  consumeForCode(input: {
    codeHash: string;
    consentVersion: string;
    ipHash: string;
    now?: Date;
  }): Promise<InviteAccessConsumeOutcome>;
}

export type InviteCheckOutcome =
  | { status: 'accepted'; alreadyConsented: boolean }
  | { status: 'invalid' }
  | { status: 'limited' }
  | Extract<InviteRequestRateLimitOutcome, { status: 'rate_limited' }>;

type InviteAccessServiceDependencies = {
  store: InviteAccessStore;
  secret: string;
  maxRequestsPerIp?: number;
};

type InviteCheckInput = {
  code: string;
  consentVersion: string;
  ipHash: string;
  now?: Date;
};

export class InviteAccessService {
  private readonly maxRequestsPerIp: number;

  constructor(private readonly dependencies: InviteAccessServiceDependencies) {
    this.maxRequestsPerIp = dependencies.maxRequestsPerIp ?? 20;
  }

  async check({
    code,
    consentVersion,
    ipHash,
    now = new Date(),
  }: InviteCheckInput): Promise<InviteCheckOutcome> {
    const normalized = normalizeInviteCode(code);
    if (!normalized) return { status: 'invalid' };
    if (!consentVersion.trim()) return { status: 'invalid' };

    const codeHash = hashInviteCode(this.dependencies.secret, normalized);
    const outcome = await this.dependencies.store.consumeForCode({
      codeHash,
      consentVersion,
      ipHash,
      now,
    });
    if (outcome.status === 'consumed') {
      return { status: 'accepted', alreadyConsented: outcome.alreadyConsented };
    }
    return outcome;
  }
}
