import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test-setup';
import React from 'react';
import { EntitySidebar, MODULE_CONFIGS, getVisibleMenuItems } from './entity-sidebar';
import type { ModuleKey } from '@/lib/utils/module-visibility';
import { EntityType, GovernanceMode } from '@/lib/types/enums';
import { AdminPermission } from '@/lib/types/models';
import { computeVisibleModules } from '@/lib/utils/module-visibility';

const mockUseEntityContext = vi.fn();
vi.mock('@/app/[entityId]/entity-provider', () => ({
  useEntityContext: () => mockUseEntityContext(),
}));

let mockSidebarCollapsed = false;
const mockToggleSidebar = vi.fn();
vi.mock('@/stores/entity-dapp-store', () => ({
  useEntityDAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    sidebarCollapsed: mockSidebarCollapsed,
    toggleSidebar: mockToggleSidebar,
    unreadCount: 0,
  }),
}));

let mockPathname = '/1';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string | number>) => {
    const translations: Record<string, Record<string, string>> = {
      nav: {
        dashboard: 'Dashboard',
        settings: 'Settings',
        shops: 'Shops',
        orders: 'Orders',
        token: 'Token',
        market: 'Market',
        members: 'Members',
        commission: 'Commission',
        governance: 'Governance',
        disclosure: 'Disclosure',
        kyc: 'KYC',
        tokensale: 'Token Sale',
        reviews: 'Reviews',
      },
      common: {
        selectShop: 'Select shop',
      },
      home: {
        connectWallet: 'Connect Wallet',
        noAccountsFound: 'No accounts found',
        connectFailed: 'Connect failed',
      },
    };
    if (namespace === 'home' && key === 'entityId') {
      return `Entity #${values?.entityId ?? ''}`;
    }
    return translations[namespace]?.[key] ?? key;
  },
}));

