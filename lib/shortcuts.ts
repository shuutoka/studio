export function shortcutFromEvent(event: KeyboardEvent | React.KeyboardEvent) {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.metaKey) parts.push("Meta");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  const key = normalizeKey(event.key);
  if (!["Control", "Meta", "Alt", "Shift"].includes(key)) parts.push(key);
  return parts.join("+");
}

export function matchesShortcut(event: KeyboardEvent | React.KeyboardEvent, shortcut: string) {
  return Boolean(shortcut.trim()) &&
    shortcutFromEvent(event).toLocaleLowerCase("fr") === shortcut.toLocaleLowerCase("fr");
}

export function isSingleKeyShortcut(shortcut: string) {
  return !shortcut.includes("+");
}

export function isModifierKey(key: string) {
  return ["Control", "Meta", "Alt", "Shift"].includes(normalizeKey(key));
}

export function isShortcutRecorderTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("[data-shortcut-recorder='true']"));
}

function normalizeKey(key: string) {
  if (key === " ") return "Espace";
  if (key === "Esc") return "Escape";
  if (key.length === 1 && /[a-z]/i.test(key)) return key.toUpperCase();
  return key;
}
