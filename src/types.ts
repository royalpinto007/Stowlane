/** A single tab as it was when the lane was stowed. */
export interface StowedTab {
  url: string;
  title: string;
  /** Hostname without www, kept for grouping and for naming the lane. */
  site: string;
  /** Pinned tabs are restored pinned, because that is where the user put them. */
  pinned: boolean;
}

/** A set of tabs put away together. */
export interface Lane {
  id: string;
  /** Auto-generated at stow time, editable afterwards. */
  name: string;
  tabs: StowedTab[];
  /** Milliseconds since the epoch. */
  stowedAt: number;
  /** Set when the user pins a lane to the top of the list. */
  starred: boolean;
}

export type SortOrder = 'newest' | 'oldest' | 'largest' | 'name';

export interface Filters {
  query: string;
  sort: SortOrder;
  starredOnly: boolean;
}
