export const AI_DIGEST_VIEW_ID = 'ai-digest';
export const READ_LATER_VIEW_ID = 'read-later';
export const ARCHIVED_VIEW_ID = 'archived';

export function isRssSmartView(view: string): boolean {
  return view === 'all' || view === 'unread' || view === 'starred';
}

export function isAggregateView(view: string): boolean {
  return (
    isRssSmartView(view) ||
    view === AI_DIGEST_VIEW_ID ||
    view === READ_LATER_VIEW_ID ||
    view === ARCHIVED_VIEW_ID
  );
}

export function shouldUseDefaultUnreadOnly(view: string): boolean {
  return (
    view !== 'unread' &&
    view !== 'starred' &&
    view !== READ_LATER_VIEW_ID &&
    view !== ARCHIVED_VIEW_ID
  );
}
