import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { DashboardPage } from './dashboard-client';
import type { EntityContext } from '@/lib/types/models';
import { EntityType, EntityStatus, GovernanceMode } from '@/lib/types/enums';
import messages from '../../../messages/en.json';

const mockUseEntityContext = vi.fn();
vi.mock('./entity-provider', () => ({
  useEntityContext: () => mockUseEntityContext(),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({ memberCount: 42, isLoading: false }),
}));
vi.mock('@/hooks/use-entity-token', () => ({
  useEntityToken: () => ({
    tokenConfig: null,
    holderCount: 0,
    isLoading: false,
  }),
}));
vi.mock('@/hooks/use-shops', () => ({
  useShops: () => ({ shops: [], isLoading: false }),
}));
vi.mock('@/hooks/use-entity-market', () => ({
  useEntityMarket: () => ({
    stats: null,
    orders: [],
    isLoading: false,
  }),
}));
vi.mock('@/hooks/use-governance', () => ({
  useGovernance: () => ({
    proposals: [],
    proposalCount: 0,
    isLoading: false,
  }),
}));
vi.mock('@/hooks/use-commission', () => ({
  useCommission: () => ({
    config: null,
    isLoading: false,
  }),
}));
vi.mock('@/stores/entity-dapp-store', () => ({
  useEntityDAppStore: (selector: (s: any) => any) =>
    selector({
      visibleModules: ['dashboard', 'settings', 'shops', 'orders', 'token', 'members'],
      notifications: [],
    }),
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function makeContext(overrides: Partial<EntityContext> = {}): EntityContext {
  return {
    entityId: 1,
    entity: {
      id: 1,
      owner: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      name: 'Test Entity',
      logoCid: null,
      descriptionCid: null,
      metadataUri: null,
      contactCid: null,
      status: EntityStatus.Active,
      entityType: EntityType.Merchant,
      governanceMode: GovernanceMode.None,
      verified: false,
      governanceLocked: false,
      fundBalance: BigInt('50000000000000'), // 50 NEX
      createdAt: 100,
    },
    isLoading: false,
    error: null,
    permissions: 0,
    isOwner: false,
    isReadOnly: false,
    isSuspended: false,
    entityType: EntityType.Merchant,
    governanceMode: GovernanceMode.None,
    ...overrides,
  };
}

describe('DashboardPage', () => {
  test('shows loading skeleton when isLoading is true', () => {
    mockUseEntityContext.mockReturnValue(makeContext({ isLoading: true, entity: null }));
    const { container } = renderWithIntl(<DashboardPage />);
    expect(screen.queryByText('Test Entity')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  test('renders entity name and type badge', () => {
    mockUseEntityContext.mockReturnValue(makeContext());
    renderWithIntl(<DashboardPage />);
    expect(screen.getByText('Test Entity')).toBeInTheDocument();
  });

  test('renders fund balance stat card', () => {
    mockUseEntityContext.mockReturnValue(makeContext());
    renderWithIntl(<DashboardPage />);
    expect(screen.getByText('Fund Balance')).toBeInTheDocument();
    expect(screen.getByText('50 NEX')).toBeInTheDocument();
  });

  test('shows fund warning when balance is below threshold', () => {
    const ctx = makeContext();
    ctx.entity = { ...ctx.entity!, fundBalance: BigInt('5000000000000') }; // 5 NEX < 10 NEX threshold
    mockUseEntityContext.mockReturnValue(ctx);
    renderWithIntl(<DashboardPage />);
    expect(
      screen.getByText('Fund balance is below the warning threshold. Please top up to avoid service disruption.'),
    ).toBeInTheDocument();
  });

  test('does not show fund warning when balance is above threshold', () => {
    mockUseEntityContext.mockReturnValue(makeContext()); // 50 NEX > 10 NEX
    renderWithIntl(<DashboardPage />);
    expect(
      screen.queryByText('Fund balance is below the warning threshold. Please top up to avoid service disruption.'),
    ).not.toBeInTheDocument();
  });

  test('renders stat cards for members and token', () => {
    mockUseEntityContext.mockReturnValue(makeContext());
    renderWithIntl(<DashboardPage />);
    expect(screen.getByText('Total Members')).toBeInTheDocument();
    expect(screen.getAllByText('Token').length).toBeGreaterThan(0);
  });

  test('formats zero balance correctly', () => {
    const ctx = makeContext();
    ctx.entity = { ...ctx.entity!, fundBalance: BigInt(0) };
    mockUseEntityContext.mockReturnValue(ctx);
    renderWithIntl(<DashboardPage />);
    expect(screen.getByText('0 NEX')).toBeInTheDocument();
  });

  test('formats balance with decimals correctly', () => {
    const ctx = makeContext();
    // 1.5 NEX = 1_500_000_000_000
    ctx.entity = { ...ctx.entity!, fundBalance: BigInt('1500000000000') };
    mockUseEntityContext.mockReturnValue(ctx);
    renderWithIntl(<DashboardPage />);
    expect(screen.getByText('1.5 NEX')).toBeInTheDocument();
  });

  test('renders module status grid for visible modules', () => {
    mockUseEntityContext.mockReturnValue(makeContext());
    renderWithIntl(<DashboardPage />);
    expect(screen.getByText('Available Modules')).toBeInTheDocument();
  });

  test('renders quick action links', () => {
    mockUseEntityContext.mockReturnValue(makeContext());
    renderWithIntl(<DashboardPage />);
    expect(screen.getByText('Manage Shops')).toBeInTheDocument();
    expect(screen.getByText('View Orders')).toBeInTheDocument();
    expect(screen.getByText('Member Management')).toBeInTheDocument();
    expect(screen.getByText('Token Management')).toBeInTheDocument();
  });
});
