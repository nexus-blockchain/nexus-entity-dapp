'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useWallet } from './use-wallet';
import { STALE_TIMES } from '@/lib/chain/constants';
import { KycLevel, TokenType, TransferRestrictionMode } from '@/lib/types/enums';
import { decodeChainString } from '@/lib/utils/codec';
import type { TokenConfig, TokenDividendConfig } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

/** Unwrap Option<T> from Polkadot.js codec */
function unwrapOption(raw: unknown): unknown | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  return (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
}

function toPlainValue(raw: unknown): any {
  const unwrapped = unwrapOption(raw);
  if (unwrapped == null) return null;
  return (unwrapped as { toJSON?: () => unknown }).toJSON?.() ?? unwrapped;
}

function parseBigIntValue(raw: unknown): bigint {
  return BigInt(String(raw ?? 0));
}

export const ENTITY_TOKEN_ASSET_OFFSET = 1_000_000;

export function getEntityTokenAssetId(entityId: number): number {
  return ENTITY_TOKEN_ASSET_OFFSET + entityId;
}

function parseTokenDividendConfig(raw: unknown): TokenDividendConfig | null {
  const value = toPlainValue(raw);
  if (value == null) return null;
  if (typeof value === 'boolean') {
    return { enabled: value, minPeriod: 0 };
  }
  if (typeof value !== 'object') {
    return null;
  }

  const obj = value as Record<string, unknown>;
  return {
    enabled: Boolean(obj.enabled ?? true),
    minPeriod: Number(obj.minPeriod ?? obj.min_period ?? 0),
  };
}

function parseAssetInfo(raw: unknown): { supply: bigint; accounts: number } | null {
  const value = toPlainValue(raw);
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  return {
    supply: parseBigIntValue(obj.supply ?? 0),
    accounts: Number(obj.accounts ?? 0),
  };
}

function parseAssetBalance(raw: unknown): bigint {
  const value = toPlainValue(raw);
  if (value == null) return BigInt(0);
  if (typeof value !== 'object') return parseBigIntValue(value);
  const obj = value as Record<string, unknown>;
  return parseBigIntValue(
    obj.balance ??
    obj.free ??
    obj.amount ??
    obj.total ??
    0,
  );
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
  assetSupply: bigint | null,
): TokenConfig | null {
  const cfg = toPlainValue(rawConfig) as Record<string, unknown> | null;
  if (!cfg) return null;

  // Metadata is a tuple (name, symbol, decimals) or an object
  let name = '';
  let symbol = '';
  let decimals = 0;
  const meta = toPlainValue(rawMetadata);
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
    totalSupply: parseBigIntValue(cfg.totalSupply ?? cfg.total_supply ?? assetSupply ?? 0),
    maxSupply: parseBigIntValue(cfg.maxSupply ?? cfg.max_supply ?? 0),
    transferRestriction: String(cfg.transferRestriction ?? cfg.transfer_restriction ?? 'None') as TransferRestrictionMode,
    enabled: Boolean(cfg.enabled ?? true),
    rewardRate: Number(cfg.rewardRate ?? cfg.reward_rate ?? 0),
    exchangeRate: Number(cfg.exchangeRate ?? cfg.exchange_rate ?? 0),
    minRedeem: parseBigIntValue(cfg.minRedeem ?? cfg.min_redeem ?? 0),
    maxRedeemPerOrder: parseBigIntValue(cfg.maxRedeemPerOrder ?? cfg.max_redeem_per_order ?? 0),
    transferable: Boolean(cfg.transferable ?? true),
    createdAt: Number(cfg.createdAt ?? cfg.created_at ?? 0),
    dividendConfig: parseTokenDividendConfig(cfg.dividendConfig ?? cfg.dividend_config),
    minReceiverKyc: Number(cfg.minReceiverKyc ?? cfg.min_receiver_kyc ?? 0) as KycLevel,
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
  const assetId = getEntityTokenAssetId(entityId);

  // Query token config (from EntityTokenConfigs + EntityTokenMetadata)
  const tokenConfigQuery = useEntityQuery<TokenConfig | null>(
    ['entity', entityId, 'token'],
    async (api) => {
      if (!hasPallet(api, 'entityToken')) return null;
      const pallet = (api.query as any).entityToken;
      const configFn = pallet.entityTokenConfigs;
      if (!configFn) return null;
      const metadataFn = pallet.entityTokenMetadata;
      const assetInfoFn = (api.query as any).assets?.asset;
      const [rawConfig, rawMetadata, rawAssetInfo] = await Promise.all([
        configFn(entityId),
        metadataFn ? metadataFn(entityId) : Promise.resolve(null),
        assetInfoFn ? assetInfoFn(assetId) : Promise.resolve(null),
      ]);
      return parseTokenConfig(rawConfig, rawMetadata, entityId, parseAssetInfo(rawAssetInfo)?.supply ?? null);
    },
    { staleTime: STALE_TIMES.token },
  );

  const assetInfoQuery = useEntityQuery<{ supply: bigint; accounts: number } | null>(
    ['entity', entityId, 'token', 'assetInfo'],
    async (api) => {
      const fn = (api.query as any).assets?.asset;
      if (!fn) return null;
      const raw = await fn(assetId);
      return parseAssetInfo(raw);
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
      if (!address) return BigInt(0);
      const fn = (api.query as any).assets?.account;
      if (!fn) return BigInt(0);
      const raw = await fn(assetId, address);
      return parseAssetBalance(raw);
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

  const transferTokens = useEntityMutation('entityToken', 'transferTokens', {
    invalidateKeys: [
      ['entity', entityId, 'token'],
      ['entity', entityId, 'token', 'holders'],
      ['entity', entityId, 'token', 'myBalance', address],
    ],
  });

  return {
    assetId,
    tokenConfig: tokenConfigQuery.data ?? null,
    holderCount: assetInfoQuery.data?.accounts ?? 0,
    holderListAvailable: false,
    holders: [],
    whitelist: whitelistQuery.data ?? [],
    blacklist: blacklistQuery.data ?? [],
    myTokenBalance: myTokenBalanceQuery.data ?? BigInt(0),
    isLoading: tokenConfigQuery.isLoading || assetInfoQuery.isLoading,
    error: tokenConfigQuery.error ?? assetInfoQuery.error,
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
