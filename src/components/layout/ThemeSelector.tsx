'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { Check, ChevronDown, Moon, Sun, Zap, Palette, Cloud, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const themeIcons: Record<string, React.ElementType> = {
  'light-default': Sun,
  'dark-default': Moon,
  monokai: Terminal,
  'solarized-light': Palette,
  nord: Cloud,
  'synthwave-84': Zap,
};

export default function ThemeSelector() {
  const { theme, setTheme, availableThemes } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const CurrentIcon = themeIcons[theme.id] || Palette;

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 h-9 rounded-xl transition-all duration-300',
          isOpen
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
        )}
      >
        <CurrentIcon className="w-4 h-4" />
        <span className="text-xs font-bold hidden sm:inline tracking-tight">{theme.name}</span>
        <ChevronDown
          className={cn('w-3 h-3 transition-transform duration-300', isOpen && 'rotate-180')}
        />
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 p-1.5 z-50 rounded-2xl border border-white/5 bg-popover/80 backdrop-blur-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="px-2.5 py-2 mb-1 border-b border-border/30">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
              Interface Theme
            </p>
          </div>
          {availableThemes.map((t) => {
            const Icon = themeIcons[t.id] || Palette;
            const isActive = theme.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center justify-between p-2 rounded-xl text-xs font-medium transition-all group',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={cn(
                      'w-4 h-4',
                      isActive
                        ? 'text-primary-foreground'
                        : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  />
                  <span>{t.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div
                      className="w-2.5 h-2.5 rounded-full border border-border/20 shadow-sm"
                      style={{ backgroundColor: t.colors.primary }}
                      title="Primary"
                    />
                    <div
                      className="w-2.5 h-2.5 rounded-full border border-border/20 shadow-sm"
                      style={{ backgroundColor: t.colors.background }}
                      title="Background"
                    />
                  </div>
                  {isActive && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
