export const RECENT_SEARCHES_KEY = "chalopb_recent_searches";
export const FAVOURITES_KEY = "chalopb_favourites";

export function pairKey(source, destination) {
  return `${source?.id || ""}-${destination?.id || ""}`;
}

export function safeReadPreferenceList(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) { console.error("Failed to read preference:", err);
    return [];
  }
}

export function saveRecentSearchList(prevList, source, destination, max = 5) {
  const entry = {
    source: { id: source.id, stop_name: source.stop_name },
    destination: { id: destination.id, stop_name: destination.stop_name },
  };

  const filtered = prevList.filter(
    (item) => pairKey(item?.source, item?.destination) !== pairKey(source, destination)
  );
  return [entry, ...filtered].slice(0, max);
}

export function toggleFavouriteList(prevList, source, destination, max = 5) {
  const entry = {
    source: { id: source.id, stop_name: source.stop_name },
    destination: { id: destination.id, stop_name: destination.stop_name },
  };

  const exists = prevList.some(
    (item) => pairKey(item?.source, item?.destination) === pairKey(source, destination)
  );

  if (exists) {
    return prevList.filter(
      (item) => pairKey(item?.source, item?.destination) !== pairKey(source, destination)
    );
  }

  return [entry, ...prevList].slice(0, max);
}