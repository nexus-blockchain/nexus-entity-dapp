import { useIpfsGatewayStore } from '@/stores/ipfs-gateway-store';

const ENV_IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || '';

/** Construct IPFS URL from CID, with automatic gateway selection */
export function ipfsUrl(cid: string, gateway?: string): string {
  let gw: string;

  if (gateway) {
    gw = gateway;
  } else if (ENV_IPFS_GATEWAY) {
    gw = ENV_IPFS_GATEWAY;
  } else {
    gw = useIpfsGatewayStore.getState().getActiveGateway();
  }

  // Remove trailing slash from gateway
  const base = gw.endsWith('/') ? gw.slice(0, -1) : gw;
  return `${base}/${cid}`;
}
