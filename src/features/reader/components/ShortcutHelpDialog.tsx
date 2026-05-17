import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ShortcutHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcutRows = [
  { keys: 'J / K', action: '下一篇 / 上一篇' },
  { keys: 'S', action: '收藏' },
  { keys: 'L', action: '稍后读' },
  { keys: 'E', action: '归档' },
  { keys: 'M', action: '标为已读' },
  { keys: 'Ctrl / Cmd + F', action: '搜索' },
  { keys: 'Esc', action: '关闭 / 返回' },
];

export default function ShortcutHelpDialog({
  open,
  onOpenChange,
}: ShortcutHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="关闭快捷键" className="max-w-sm gap-0 p-0">
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <DialogTitle className="text-base">快捷键</DialogTitle>
          <DialogDescription className="sr-only">阅读器快捷键列表</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] gap-x-4 gap-y-2 px-5 py-4 text-sm">
          {shortcutRows.map((row) => (
            <div key={row.keys} className="contents">
              <dt className="min-w-0">
                <kbd className="inline-flex max-w-full items-center rounded border border-border/70 bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
                  {row.keys}
                </kbd>
              </dt>
              <dd className="min-w-0 text-muted-foreground">{row.action}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
