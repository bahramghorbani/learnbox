import { describe, expect, it } from 'vitest';

import {
  LearnerProfileService,
  type LearnerProfileRepository,
} from '../src/profile/learner-profile.service.js';

const userId = '2efaf676-84e4-45b1-8a13-50735a8df2c8';

describe('LearnerProfileService', () => {
  it('returns only a server-masked Iranian canonical phone', async () => {
    const repository: LearnerProfileRepository = {
      async findPhoneByUserId() {
        return '+989121234567';
      },
    };

    await expect(new LearnerProfileService(repository).readLearnerProfile(userId)).resolves.toEqual(
      {
        maskedPhone: '0912***4567',
      },
    );
  });

  it.each([null, '+98912123456', '09121234567', '+98912123x567'])(
    'withholds missing or malformed phone %s',
    async (phone) => {
      const repository: LearnerProfileRepository = {
        async findPhoneByUserId() {
          return phone;
        },
      };

      await expect(
        new LearnerProfileService(repository).readLearnerProfile(userId),
      ).resolves.toBeNull();
    },
  );
});
