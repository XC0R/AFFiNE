import type { FetchService } from '@affine/core/modules/cloud';
import {
  deleteBlobMutation,
  fetcher,
  listBlobsQuery,
  setBlobMutation,
  UserFriendlyError,
} from '@affine/graphql';
import type { BlobStorage } from '@toeverything/infra';
import { BlobStorageOverCapacity } from '@toeverything/infra';

import { bufferToBlob } from '../../utils/buffer-to-blob';

export class CloudBlobStorage implements BlobStorage {
  constructor(
    private readonly workspaceId: string,
    private readonly fetchService: FetchService
  ) {}

  name = 'cloud';
  readonly = false;

  async get(key: string) {
    const suffix = key.startsWith('/')
      ? key
      : `/api/workspaces/${this.workspaceId}/blobs/${key}`;

    return this.fetchService
      .fetch(suffix, {
        cache: 'default',
        headers: {
          Accept: 'application/octet-stream', // this is necessary for ios native fetch to return arraybuffer
        },
      })
      .then(async res => {
        if (!res.ok) {
          // status not in the range 200-299
          return null;
        }
        return bufferToBlob(await res.arrayBuffer());
      })
      .catch(() => {
        return null;
      });
  }

  async set(key: string, value: Blob) {
    // set blob will check blob size & quota
    return await fetcher({
      query: setBlobMutation,
      variables: {
        workspaceId: this.workspaceId,
        blob: new File([value], key),
      },
    })
      .then(res => res.setBlob)
      .catch(err => {
        const error = UserFriendlyError.fromAnyError(err);
        if (error.status === 413) {
          throw new BlobStorageOverCapacity(error);
        }

        throw err;
      });
  }

  async delete(key: string) {
    await fetcher({
      query: deleteBlobMutation,
      variables: {
        workspaceId: key,
        hash: key,
      },
    });
  }

  async list() {
    const result = await fetcher({
      query: listBlobsQuery,
      variables: {
        workspaceId: this.workspaceId,
      },
    });
    return result.listBlobs;
  }
}
