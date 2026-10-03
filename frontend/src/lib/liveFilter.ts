// A filter's selection only counts while it is still one of its options.
//
// The Cuaderno's dropdowns are built from what is on screen — the farms
// in scope, their fields, the crops and labor types that appear. That set
// can change under an open page: the sample farm is switched off or reset
// from its banner (a reset replaces every id), a farm or field is deleted,
// the last entry of a type is removed. The selection is component state
// and would go on filtering by a value that no longer exists: the list is
// empty while the dropdown, with no matching option, shows "all".
//
// Reading the selection through here makes it fall back to "all" for as
// long as its value is gone, without anyone having to reset state.
export function liveFilter(selected: string, options: readonly string[]): string {
  return selected === 'all' || options.includes(selected) ? selected : 'all'
}
