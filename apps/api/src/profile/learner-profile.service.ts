export interface LearnerProfileRepository {
  findPhoneByUserId(userId: string): Promise<string | null>;
}

export interface LearnerProfile {
  maskedPhone: string;
}

export class LearnerProfileService {
  constructor(private readonly repository: LearnerProfileRepository) {}

  async readLearnerProfile(userId: string): Promise<LearnerProfile | null> {
    const phone = await this.repository.findPhoneByUserId(userId);
    const maskedPhone = phone === null ? null : maskIranianCanonicalPhone(phone);
    return maskedPhone === null ? null : { maskedPhone };
  }
}

function maskIranianCanonicalPhone(phone: string): string | null {
  const match = /^\+989(\d{2})\d{3}(\d{4})$/.exec(phone);
  return match ? `09${match[1]}***${match[2]}` : null;
}
