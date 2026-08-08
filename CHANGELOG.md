# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]

Initial release.

### Added

- Stow a window's tabs into a named lane from the keyboard shortcut or the side
  panel, with an option to keep the tabs open.
- Automatic lane naming from the dominant site, because a date and a count is
  not something anyone recognises a week later.
- Search across lane names, page titles, sites and URLs, with matching lanes
  expanded so the hit is visible.
- Star lanes to keep them at the top whatever the sort; sort by newest, oldest,
  most tabs or name.
- Restore a whole lane into a new window, with pinned tabs restored pinned, or
  open a single tab from the list.
- Remove a tab from a lane, rename a lane, delete a lane.
- Export and import a JSON backup, which is the only way lanes leave the device.

### Notes

- No network requests are made by the extension. CI fails the build if any
  appear in the bundles.
- Three permissions and no host permissions. Stowlane never injects anything
  into a page and never reads page content.
