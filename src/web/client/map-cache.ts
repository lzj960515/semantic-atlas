export function loadCachedValue<Key, Value>(
  values: Map<Key, Value>,
  pending: Map<Key, Promise<Value>>,
  key: Key,
  load: () => Promise<Value>,
): Promise<Value> {
  const cached = values.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = pending.get(key);
  if (inFlight !== undefined) return inFlight;

  const request = load()
    .then((value) => {
      values.set(key, value);
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
