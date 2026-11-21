import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Calendar, Clock, Pause, Play, Timer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CronsSnapshot } from '../../types';

interface SummaryCardItem {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
}

interface CronSummaryCardsProps {
  summary?: CronsSnapshot['summary'];
}

const containerVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      staggerChildren: 0.06,
      duration: 0.2,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 260, damping: 22 },
  },
};

export function CronSummaryCards({ summary }: CronSummaryCardsProps) {
  const cards: SummaryCardItem[] = [
    {
      label: 'Total Jobs',
      value: summary?.total ?? 0,
      icon: Clock,
      color: 'text-primary',
    },
    {
      label: 'Active',
      value: summary?.active ?? 0,
      icon: Play,
      color: 'text-success',
    },
    {
      label: 'Disabled',
      value: summary?.disabled ?? 0,
      icon: Pause,
      color: 'text-warning',
    },
    {
      label: 'User Crons',
      value: summary?.userCrons ?? 0,
      icon: Calendar,
      color: 'text-primary',
    },
    {
      label: 'System Crons',
      value: summary?.systemCrons ?? 0,
      icon: Timer,
      color: 'text-muted-foreground',
    },
  ];

  return (
    <motion.div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {cards.map(({ label, value, icon: Icon, color }) => (
        <motion.div
          key={label}
          variants={cardVariants}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: 'spring', stiffness: 280, damping: 20 }}
          className="rounded-xl"
        >
          <Card className="border-border/60 bg-card/80 transition-all duration-300 hover:border-primary/20 hover:shadow-[0_4px_12px_-4px_color-mix(in_oklab,var(--primary)_15%,transparent)] group">
            <CardContent className="flex items-center justify-between p-4 min-h-[80px]">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground group-hover:text-foreground transition-colors duration-300">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight group-hover:scale-105 origin-left transition-transform duration-300">
                  {value}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5 group-hover:border-primary/20 group-hover:bg-primary/5 transition-colors duration-300">
                <Icon
                  className={cn(
                    'h-5 w-5 transition-transform duration-300 group-hover:scale-110',
                    color
                  )}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
