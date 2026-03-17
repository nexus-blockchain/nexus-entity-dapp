import { describe, it, expect } from 'vitest';
import { generateEventSummary, filterEntityEvent, ENTITY_EVENT_CONFIGS } from './use-entity-events';

function mockEventRecord(section: string, method: string, entityId: number): any {
  return {
    event: {
      section,
      method,
      data: [
        {
          toString: () => String(entityId),
        },
      ],
    },
  };
}

describe('generateEventSummary', () => {
  it('returns a known summary for EntityRegistry.EntitySuspendedLowFund', () => {
    expect(generateEventSummary('entityRegistry', 'EntitySuspendedLowFund')).toBe('Entity suspended due to low funds');
  });

  it('returns a known summary for entityTransaction.OrderPlaced', () => {
    expect(generateEventSummary('entityTransaction', 'OrderPlaced')).toBe('A new order has been placed');
  });

  it('returns fallback for unknown pallet/event', () => {
    expect(generateEventSummary('unknownPallet', 'UnknownEvent')).toBe('unknownPallet.UnknownEvent');
  });

  it('returns non-empty string for wildcard pallets', () => {
    for (const config of ENTITY_EVENT_CONFIGS) {
      const eventName = config.events[0] === '*' ? 'DummyEvent' : config.events[0];
      expect(generateEventSummary(config.pallet, eventName).length).toBeGreaterThan(0);
    }
  });
});

describe('filterEntityEvent', () => {
  it('matches an event with correct pallet and entityId', () => {
    const result = filterEntityEvent(mockEventRecord('entityShop', 'Anything', 42), 42);
    expect(result).not.toBeNull();
    expect(result?.config.pallet).toBe('entityShop');
    expect(result?.eventName).toBe('Anything');
  });

  it('returns null when entityId does not match', () => {
    expect(filterEntityEvent(mockEventRecord('entityShop', 'Anything', 99), 42)).toBeNull();
  });

  it('returns null for unknown pallet', () => {
    expect(filterEntityEvent(mockEventRecord('unknownPallet', 'Anything', 42), 42)).toBeNull();
  });

  it('matches every configured pallet', () => {
    const matchedPallets = new Set<string>();
    for (const config of ENTITY_EVENT_CONFIGS) {
      const result = filterEntityEvent(mockEventRecord(config.pallet, 'DynamicEvent', 7), 7);
      if (result) matchedPallets.add(result.config.pallet);
    }
    expect(matchedPallets.size).toBe(ENTITY_EVENT_CONFIGS.length);
  });
});

describe('ENTITY_EVENT_CONFIGS', () => {
  it('covers real runtime pallets used by batch C/E pages', () => {
    const pallets = ENTITY_EVENT_CONFIGS.map((config) => config.pallet);
    expect(pallets).toContain('entityTransaction');
    expect(pallets).toContain('entityMember');
    expect(pallets).toContain('entityGovernance');
    expect(pallets).toContain('entityKyc');
    expect(pallets).toContain('entityDisclosure');
    expect(pallets).toContain('commissionCore');
    expect(pallets).toContain('commissionReferral');
    expect(pallets).toContain('commissionPoolReward');
  });

  it('each config has at least one event matcher', () => {
    for (const config of ENTITY_EVENT_CONFIGS) {
      expect(config.events.length).toBeGreaterThan(0);
    }
  });

  it('each config has a filter function', () => {
    for (const config of ENTITY_EVENT_CONFIGS) {
      expect(typeof config.filter).toBe('function');
    }
  });

  it('each config returns non-empty invalidate keys', () => {
    for (const config of ENTITY_EVENT_CONFIGS) {
      const keys = config.invalidateKeys(1, mockEventRecord(config.pallet, 'DynamicEvent', 1));
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(key.length).toBeGreaterThan(0);
      }
    }
  });

  it('invalidate keys include entityId for entity-scoped pallets', () => {
    const entityId = 123;
    for (const config of ENTITY_EVENT_CONFIGS) {
      const keys = config.invalidateKeys(entityId, mockEventRecord(config.pallet, 'DynamicEvent', entityId));
      for (const key of keys) {
        if (config.pallet === 'entityRegistry' || config.pallet.startsWith('entity') || config.pallet.startsWith('commission')) {
          expect(key).toContain(entityId);
        }
      }
    }
  });
});
