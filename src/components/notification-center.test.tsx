import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test-setup';
import React from 'react';
import { NotificationCenter } from './notification-center';
import type { Notification } from '@/lib/types/models';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'test-1',
    pallet: 'entityShop',
    event: 'ShopCreated',
    summary: 'A new shop has been created',
    timestamp: Date.now() - 60_000,
    read: false,
    ...overrides,
  };
}

describe('NotificationCenter', () => {
  it('renders bell button', () => {
    render(
      <NotificationCenter
        notifications={[]}
        unreadCount={0}
        onMarkAsRead={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
  });

  it('shows unread badge when unreadCount > 0', () => {
    render(
      <NotificationCenter
        notifications={[makeNotification()]}
        unreadCount={3}
        onMarkAsRead={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('3');
  });

  it('does not show badge when unreadCount is 0', () => {
    render(
      <NotificationCenter
        notifications={[]}
        unreadCount={0}
        onMarkAsRead={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });

  it('shows 99+ when unreadCount exceeds 99', () => {
    render(
      <NotificationCenter
        notifications={[]}
        unreadCount={150}
        onMarkAsRead={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('99+');
  });

  it('toggles panel open/closed on bell click', () => {
    render(
      <NotificationCenter
        notifications={[]}
        unreadCount={0}
        onMarkAsRead={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notification-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument();
  });

  it('shows empty state when no notifications', () => {
    render(
      <NotificationCenter
        notifications={[]}
        unreadCount={0}
        onMarkAsRead={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notification-empty')).toBeInTheDocument();
  });

  it('renders notification items and mark-as-read button', () => {
    const onMarkAsRead = vi.fn();
    const notification = makeNotification({ id: 'n1', summary: 'Test notification' });
    render(
      <NotificationCenter
        notifications={[notification]}
        unreadCount={1}
        onMarkAsRead={onMarkAsRead}
        onClearAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByText('Test notification')).toBeInTheDocument();
    expect(screen.getByText('entityShop')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('notification-mark-read-n1'));
    expect(onMarkAsRead).toHaveBeenCalledWith('n1');
  });

  it('does not show mark-read button for already-read notifications', () => {
    render(
      <NotificationCenter
        notifications={[makeNotification({ id: 'n1', read: true })]}
        unreadCount={0}
        onMarkAsRead={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.queryByTestId('notification-mark-read-n1')).toBeNull();
  });

  it('calls onClearAll when clear all button is clicked', () => {
    const onClearAll = vi.fn();
    render(
      <NotificationCenter
        notifications={[makeNotification()]}
        unreadCount={1}
        onMarkAsRead={vi.fn()}
        onClearAll={onClearAll}
      />,
    );
    fireEvent.click(screen.getByTestId('notification-bell'));
    fireEvent.click(screen.getByTestId('notification-clear-all'));
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  it('uses design-token background classes for read state', () => {
    render(
      <NotificationCenter
        notifications={[
          makeNotification({ id: 'n1', read: false }),
          makeNotification({ id: 'n2', read: true, summary: 'Read notification' }),
        ]}
        unreadCount={1}
        onMarkAsRead={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notification-item-n1').className).toContain('bg-primary/5');
    expect(screen.getByTestId('notification-item-n2').className).toContain('bg-background');
  });
});
