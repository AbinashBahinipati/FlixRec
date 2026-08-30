import { ObjectId } from "mongodb";
import { MediaItem } from "@/components/MovieCard";
import {
  getCanonicalMediaKey,
  isSameMedia,
  addMediaItem,
  removeMediaItem,
  mergeMediaLists
} from "@/lib/mediaIdentity";

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

export const getMediaKey = getCanonicalMediaKey;

/**
 * Deduplicate or toggle media item in an array while preserving all metadata
 */
export const updateMediaList = (list: MediaItem[] = [], item: MediaItem, shouldAdd: boolean): MediaItem[] => {
  if (shouldAdd) {
    return addMediaItem(list, item);
  }
  return removeMediaItem(list, item);
};

