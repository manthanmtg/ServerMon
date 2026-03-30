'use client';

export function ResizeHandle({
  onDrag,
  onDragStart,
  onDragEnd,
}: {
  onDrag: (clientX: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    onDragStart?.();

    const onMouseMove = (ev: MouseEvent) => {
      onDrag(ev.clientX);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onDragEnd?.();
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      className="hidden lg:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center hover:bg-primary/20 active:bg-primary/30 transition-colors group z-20 relative"
      onMouseDown={handleMouseDown}
    >
      <div className="w-[1.5px] h-12 rounded-full bg-border/60 group-hover:bg-primary/50 group-active:bg-primary transition-all duration-300" />
      <div className="absolute inset-y-0 -left-1 -right-1 bg-primary/0 group-hover:bg-primary/5 transition-colors" />
    </div>
  );
}
