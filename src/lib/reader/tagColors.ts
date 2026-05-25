export const TAG_COLOR_PRESETS = [
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'cyan',
  'blue',
  'violet',
  'pink',
] as const;

export type TagColorPreset = (typeof TAG_COLOR_PRESETS)[number];

export interface TagColorClasses {
  dot: string;
  badge: string;
  text: string;
  icon: string;
}

export const DEFAULT_TAG_COLOR_CLASSES: TagColorClasses = {
  dot: 'bg-muted-foreground/45',
  badge: 'border-border/70 bg-muted/50 text-muted-foreground',
  text: 'text-muted-foreground',
  icon: 'text-muted-foreground',
};

export const TAG_COLOR_CLASS_BY_PRESET: Record<TagColorPreset, TagColorClasses> = {
  slate: {
    dot: 'bg-slate-500',
    badge: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/12 dark:text-slate-200',
    text: 'text-slate-700 dark:text-slate-200',
    icon: 'text-slate-500 dark:text-slate-300',
  },
  red: {
    dot: 'bg-red-500',
    badge: 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/12 dark:text-red-200',
    text: 'text-red-700 dark:text-red-200',
    icon: 'text-red-500 dark:text-red-300',
  },
  orange: {
    dot: 'bg-orange-500',
    badge: 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/12 dark:text-orange-200',
    text: 'text-orange-700 dark:text-orange-200',
    icon: 'text-orange-500 dark:text-orange-300',
  },
  amber: {
    dot: 'bg-amber-500',
    badge: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/12 dark:text-amber-200',
    text: 'text-amber-800 dark:text-amber-200',
    icon: 'text-amber-500 dark:text-amber-300',
  },
  green: {
    dot: 'bg-green-500',
    badge: 'border-green-300 bg-green-50 text-green-700 dark:border-green-500/40 dark:bg-green-500/12 dark:text-green-200',
    text: 'text-green-700 dark:text-green-200',
    icon: 'text-green-500 dark:text-green-300',
  },
  teal: {
    dot: 'bg-teal-500',
    badge: 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-500/40 dark:bg-teal-500/12 dark:text-teal-200',
    text: 'text-teal-700 dark:text-teal-200',
    icon: 'text-teal-500 dark:text-teal-300',
  },
  cyan: {
    dot: 'bg-cyan-500',
    badge: 'border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/12 dark:text-cyan-200',
    text: 'text-cyan-700 dark:text-cyan-200',
    icon: 'text-cyan-500 dark:text-cyan-300',
  },
  blue: {
    dot: 'bg-blue-500',
    badge: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/12 dark:text-blue-200',
    text: 'text-blue-700 dark:text-blue-200',
    icon: 'text-blue-500 dark:text-blue-300',
  },
  violet: {
    dot: 'bg-violet-500',
    badge: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/12 dark:text-violet-200',
    text: 'text-violet-700 dark:text-violet-200',
    icon: 'text-violet-500 dark:text-violet-300',
  },
  pink: {
    dot: 'bg-pink-500',
    badge: 'border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-500/40 dark:bg-pink-500/12 dark:text-pink-200',
    text: 'text-pink-700 dark:text-pink-200',
    icon: 'text-pink-500 dark:text-pink-300',
  },
};

export function isTagColorPreset(value: unknown): value is TagColorPreset {
  return typeof value === 'string' && TAG_COLOR_PRESETS.includes(value as TagColorPreset);
}

export function getTagColorClasses(color: string | null | undefined): TagColorClasses {
  return isTagColorPreset(color) ? TAG_COLOR_CLASS_BY_PRESET[color] : DEFAULT_TAG_COLOR_CLASSES;
}
