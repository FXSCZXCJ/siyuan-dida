export function taskHash(title: string, checked: boolean, metadataKey = ""): string {
  const input = metadataKey
    ? JSON.stringify({ title, checked, metadataKey })
    : JSON.stringify({ title, checked });
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
