'use client';

export const dynamic = 'force-dynamic';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <main style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1.5rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              cursor: 'pointer',
            }}
            onFocus={(event) => {
              event.currentTarget.style.outline = '2px solid var(--ring)';
              event.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={(event) => {
              event.currentTarget.style.outline = 'none';
              event.currentTarget.style.outlineOffset = '';
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
