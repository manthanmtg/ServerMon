import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './card';
import { describe, it, expect } from 'vitest';

describe('Card Components', () => {
  it('renders a full card with all sections', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Card Content</p>
        </CardContent>
      </Card>
    );

    expect(screen.getByText('Card Title')).toBeDefined();
    expect(screen.getByText('Card Description')).toBeDefined();
    expect(screen.getByText('Card Content')).toBeDefined();
  });

  it('applies custom classNames to components', () => {
    render(
      <Card className="custom-card">
        <CardHeader className="custom-header">
          <CardTitle className="custom-title">Title</CardTitle>
        </CardHeader>
      </Card>
    );

    const card = screen.getByText('Title').closest('.custom-card');
    const header = screen.getByText('Title').closest('.custom-header');
    
    expect(card).toBeDefined();
    expect(header).toBeDefined();
    expect(screen.getByText('Title').className).toContain('custom-title');
  });
});
