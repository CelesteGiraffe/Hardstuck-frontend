import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import OfflineBanner from '../OfflineBanner.svelte';

describe('OfflineBanner', () => {
  it('reveals the message when the API is offline', () => {
    render(OfflineBanner, { message: 'Server unreachable' });

  expect(screen.getByRole('status')).toBeTruthy();
  expect(screen.getByText('Server unreachable')).toBeTruthy();
  });

  it('renders nothing when there is no message', () => {
    const { container } = render(OfflineBanner, { message: null });

    expect(container.childElementCount).toBe(0);
    expect(container.textContent?.trim()).toBe('');
  });
});
