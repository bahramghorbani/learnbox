import { del as vercelDel, put as vercelPut } from '@vercel/blob';

type PutOptions = {
  access: 'private';
  addRandomSuffix: false;
  contentType: 'image/webp';
  token: string;
};

type DeleteOptions = { token: string };

type PrivateBlobDependencies = {
  token: string;
  put?: (key: string, bytes: Buffer, options: PutOptions) => Promise<unknown>;
  del?: (key: string, options: DeleteOptions) => Promise<unknown>;
};

function assertSplashObjectKey(objectKey: string) {
  if (!/^admin\/splash\/[a-z0-9-]{3,64}\.webp$/.test(objectKey)) {
    throw new Error('Invalid private splash object key.');
  }
}

export function createPrivateSplashStorage(dependencies: PrivateBlobDependencies) {
  const put = dependencies.put ?? vercelPut;
  const del = dependencies.del ?? vercelDel;
  return {
    async upload(objectKey: string, bytes: Buffer, contentType: 'image/webp'): Promise<void> {
      assertSplashObjectKey(objectKey);
      await put(objectKey, bytes, {
        access: 'private',
        addRandomSuffix: false,
        contentType,
        token: dependencies.token,
      });
    },
    async delete(objectKey: string): Promise<void> {
      assertSplashObjectKey(objectKey);
      await del(objectKey, { token: dependencies.token });
    },
  };
}
