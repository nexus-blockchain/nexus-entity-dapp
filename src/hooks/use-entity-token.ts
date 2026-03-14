'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useWallet } from './use-wallet';
import { STALE_TIMES } from '@/lib/chain/constants';
import { TokenType, TransferRestrictionMode } from '@/lib/types/enums';
import { decodeChainString } from '@/lib/utils/codec';
import type { TokenConfig } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

/** Unwrap Option<T> from Polkadot.js codec */
function unwrapOption(raw: unknown): unknown | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  return (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
}

/**
 * Parse token config from chain storage.
 * Chain stores config and metadata separately:
 *  - EntityTokenConfigs: { enabled, reward_rate, exchange_rate, token_type, max_supply, transfer_restriction, ... }
 *  - EntityTokenMetadata: (name, symbol, decimals)
 */
function parseTokenConfig(
  rawConfig: unknown,
  rawMetadata: unknown,
  entityId: number,
): TokenConfig | null {
  const config = unwrapOption(rawConfig);
  if (!config) return null;
  const cfg = config as Record<string, unknown>;

  // Metadata is a tuple (name, symbol, decimals) or an object
  let name = '';
  let symbol = '';
  let decimals = 0;
  const meta = unwrapOption(rawMetadata);
  if (meta) {
    if (Array.isArray(meta)) {
      // Codec tuple: [name, symbol, decimals]
      name = decodeChainString(meta[0]);
      symbol = decodeChainString(meta[1]);
      decimals = Number(meta[2] ?? 0);
    } else {
      const m = meta as Record<string, unknown>;
      name = decodeChainString(m.name ?? m[0]);
      symbol = decodeChainString(m.symbol ?? m[1]);
      decimals = Number(m.decimals ?? m[2] ?? 0);
    }
  }

  return {
    entityId,
    name,
    symbol,
    decimals,
    tokenType: String(cfg.tokenType ?? cfg.token_type ?? 'Points') as TokenType,
    totalSupply: BigInt(String(cfg.totalSupply ?? cfg.total_supply ?? 0)),
    maxSupply: BigInt(String(cfg.maxSupply ?? cfg.max_supply ?? 0)),
    transferRestriction: String(cfg.transferRestriction ?? cfg.transfer_restriction ?? 'None') as TransferRestrictionMode,
    holderCount: Number(cfg.holderCount ?? cfg.holder_count ?? 0),
  };
}

// ─── Token Rights Labels ────────────────────────────────────

const TOKEN_RIGHTS_MAP: Record<TokenType, string> = {
  [TokenType.Points]: '消费奖励',
  [TokenType.Governance]: '投票权',
  [TokenType.Equity]: '分红权（证券类）',
  [TokenType.Membership]: '会员资格',
  [TokenType.Share]: '基金份额（证券类）',
  [TokenType.Bond]: '固定收益（证券类）',
  [TokenType.Hybrid]: '混合型',
};

export function getTokenRightsLabel(tokenType: TokenType): string {
  return TOKEN_RIGHTS_MAP[tokenType] ?? tokenType;
}

// ─── Hook ───────────────────────────────────────────────────