vi.mock('@/components/locale-switcher', () => ({ LocaleSwitcher: () => <div data-testid="locale-switcher" /> }));
vi.mock('@/components/node-health-indicator', () => ({ NodeHealthIndicator: () => <div data-testid="node-health" /> }));
vi.mock('@/components/wallet/desktop-wallet-dialog', () => ({ DesktopWalletDialog: () => null }));
vi.mock('@/lib/utils/platform', () => ({ isTauri: () => false }));
vi.mock('@/hooks/use-wallet', () => ({
  useWallet: () => ({
    address: '5FTestAddress1234567890',
    name: 'Test Wallet',
    isConnected: true,
    getAccounts: vi.fn().mockResolvedValue([]),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-external-queries', () => ({
  useNexBalance: () => ({
    data: { free: BigInt(0), reserved: BigInt(0), frozen: BigInt(0) },
    isLoading: false,
    isUnavailable: false,
    error: null,
  }),
}));
vi.mock('@/hooks/use-entity-token', () => ({
  useEntityToken: () => ({
    tokenConfig: null,
    myTokenBalance: BigInt(0),
    transferTokens: { mutate: vi.fn(), txState: { status: 'idle', hash: null, error: null, blockNumber: null } },
  }),
}));
vi.mock('@/hooks/use-entity-mutation', () => ({
  useEntityMutation: () => ({ mutate: vi.fn(), txState: { status: 'idle', hash: null, error: null, blockNumber: null } }),
}));

function makeEntityContext(overrides: Record<string, unknown> = {}) {
  return {
    entityId: 1,
    entity: null,
    isLoading: false,
    error: null,
    permissions: 0,
    isOwner: false,
    isReadOnly: false,
    isSuspended: false,
    entityType: EntityType.Enterprise,
    governanceMode: GovernanceMode.FullDAO,
    ...overrides,
  };
}

beforeEach(() => {
  mockSidebarCollapsed = false;
  mockToggleSidebar.mockClear();
  mockPathname = '/1';
});

describe('getVisibleMenuItems', () => {
  test('returns only items whose keys are in the visible modules list', () => {
    const visible: ModuleKey[] = ['dashboard', 'settings', 'shop', 'token'];
    expect(getVisibleMenuItems(visible).map((item) => item.key)).toEqual(['dashboard', 'settings', 'shop', 'token']);
  });

  test('excludes product from top-level menu even if visible', () => {
    const visible: ModuleKey[] = ['dashboard', 'product', 'shop'];
    expect(getVisibleMenuItems(visible).map((item) => item.key)).not.toContain('product');
  });

  test('returns empty array when no modules are visible', () => {
    expect(getVisibleMenuItems([])).toHaveLength(0);
  });

  test('preserves order from MODULE_CONFIGS', () => {
    const visible: ModuleKey[] = ['review', 'dashboard', 'governance'];
    expect(getVisibleMenuItems(visible).map((item) => item.key)).toEqual(['dashboard', 'governance', 'review']);
  });
});

describe('MODULE_CONFIGS', () => {
  test('every config has a non-empty label and icon', () => {
    for (const config of MODULE_CONFIGS) {
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.icon).toBeTruthy();
    }
  });

  test('dashboard href is empty string (maps to /[entityId])', () => {
    expect(MODULE_CONFIGS.find((config) => config.key === 'dashboard')?.href).toBe('');
  });

  test('settings requires ENTITY_MANAGE permission', () => {
    expect(MODULE_CONFIGS.find((config) => config.key === 'settings')?.permission).toBe(AdminPermission.ENTITY_MANAGE);
  });

  test('commission requires COMMISSION_MANAGE permission', () => {
    expect(MODULE_CONFIGS.find((config) => config.key === 'commission')?.permission).toBe(AdminPermission.COMMISSION_MANAGE);
  });
});

describe('EntityType-based menu filtering', () => {
  test('Fund entity hides shop, order, product, review', () => {
    const keys = getVisibleMenuItems(computeVisibleModules(EntityType.Fund, GovernanceMode.FullDAO)).map((item) => item.key);
    expect(keys).not.toContain('shop');
    expect(keys).not.toContain('order');
    expect(keys).not.toContain('product');
    expect(keys).not.toContain('review');
    expect(keys).toContain('token');
    expect(keys).toContain('governance');
  });

  test('Merchant entity shows shop, order, member, commission, token', () => {
    const keys = getVisibleMenuItems(computeVisibleModules(EntityType.Merchant, GovernanceMode.None)).map((item) => item.key);
    expect(keys).toContain('shop');
    expect(keys).toContain('order');
    expect(keys).toContain('member');
    expect(keys).toContain('commission');
    expect(keys).toContain('token');
  });

  test('GovernanceMode.None hides governance module', () => {
    const keys = getVisibleMenuItems(computeVisibleModules(EntityType.Merchant, GovernanceMode.None)).map((item) => item.key);
    expect(keys).not.toContain('governance');
  });

  test('GovernanceMode.FullDAO shows governance for DAO entity', () => {
    const keys = getVisibleMenuItems(computeVisibleModules(EntityType.DAO, GovernanceMode.FullDAO)).map((item) => item.key);
    expect(keys).toContain('governance');
  });
});

describe('EntitySidebar', () => {
  test('renders desktop sidebar with menu items for Enterprise entity', () => {
    mockUseEntityContext.mockReturnValue(makeEntityContext());
    render(<EntitySidebar />);
    expect(screen.getByTestId('desktop-sidebar')).toBeInTheDocument();
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shops').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Token').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Governance').length).toBeGreaterThan(0);
  });

  test('renders mobile bottom tab', () => {
    mockUseEntityContext.mockReturnValue(makeEntityContext());
    render(<EntitySidebar />);
    expect(screen.getByTestId('mobile-bottom-tab')).toBeInTheDocument();
  });

  test('highlights active dashboard item when on entity root path', () => {
    mockPathname = '/1';
    mockUseEntityContext.mockReturnValue(makeEntityContext());
    render(<EntitySidebar />);
    expect(screen.getAllByText('Dashboard')[0]?.closest('a')).toHaveAttribute('href', '/1');
  });

  test('highlights active item based on pathname', () => {
    mockPathname = '/1/shops';
    mockUseEntityContext.mockReturnValue(makeEntityContext());
    render(<EntitySidebar />);
    expect(screen.getAllByText('Shops')[0]?.closest('a')).toHaveAttribute('href', '/1/shops');
  });

  test('shows entity id in sidebar header', () => {
    mockUseEntityContext.mockReturnValue(makeEntityContext({ entityId: 42 }));
    render(<EntitySidebar />);
    expect(screen.getByText('Entity #42')).toBeInTheDocument();
  });

  test('toggle sidebar button calls toggleSidebar', () => {
    mockUseEntityContext.mockReturnValue(makeEntityContext());
    render(<EntitySidebar />);
    fireEvent.click(screen.getByLabelText('Collapse sidebar'));
    expect(mockToggleSidebar).toHaveBeenCalledTimes(1);
  });

  test('collapsed sidebar hides labels and shows only icons', () => {
    mockSidebarCollapsed = true;
    mockUseEntityContext.mockReturnValue(makeEntityContext());
    render(<EntitySidebar />);
    expect(screen.queryByText('Entity #1')).toBeNull();
    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument();
  });

  test('Fund entity does not show shop/order/review in sidebar', () => {
    mockUseEntityContext.mockReturnValue(makeEntityContext({ entityType: EntityType.Fund, governanceMode: GovernanceMode.FullDAO }));
    render(<EntitySidebar />);
    expect(screen.queryByText('Shops')).toBeNull();
    expect(screen.queryByText('Orders')).toBeNull();
    expect(screen.queryByText('Reviews')).toBeNull();
    expect(screen.getAllByText('Token').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Governance').length).toBeGreaterThan(0);
  });

  test('Merchant with GovernanceMode.None hides governance', () => {
    mockUseEntityContext.mockReturnValue(makeEntityContext({ entityType: EntityType.Merchant, governanceMode: GovernanceMode.None }));
    render(<EntitySidebar />);
    expect(screen.queryByText('Governance')).toBeNull();
    expect(screen.getAllByText('Shops').length).toBeGreaterThan(0);
  });

  test('links use correct entity-prefixed paths', () => {
    mockUseEntityContext.mockReturnValue(makeEntityContext({ entityId: 7 }));
    render(<EntitySidebar />);
    expect(screen.getAllByText('Settings')[0]?.closest('a')).toHaveAttribute('href', '/7/settings');
    expect(screen.getAllByText('Token')[0]?.closest('a')).toHaveAttribute('href', '/7/token');
  });
});
