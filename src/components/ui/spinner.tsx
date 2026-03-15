interface SpinnerProps {
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'h-4 w-4 border-[1.5px]',
  default: 'h-5 w-5 border-2',
  lg: 'h-8 w-8 border-2',
};

function Spinner({ size = 'default', className }: SpinnerProps) {
  return (
    <div
      className={`animate-spin rounded-full border-muted-foreground/30 border-t-primary ${sizeMap[size]} ${className || ''}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export { Spinner };
export type { SpinnerProps };