export function useEntityToken() {
  const { entityId } = useEntityContext();
  const { address } = useWallet();

  // Query token config (from EntityTokenConfigs + EntityTokenMetadata)
  const tokenConfigQuery = useEntityQuery<TokenConfig | null>(
    ['entity', entityId, 'token'],
    async (api) => {
      if (!hasPallet(api, 'entityToken')) return null;
      const pallet = (api.query as any).entityToken;
      const configFn = pallet.entityTokenConfigs ?? pallet.tokenConfigs ?? pallet.tokenConfig ?? pallet.tokens;
      if (!configFn) return null;
      const metadataFn = pallet.entityTokenMetadata ?? pallet.tokenMetadata;
      const [rawConfig, rawMetadata] = await Promise.all([
        configFn(entityId),
        metadataFn ? metadataFn(entityId) : Promise.resolve(null),
      ]);
      return parseTokenConfig(rawConfig, rawMetadata, entityId);
    },
    { staleTime: STALE_TIMES.token },
  );

  // Query holder count
  const holderCountQuery = useEntityQuery<number>(
    ['entity', entityId, 'token', 'holderCount'],
    async (api) => {
      if (!hasPallet(api, 'entityToken')) return 0;
      const fn = (api.query as any).entityToken.tokenHolderCount ?? (api.query as any).entityToken.holderCount;
      if (!fn) return 0;
      const raw = await fn(entityId);
      return Number(raw?.toString() ?? 0);
    },
    { staleTime: STALE_TIMES.token },
  );

  // Query holders list
  const holdersQuery = useEntityQuery<{ account: string; balance: bigint }[]>(
    ['entity', entityId, 'token', 'holders'],
    async (api) => {
      if (!hasPallet(api, 'entityToken')) return [];
      const storageFn = (api.query as any).entityToken.tokenHolders ?? (api.query as any).entityToken.holders;
      if (!storageFn?.entries) return [];
      try {
        const raw = await storageFn.entries(entityId);
        if (!raw || !Array.isArray(raw)) return [];
        return raw.map(([key, value]: [any, any]) => ({
          account: key.args[1]?.toString() ?? key.args[0]?.toString() ?? '',
          balance: BigInt(String(value?.toString() ?? 0)),
        }));
      } catch {
        // Fallback: single-key StorageMap, iterate all and filter
        const raw = await storageFn.entries();
        if (!raw || !Array.isArray(raw)) return [];
        return raw
          .filter(([, value]: [any, any]) => {
            const obj = value?.toJSON?.() ?? value;
            return Number(obj.entityId ?? obj.entity_id ?? 0) === entityId;
          })
          .map(([key, value]: [any, any]) => ({
            account: key.args[1]?.toString() ?? key.args[0]?.toString() ?? '',
            balance: BigInt(String(value?.toString() ?? 0)),
          }));
      }
    },
    { staleTime: STALE_TIMES.token },
  );

  // Query whitelist
  const whitelistQuery = useEntityQuery<string[]>(
    ['entity', entityId, 'token', 'whitelist'],
    async (api) => {
      if (!hasPallet(api, 'entityToken')) return [];
      const storageFn = (api.query as any).entityToken.transferWhitelist;
      if (!storageFn?.entries) return [];
      try {
        const raw = await storageFn.entries(entityId);
        if (!raw || !Array.isArray(raw)) return [];
        return raw.map(([key]: [any]) => key.args[1]?.toString() ?? key.args[0]?.toString() ?? '');
      } catch {
        return [];
      }
    },
    { staleTime: STALE_TIMES.token },
  );

  // Query blacklist
  const blacklistQuery = useEntityQuery<string[]>(
    ['entity', entityId, 'token', 'blacklist'],
    async (api) => {
      if (!hasPallet(api, 'entityToken')) return [];
      const storageFn = (api.query as any).entityToken.transferBlacklist;
      if (!storageFn?.entries) return [];
      try {
        const raw = await storageFn.entries(entityId);
        if (!raw || !Array.isArray(raw)) return [];
        return raw.map(([key]: [any]) => key.args[1]?.toString() ?? key.args[0]?.toString() ?? '');
      } catch {
        return [];
      }
    },
    { staleTime: STALE_TIMES.token },
  );

  // Query my token balance
  const myTokenBalanceQuery = useEntityQuery<bigint>(
    ['entity', entityId, 'token', 'myBalance', address],
    async (api) => {
      if (!hasPallet(api, 'entityToken')) return BigInt(0);
      if (!address) return BigInt(0);
      const fn = (api.query as any).entityToken.tokenHolders ?? (api.query as any).entityToken.holders;
      if (!fn) return BigInt(0);
      const raw = await fn(entityId, address);
      return BigInt(String(raw?.toString() ?? 0));
    },
    { staleTime: STALE_TIMES.token, enabled: !!address },
  );

  // ─── Mutations ──────────────────────────────────────────

  const mintTokens = useEntityMutation('entityToken', 'mintTokens', {
    invalidateKeys: [['entity', entityId, 'token']],
  });

  const burnTokens = useEntityMutation('entityToken', 'burnTokens', {
    invalidateKeys: [['entity', entityId, 'token']],
    confirmDialog: {
      title: '确认销毁代币',
      description: '代币销毁是不可逆操作，销毁后无法恢复。请确认您要销毁指定数量的代币。',
      severity: 'danger',
    },
  });

  const setTransferRestriction = useEntityMutation('entityToken', 'setTransferRestriction', {
    invalidateKeys: [['entity', entityId, 'token']],
  });

  const addToWhitelist = useEntityMutation('entityToken', 'addToWhitelist', {
    invalidateKeys: [['entity', entityId, 'token', 'whitelist']],
  });

  const removeFromWhitelist = useEntityMutation('entityToken', 'removeFromWhitelist', {
    invalidateKeys: [['entity', entityId, 'token', 'whitelist']],
  });

  const addToBlacklist = useEntityMutation('entityToken', 'addToBlacklist', {
    invalidateKeys: [['entity', entityId, 'token', 'blacklist']],
  });

  const removeFromBlacklist = useEntityMutation('entityToken', 'removeFromBlacklist', {
    invalidateKeys: [['entity', entityId, 'token', 'blacklist']],
  });

  const createToken = useEntityMutation('entityToken', 'createShopToken', {
    invalidateKeys: [['entity', entityId, 'token']],
  });

  const transferTokens = useEntityMutation('entityToken', 'transfer', {
    invalidateKeys: [
      ['entity', entityId, 'token'],
      ['entity', entityId, 'token', 'holders'],
      ['entity', entityId, 'token', 'myBalance', address],
    ],
  });

  return {
    tokenConfig: tokenConfigQuery.data ?? null,
    holderCount: holderCountQuery.data ?? 0,
    holders: holdersQuery.data ?? [],
    whitelist: whitelistQuery.data ?? [],
    blacklist: blacklistQuery.data ?? [],
    myTokenBalance: myTokenBalanceQuery.data ?? BigInt(0),
    isLoading: tokenConfigQuery.isLoading,
    error: tokenConfigQuery.error,
    createToken,
    mintTokens,
    burnTokens,
    setTransferRestriction,
    addToWhitelist,
    removeFromWhitelist,
    addToBlacklist,
    removeFromBlacklist,
    transferTokens,
  };
}
