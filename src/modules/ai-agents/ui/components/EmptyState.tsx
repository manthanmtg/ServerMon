'use client';

import { Bot } from 'lucide-react';
import { memo } from 'react';

interface Props {
  label: string;
  description?: string;
}

function EmptyStateInner({
  label,
  description = "This agent hasn't generated any data for this category yet.",
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-xs">
      <div className="w-12 h-12 rounded-full bg-secondary/30 flex items-center justify-center mb-3">
        <Bot className="w-6 h-6 opacity-30" />
      </div>
      <p className="font-medium opacity-60">{label}</p>
      <p className="text-[10px] opacity-40 mt-1 max-w-[200px] text-center">{description}</p>
    </div>
  );
}

export const EmptyState = memo(EmptyStateInner);
