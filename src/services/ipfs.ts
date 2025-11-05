const PINATA_FILE_ENDPOINT = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_JSON_ENDPOINT = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function getPinataJwt(): string {
  const token = import.meta.env.VITE_PINATA_JWT as string | undefined;
  if (!token) {
    throw new Error("Missing VITE_PINATA_JWT for IPFS uploads");
  }
  return token;
}

export async function blobFromUrl(url: string): Promise<Blob> {
  if (url.startsWith("data:")) {
    const res = await fetch(url);
    return await res.blob();
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  return await res.blob();
}

export async function uploadImageBlob(
  blob: Blob,
  filename = "mutated.png"
): Promise<string> {
  const jwt = getPinataJwt();
  const form = new FormData();
  form.append("file", blob, filename);

  const res = await fetch(PINATA_FILE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata image upload failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const cid: string | undefined = json?.IpfsHash || json?.ipfsHash || json?.cid;
  const gatewayBase = import.meta.env.VITE_PINATA_GATEWAY_DOMAIN as
    | string
    | undefined;
  const url = gatewayBase
    ? `https://${gatewayBase}/ipfs/${cid}`
    : `https://gateway.pinata.cloud/ipfs/${cid}`;
  if (!cid) throw new Error("Invalid Pinata response (missing CID)");
  return url;
}

export interface MetadataInput {
  name: string;
  description: string;
  image: string; // ipfs://...
  attributes?: Array<{ trait_type: string; value: string }>;
  properties?: Record<string, any>;
}

export async function uploadMetadata(metadata: MetadataInput): Promise<string> {
  const jwt = getPinataJwt();
  const payload = {
    pinataContent: metadata,
    pinataMetadata: {
      name: `${metadata.name}-metadata.json`,
    },
  };

  const res = await fetch(PINATA_JSON_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata metadata upload failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const cid: string | undefined = json?.IpfsHash || json?.ipfsHash || json?.cid;
  const gatewayBase = import.meta.env.VITE_PINATA_GATEWAY_DOMAIN as
    | string
    | undefined;
  const url = gatewayBase
    ? `https://${gatewayBase}/ipfs/${cid}`
    : `https://gateway.pinata.cloud/ipfs/${cid}`;
  if (!cid) throw new Error("Invalid Pinata response (missing CID)");
  return url;
}
