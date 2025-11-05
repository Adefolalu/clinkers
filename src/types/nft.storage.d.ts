declare module "nft.storage" {
  export class NFTStorage {
    constructor(options: { token: string });
    storeBlob(blob: Blob | File): Promise<string>;
  }
  export class File extends globalThis.File {}
}
