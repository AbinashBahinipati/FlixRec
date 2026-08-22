import { ObjectId } from "mongodb";
import { MediaItem } from "@/components/MovieCard";

export interface UserDocument {
  _id?: ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  likedMedia: MediaItem[];
  dislikedMedia: MediaItem[];
  watchedMedia: MediaItem[];
  watchlist: MediaItem[];
  possibleToWatch: MediaItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfileResponse {
  id: string;
  name: string;
  email: string;
  likedMedia: MediaItem[];
  dislikedMedia: MediaItem[];
  watchedMedia: MediaItem[];
  watchlist: MediaItem[];
  possibleToWatch: MediaItem[];
  createdAt: string;
}

export const getMediaKey = (item: MediaItem): string => {
  const wid = item.watchmodeId ?? item.id;
  const t = item.type ?? "movie";
  return `${wid}_${t}`;
};

/**
 * Deduplicate or toggle media item in an array while preserving all metadata
 */
export const updateMediaList = (list: MediaItem[] = [], item: MediaItem, shouldAdd: boolean): MediaItem[] => {
  const targetKey = getMediaKey(item);
  const filtered = list.filter((i) => getMediaKey(i) !== targetKey);
  if (shouldAdd) {
    return [...filtered, item];
  }
  return filtered;
};
