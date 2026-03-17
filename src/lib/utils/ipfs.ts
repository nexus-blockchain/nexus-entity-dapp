import { useIpfsGatewayStore } from '@/stores/ipfs-gateway-store';

const ENV_IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || '';

const NULLISH_IPFS_VALUES = new Set(['', 'null', 'none', 'undefined']);

function getGatewayBase(gateway?: string): string {
  let gw: string;

  if (gateway) {
    gw = gateway;
  } else if (ENV_IPFS_GATEWAY) {
    gw = ENV_IPFS_GATEWAY;
  } else {
    gw = useIpfsGatewayStore.getState().getActiveGateway();
  }

  return gw.endsWith('/') ? gw.slice(0, -1) : gw;
}

function stripLeadingIpfsPath(path: string): string {
  return path
    .replace(/^\/+/, '')
    .replace(/^ipfs\/+/i, '')
    .trim();
}

/**
 * Normalize an IPFS reference.
 *
 * Supported inputs:
 * - raw CID/path: `bafy...`, `Qm...`, `cid/file.png`
 * - protocol URI: `ipfs://bafy...`
 * - gateway URL: `https://gateway.example/ipfs/bafy...`
 * - direct absolute URL: `https://cdn.example/logo.png`
 */
export function normalizeIpfsReference(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (NULLISH_IPFS_VALUES.has(trimmed.toLowerCase())) return null;

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  if (/^ipfs:\/\//i.test(trimmed)) {
    const withoutProtocol = trimmed.replace(/^ipfs:\/\//i, '');
    const normalizedPath = stripLeadingIpfsPath(withoutProtocol);
    return normalizedPath || null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const ipfsIndex = url.pathname.toLowerCase().indexOf('/ipfs/');
      if (ipfsIndex >= 0) {
        const ipfsPath = url.pathname.slice(ipfsIndex + '/ipfs/'.length);
        const normalizedPath = stripLeadingIpfsPath(ipfsPath);
        if (!normalizedPath) return null;
        return `${normalizedPath}${url.search}${url.hash}`;
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }

  const normalizedPath = stripLeadingIpfsPath(trimmed);
  return normalizedPath || null;
}

/** Construct IPFS URL from CID, with automatic gateway selection */
export function ipfsUrl(cid: string, gateway?: string): string {
  const normalized = normalizeIpfsReference(cid);
  if (!normalized) return '';

  if (
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    /^https?:\/\//i.test(normalized)
  ) {
    return normalized;
  }

  return `${getGatewayBase(gateway)}/${normalized}`;
}
