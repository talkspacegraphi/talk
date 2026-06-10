import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Avatar from '../components/Avatar';

describe('Avatar', () => {
  it('renders initials when no src provided', () => {
    render(<Avatar name="John Doe" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders image when src provided', () => {
    render(<Avatar name="John" src="/avatar.jpg" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/avatar.jpg');
    expect(img).toHaveAttribute('alt', 'John');
  });

  it('renders online indicator when online prop is true', () => {
    const { container } = render(<Avatar name="John" online />);
    const dot = container.querySelector('.bg-emerald-500');
    expect(dot).toBeInTheDocument();
  });

  it('renders offline indicator when online prop is false', () => {
    const { container } = render(<Avatar name="John" online={false} />);
    const dot = container.querySelector('.bg-zinc-500');
    expect(dot).toBeInTheDocument();
  });

  it('applies correct size class', () => {
    const { container } = render(<Avatar name="John" size="lg" />);
    const el = container.querySelector('.w-12');
    expect(el).toBeInTheDocument();
  });
});
