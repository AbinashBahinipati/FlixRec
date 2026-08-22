import os
import pickle
import re
import string
import threading
import logging
from typing import List, Optional, Dict, Any, Set

import numpy as np
import pandas as pd
import torch
import torch.nn as nn

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ============================================================
# LOGGING & CONFIGURATION
# ============================================================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("flixrec-backend")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")

MODEL_PATH = os.path.join(MODEL_DIR, "movie_recommendation_model_final.pth")
MOVIE_MAP_PATH = os.path.join(MODEL_DIR, "movie_to_idx.pkl")
USER_MAP_PATH = os.path.join(MODEL_DIR, "user_to_idx.pkl")
MOVIES_PATH = os.path.join(MODEL_DIR, "movies.csv")
LINKS_PATH = os.path.join(MODEL_DIR, "links.csv")

# Ensure CPU-only execution for cloud memory safety
DEVICE = torch.device("cpu")


# ============================================================
# FASTAPI APPLICATION SETUP (binds port immediately)
# ============================================================

app = FastAPI(
    title="FLIXREC Recommendation API",
    description="AI Movie Recommendation System",
    version="1.0.0"
)

CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# REQUEST MODELS
# ============================================================

class RecommendationRequest(BaseModel):
    liked_movie_ids: List[int] = []
    disliked_movie_ids: List[int] = []
    watched_movie_ids: List[int] = []
    n: int = 10
    unresolved_likes: list = []


class ResolveExternalRequest(BaseModel):
    imdbId: Optional[str] = None
    tmdbId: Optional[str] = None
    title: Optional[str] = None
    year: Optional[int] = None
    type: Optional[str] = "movie"


class ResolveMovieRequest(BaseModel):
    title: Optional[str] = None
    year: Optional[int] = None
    type: Optional[str] = "movie"
    tmdbId: Optional[str] = None
    imdbId: Optional[str] = None


class UnifiedRecommendationRequest(BaseModel):
    liked_media: List[dict] = []
    disliked_media: List[dict] = []
    watched_media: List[dict] = []
    n: int = 10


# ============================================================
# MATRIX FACTORIZATION MODEL ARCHITECTURE
# ============================================================

class MovieRecommendationModel(nn.Module):
    def __init__(self, num_users: int, num_movies: int, embedding_dim: int = 32):
        super().__init__()
        self.user_embedding = nn.Embedding(num_users, embedding_dim)
        self.movie_embedding = nn.Embedding(num_movies, embedding_dim)
        self.user_bias = nn.Embedding(num_users, 1)
        self.movie_bias = nn.Embedding(num_movies, 1)

    def forward(self, user_ids: torch.Tensor, movie_ids: torch.Tensor) -> torch.Tensor:
        user_emb = self.user_embedding(user_ids)
        movie_emb = self.movie_embedding(movie_ids)
        user_bias = self.user_bias(user_ids).squeeze()
        movie_bias = self.movie_bias(movie_ids).squeeze()
        interaction = (user_emb * movie_emb).sum(dim=1)
        return interaction + user_bias + movie_bias


# ============================================================
# TITLE CLEANING UTILITY
# ============================================================

def clean_movie_title(t: str) -> str:
    if not isinstance(t, str):
        return ""
    t = re.sub(r'\s*\(\d{4}\)$', '', t).strip()
    match = re.match(r'^(.*),\s*(The|A|An)$', t, re.IGNORECASE)
    if match:
        t = f"{match.group(2)} {match.group(1)}"
    t = re.sub(r'[^\w\s]', '', t)
    return " ".join(t.lower().split())


# ============================================================
# LAZY RESOURCE LOADER & MODULE-LEVEL CACHE
# ============================================================

_RESOURCES: Optional[Dict[str, Any]] = None
_LOAD_LOCK = threading.Lock()


def get_recommendation_resources() -> Dict[str, Any]:
    global _RESOURCES

    if _RESOURCES is not None:
        return _RESOURCES

    with _LOAD_LOCK:
        if _RESOURCES is not None:
            return _RESOURCES

        logger.info("Initializing recommendation model and MovieLens resources...")

        # 1. Load movies metadata
        if not os.path.exists(MOVIES_PATH):
            raise FileNotFoundError(f"Movies CSV not found at: {MOVIES_PATH}")

        movies_df = pd.read_csv(MOVIES_PATH)
        movies_df["movieId"] = movies_df["movieId"].astype(int)
        movies_df["normalized_title"] = movies_df["title"].apply(clean_movie_title)
        movie_lookup = movies_df.set_index("movieId")

        # 2. Build genre map
        movie_genres = {}
        for _, row in movies_df.iterrows():
            mid = int(row["movieId"])
            g_str = str(row.get("genres", ""))
            if pd.isna(g_str) or g_str == "(no genres listed)" or not g_str:
                movie_genres[mid] = set()
            else:
                movie_genres[mid] = set(g_str.split("|"))

        # 3. Load links (MovieLens <-> IMDb <-> TMDB)
        imdbToMovieLens = {}
        tmdbToMovieLens = {}
        movieLensToImdb = {}
        movieLensToTmdb = {}

        if os.path.exists(LINKS_PATH):
            links_df = pd.read_csv(LINKS_PATH, dtype=str)
            for _, row in links_df.iterrows():
                try:
                    mid = int(row["movieId"])
                except Exception:
                    continue

                imdb_raw = str(row["imdbId"]).strip() if pd.notna(row.get("imdbId")) else None
                if imdb_raw and imdb_raw != "nan" and imdb_raw != "":
                    imdbToMovieLens[imdb_raw] = mid
                    imdbToMovieLens["tt" + imdb_raw] = mid
                    padded = imdb_raw.zfill(7)
                    imdbToMovieLens[padded] = mid
                    imdbToMovieLens["tt" + padded] = mid
                    if imdb_raw.isdigit():
                        stripped = str(int(imdb_raw))
                        imdbToMovieLens[stripped] = mid
                        imdbToMovieLens["tt" + stripped] = mid
                    movieLensToImdb[mid] = "tt" + padded

                tmdb_raw = str(row["tmdbId"]).strip() if pd.notna(row.get("tmdbId")) else None
                if tmdb_raw and tmdb_raw != "nan" and tmdb_raw != "":
                    if tmdb_raw.endswith(".0"):
                        tmdb_raw = tmdb_raw[:-2]
                    tmdbToMovieLens[tmdb_raw] = mid
                    if tmdb_raw.isdigit():
                        tmdbToMovieLens[str(int(tmdb_raw))] = mid
                    movieLensToTmdb[mid] = tmdb_raw

        # 4. Load mappings
        if not os.path.exists(MOVIE_MAP_PATH):
            raise FileNotFoundError(f"Movie mapping not found at: {MOVIE_MAP_PATH}")
        with open(MOVIE_MAP_PATH, "rb") as f:
            movie_to_idx = pickle.load(f)
        idx_to_movie = {int(index): int(movie_id) for movie_id, index in movie_to_idx.items()}

        if not os.path.exists(USER_MAP_PATH):
            raise FileNotFoundError(f"User mapping not found at: {USER_MAP_PATH}")
        with open(USER_MAP_PATH, "rb") as f:
            user_to_idx = pickle.load(f)

        # 5. Load PyTorch model weights
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Model checkpoint not found at: {MODEL_PATH}")

        checkpoint = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=False)
        if isinstance(checkpoint, dict):
            if "state_dict" in checkpoint:
                state_dict = checkpoint["state_dict"]
            elif "model_state_dict" in checkpoint:
                state_dict = checkpoint["model_state_dict"]
            else:
                state_dict = checkpoint
        else:
            raise ValueError("Unsupported model checkpoint format.")

        clean_state_dict = {}
        for key, value in state_dict.items():
            new_key = key[len("module."):] if key.startswith("module.") else key
            clean_state_dict[new_key] = value

        num_users = clean_state_dict["user_embedding.weight"].shape[0]
        num_movies = clean_state_dict["movie_embedding.weight"].shape[0]
        embedding_dim = clean_state_dict["user_embedding.weight"].shape[1]

        model = MovieRecommendationModel(
            num_users=num_users,
            num_movies=num_movies,
            embedding_dim=embedding_dim
        )
        model.load_state_dict(clean_state_dict)
        model.to(DEVICE)
        model.eval()

        _RESOURCES = {
            "model": model,
            "movie_to_idx": movie_to_idx,
            "idx_to_movie": idx_to_movie,
            "user_to_idx": user_to_idx,
            "movies_df": movies_df,
            "movie_lookup": movie_lookup,
            "movie_genres": movie_genres,
            "imdbToMovieLens": imdbToMovieLens,
            "tmdbToMovieLens": tmdbToMovieLens,
            "movieLensToImdb": movieLensToImdb,
            "movieLensToTmdb": movieLensToTmdb,
            "num_movies": num_movies,
            "num_users": num_users,
            "embedding_dim": embedding_dim,
        }

        logger.info(f"Recommendation resources loaded: {num_movies} movies, {num_users} users.")
        return _RESOURCES


# ============================================================
# HELPER ACCESSORS
# ============================================================

def get_movie_title(movie_id: int, res: Optional[Dict[str, Any]] = None) -> str:
    if res is None:
        res = get_recommendation_resources()
    try:
        return str(res["movie_lookup"].loc[movie_id, "title"])
    except Exception:
        return "Unknown Movie"


def get_movie_genres(movie_id: int, res: Optional[Dict[str, Any]] = None) -> List[str]:
    if res is None:
        res = get_recommendation_resources()
    genres = res["movie_genres"].get(movie_id, set())
    return sorted(list(genres)) if genres else []


def get_movie_embedding(movie_id: int, res: Optional[Dict[str, Any]] = None) -> Optional[torch.Tensor]:
    if res is None:
        res = get_recommendation_resources()
    if movie_id not in res["movie_to_idx"]:
        return None
    movie_index = res["movie_to_idx"][movie_id]
    movie_tensor = torch.tensor([movie_index], dtype=torch.long, device=DEVICE)
    with torch.no_grad():
        return res["model"].movie_embedding(movie_tensor)[0]


def build_user_profile(
    liked_movie_ids: List[int],
    disliked_movie_ids: List[int],
    res: Optional[Dict[str, Any]] = None
) -> Optional[torch.Tensor]:
    if res is None:
        res = get_recommendation_resources()

    liked_embeddings = []
    disliked_embeddings = []

    for movie_id in liked_movie_ids:
        emb = get_movie_embedding(movie_id, res)
        if emb is not None:
            liked_embeddings.append(emb)

    for movie_id in disliked_movie_ids:
        emb = get_movie_embedding(movie_id, res)
        if emb is not None:
            disliked_embeddings.append(emb)

    if not liked_embeddings:
        return None

    liked_profile = torch.stack(liked_embeddings).mean(dim=0)
    if disliked_embeddings:
        disliked_profile = torch.stack(disliked_embeddings).mean(dim=0)
    else:
        disliked_profile = torch.zeros_like(liked_profile)

    return liked_profile - 0.35 * disliked_profile


def build_genre_preferences(
    liked_movie_ids: List[int],
    disliked_movie_ids: List[int],
    res: Optional[Dict[str, Any]] = None
):
    if res is None:
        res = get_recommendation_resources()

    liked_counts = {}
    disliked_counts = {}

    for movie_id in liked_movie_ids:
        genres = res["movie_genres"].get(movie_id, set())
        for genre in genres:
            liked_counts[genre] = liked_counts.get(genre, 0) + 1

    for movie_id in disliked_movie_ids:
        genres = res["movie_genres"].get(movie_id, set())
        for genre in genres:
            disliked_counts[genre] = disliked_counts.get(genre, 0) + 1

    return liked_counts, disliked_counts


# ============================================================
# CORE RECOMMENDATION ALGORITHM
# ============================================================

def recommend_movies(
    liked_movie_ids: List[int],
    disliked_movie_ids: List[int],
    watched_movie_ids: List[int],
    n: int = 10,
    res: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    if res is None:
        res = get_recommendation_resources()

    n = max(1, min(int(n), 50))
    liked_movie_ids = list(dict.fromkeys(liked_movie_ids))
    disliked_movie_ids = list(dict.fromkeys(disliked_movie_ids))
    watched_movie_ids = list(dict.fromkeys(watched_movie_ids))

    user_profile = build_user_profile(liked_movie_ids, disliked_movie_ids, res)
    liked_genres, disliked_genres = build_genre_preferences(liked_movie_ids, disliked_movie_ids, res)

    model = res["model"]
    movies_df = res["movies_df"]
    movie_to_idx = res["movie_to_idx"]
    idx_to_movie = res["idx_to_movie"]
    movie_lookup = res["movie_lookup"]
    movie_genres = res["movie_genres"]
    ml_to_imdb = res["movieLensToImdb"]
    ml_to_tmdb = res["movieLensToTmdb"]
    num_movies = res["num_movies"]

    # Fallback if no valid likes
    if user_profile is None:
        available = []
        for _, row in movies_df.iterrows():
            movie_id = int(row["movieId"])
            if movie_id in (set(liked_movie_ids) | set(disliked_movie_ids) | set(watched_movie_ids)):
                continue
            if movie_id not in movie_to_idx:
                continue

            available.append({
                "movieId": movie_id,
                "title": str(row["title"]),
                "genres": get_movie_genres(movie_id, res),
                "score": 0.0,
                "imdbId": ml_to_imdb.get(movie_id),
                "tmdbId": ml_to_tmdb.get(movie_id)
            })
            if len(available) >= n:
                break
        return available

    with torch.no_grad():
        user_profile = user_profile / (torch.norm(user_profile) + 1e-8)
        movie_embeddings = model.movie_embedding.weight
        movie_embeddings_normalized = movie_embeddings / (torch.norm(movie_embeddings, dim=1, keepdim=True) + 1e-8)

        similarity_scores = torch.matmul(movie_embeddings_normalized, user_profile)
        movie_bias = model.movie_bias.weight.squeeze()
        bias_min = movie_bias.min()
        bias_max = movie_bias.max()
        normalized_bias = (movie_bias - bias_min) / (bias_max - bias_min + 1e-8)

        base_scores = 0.80 * similarity_scores + 0.20 * normalized_bias

    excluded_movies = set(liked_movie_ids) | set(disliked_movie_ids) | set(watched_movie_ids)

    candidates = []
    for movie_index in range(num_movies):
        movie_id = idx_to_movie.get(movie_index)
        if movie_id is None or movie_id in excluded_movies:
            continue
        if movie_id not in movie_lookup.index:
            continue

        genres = movie_genres.get(movie_id, set())
        score = float(base_scores[movie_index].item())

        # Genre boost / penalty
        if genres:
            genre_boost = 0.0
            for genre in genres:
                if genre in liked_genres:
                    genre_boost += 0.05 * liked_genres[genre]
                if genre in disliked_genres:
                    genre_boost -= 0.10 * disliked_genres[genre]
            score += genre_boost

        candidates.append((score, movie_id))

    candidates.sort(key=lambda x: x[0], reverse=True)

    results = []
    for score, movie_id in candidates[:n]:
        results.append({
            "movieId": movie_id,
            "title": get_movie_title(movie_id, res),
            "genres": get_movie_genres(movie_id, res),
            "score": round(score, 4),
            "imdbId": ml_to_imdb.get(movie_id),
            "tmdbId": ml_to_tmdb.get(movie_id)
        })

    return results


# ============================================================
# RESOLUTION FUNCTIONS
# ============================================================

def resolve_external_to_movielens(
    imdb_id: Optional[str] = None,
    tmdb_id: Optional[str] = None,
    title: Optional[str] = None,
    year: Optional[int] = None,
    media_type: Optional[str] = "movie",
    res: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    if media_type in ["series", "tv", "tv_series"]:
        return {
            "resolved": False,
            "found": False,
            "movieLensId": None,
            "imdbId": str(imdb_id) if imdb_id else None,
            "tmdbId": str(tmdb_id) if tmdb_id else None,
            "reason": "TV/Web series are not indexed in the MovieLens dataset"
        }

    if res is None:
        res = get_recommendation_resources()

    imdbToMovieLens = res["imdbToMovieLens"]
    tmdbToMovieLens = res["tmdbToMovieLens"]
    movieLensToImdb = res["movieLensToImdb"]
    movieLensToTmdb = res["movieLensToTmdb"]
    movies_df = res["movies_df"]

    # 1. Try IMDb ID
    if imdb_id:
        clean_imdb = str(imdb_id).strip().lower()
        if clean_imdb in imdbToMovieLens:
            mid = int(imdbToMovieLens[clean_imdb])
            return {
                "resolved": True,
                "found": True,
                "movieLensId": mid,
                "imdbId": movieLensToImdb.get(mid),
                "tmdbId": movieLensToTmdb.get(mid),
                "title": get_movie_title(mid, res)
            }

    # 2. Try TMDB ID
    if tmdb_id:
        clean_tmdb = str(tmdb_id).strip()
        if clean_tmdb.endswith(".0"):
            clean_tmdb = clean_tmdb[:-2]
        if clean_tmdb in tmdbToMovieLens:
            mid = int(tmdbToMovieLens[clean_tmdb])
            return {
                "resolved": True,
                "found": True,
                "movieLensId": mid,
                "imdbId": movieLensToImdb.get(mid),
                "tmdbId": movieLensToTmdb.get(mid),
                "title": get_movie_title(mid, res)
            }

    # 3. Fallback to Title + Year
    if title:
        norm_title = clean_movie_title(title)
        matches = movies_df[movies_df["normalized_title"] == norm_title]
        if not matches.empty:
            if year:
                year_matches = matches[matches["title"].str.contains(f"\\({year}\\)")]
                if not year_matches.empty:
                    mid = int(year_matches.iloc[0]["movieId"])
                    return {
                        "resolved": True,
                        "found": True,
                        "movieLensId": mid,
                        "imdbId": movieLensToImdb.get(mid),
                        "tmdbId": movieLensToTmdb.get(mid),
                        "title": year_matches.iloc[0]["title"]
                    }
            mid = int(matches.iloc[0]["movieId"])
            return {
                "resolved": True,
                "found": True,
                "movieLensId": mid,
                "imdbId": movieLensToImdb.get(mid),
                "tmdbId": movieLensToTmdb.get(mid),
                "title": matches.iloc[0]["title"]
            }

    return {
        "resolved": False,
        "found": False,
        "movieLensId": None,
        "imdbId": str(imdb_id) if imdb_id else None,
        "tmdbId": str(tmdb_id) if tmdb_id else None,
        "reason": "No MovieLens mapping found"
    }


def resolve_movielens_to_external(movieLensId: int, res: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if res is None:
        res = get_recommendation_resources()

    tmdb = res["movieLensToTmdb"].get(movieLensId)
    imdb = res["movieLensToImdb"].get(movieLensId)

    if pd.isna(tmdb):
        tmdb = None
    if pd.isna(imdb):
        imdb = None

    return {
        "resolved": bool(tmdb or imdb),
        "found": bool(tmdb or imdb),
        "movieLensId": movieLensId,
        "imdbId": str(imdb) if imdb else None,
        "tmdbId": str(tmdb) if tmdb else None
    }


# ============================================================
# API ENDPOINTS
# ============================================================

@app.get("/")
def root():
    global _RESOURCES
    return {
        "status": "online",
        "service": "FLIXREC Recommendation API",
        "model": "Matrix Factorization",
        "model_loaded": _RESOURCES is not None,
        "movies": _RESOURCES["num_movies"] if _RESOURCES is not None else 84432
    }


@app.get("/health")
def health():
    """Fast health check endpoint for Render port scanning and container liveness."""
    return {"status": "healthy"}


@app.get("/model-status")
def model_status():
    """Model status endpoint reporting whether recommendation weights are cached in memory."""
    global _RESOURCES
    return {
        "loaded": _RESOURCES is not None,
        "device": "cpu"
    }


@app.post("/recommend")
def recommend(request: RecommendationRequest):
    try:
        recommendations = recommend_movies(
            liked_movie_ids=request.liked_movie_ids,
            disliked_movie_ids=request.disliked_movie_ids,
            watched_movie_ids=request.watched_movie_ids,
            n=request.n
        )
        return {
            "success": True,
            "count": len(recommendations),
            "recommendations": recommendations
        }
    except Exception as e:
        logger.error(f"Error in /recommend: {e}", exc_info=True)
        return {
            "success": False,
            "count": 0,
            "recommendations": [],
            "error": str(e)
        }


@app.post("/resolve-external")
@app.post("/resolve-movie")
def resolve_external(req: ResolveExternalRequest):
    try:
        return resolve_external_to_movielens(
            imdb_id=req.imdbId,
            tmdb_id=req.tmdbId,
            title=req.title,
            year=req.year,
            media_type=req.type
        )
    except Exception as e:
        logger.error(f"Error in /resolve-external: {e}", exc_info=True)
        return {
            "resolved": False,
            "found": False,
            "movieLensId": None,
            "error": str(e)
        }


@app.get("/resolve/{movieLensId}")
def resolve_ml_id(movieLensId: int):
    try:
        return resolve_movielens_to_external(movieLensId)
    except Exception as e:
        logger.error(f"Error in /resolve/{movieLensId}: {e}", exc_info=True)
        return {
            "resolved": False,
            "found": False,
            "movieLensId": movieLensId,
            "error": str(e)
        }


@app.post("/recommend/unified")
def recommend_unified(req: UnifiedRecommendationRequest):
    try:
        res = get_recommendation_resources()
        movies_df = res["movies_df"]
        movieLensToImdb = res["movieLensToImdb"]
        movieLensToTmdb = res["movieLensToTmdb"]

        liked_ml_ids = []
        disliked_ml_ids = []
        watched_ml_ids = []
        all_liked_genres = []

        for item in req.liked_media:
            ml_id = item.get("movieLensId") or item.get("ml_id")
            if ml_id and isinstance(ml_id, (int, float)):
                liked_ml_ids.append(int(ml_id))
            g = item.get("genres")
            if isinstance(g, list):
                all_liked_genres.extend([str(x).strip() for x in g if x])
            elif isinstance(g, str):
                all_liked_genres.extend([x.strip() for x in g.replace("|", ",").split(",") if x.strip()])

        for item in req.disliked_media:
            ml_id = item.get("movieLensId") or item.get("ml_id")
            if ml_id and isinstance(ml_id, (int, float)):
                disliked_ml_ids.append(int(ml_id))

        for item in req.watched_media:
            ml_id = item.get("movieLensId") or item.get("ml_id")
            if ml_id and isinstance(ml_id, (int, float)):
                watched_ml_ids.append(int(ml_id))

        excluded_ids = set(liked_ml_ids + disliked_ml_ids + watched_ml_ids)
        liked_genre_set = set(all_liked_genres)

        candidate_map = {}

        # 1. Collaborative ML candidates if valid ML IDs exist
        if liked_ml_ids:
            ml_recs = recommend_movies(
                liked_movie_ids=liked_ml_ids,
                disliked_movie_ids=disliked_ml_ids,
                watched_movie_ids=watched_ml_ids,
                n=max(req.n * 3, 30),
                res=res
            )
            for rec in ml_recs:
                mid = rec["movieId"]
                if mid in excluded_ids:
                    continue
                rec_genres = set(rec["genres"]) if isinstance(rec["genres"], list) else set(str(rec["genres"]).split("|"))
                overlap = len(rec_genres.intersection(liked_genre_set)) if liked_genre_set else 0
                content_score = min(1.0, overlap / max(1, len(rec_genres))) if rec_genres else 0.5
                raw_score = float(rec["score"])
                collab_score = (raw_score - 1.0) / 4.0 if raw_score > 1.0 else raw_score
                collab_score = min(1.0, max(0.0, collab_score))
                hybrid_score = round(0.6 * collab_score + 0.4 * content_score, 4)

                candidate_map[mid] = {
                    "movieId": mid,
                    "movieLensId": mid,
                    "title": rec["title"],
                    "genres": rec["genres"],
                    "score": hybrid_score,
                    "source": "hybrid",
                    "imdbId": rec.get("imdbId") or movieLensToImdb.get(mid),
                    "tmdbId": rec.get("tmdbId") or movieLensToTmdb.get(mid)
                }

        # 2. Content-based candidates matching liked genres (for series / non-MovieLens items)
        if liked_genre_set:
            genre_pattern = "|".join([re.escape(g) for g in liked_genre_set if g])
            if genre_pattern:
                matching_movies = movies_df[movies_df["genres"].str.contains(genre_pattern, case=False, na=False)]
                scored_content = []
                for _, row in matching_movies.iterrows():
                    mid = int(row["movieId"])
                    if mid in excluded_ids or mid in candidate_map:
                        continue
                    rec_genres = set(str(row["genres"]).split("|"))
                    overlap = len(rec_genres.intersection(liked_genre_set))
                    if overlap == 0:
                        continue
                    union_len = len(rec_genres.union(liked_genre_set))
                    content_score = round(overlap / max(1, union_len), 4)
                    scored_content.append((content_score, mid, row))
                    if len(scored_content) >= 300:
                        break

                scored_content.sort(key=lambda x: x[0], reverse=True)
                for content_score, mid, row in scored_content[:30]:
                    candidate_map[mid] = {
                        "movieId": mid,
                        "movieLensId": mid,
                        "title": row["title"],
                        "genres": row["genres"],
                        "score": round(0.85 * content_score, 4),
                        "source": "content",
                        "imdbId": movieLensToImdb.get(mid),
                        "tmdbId": movieLensToTmdb.get(mid)
                    }

        # Fallback to standard recommend_movies if candidate_map is empty
        if not candidate_map:
            ml_recs = recommend_movies(
                liked_movie_ids=liked_ml_ids,
                disliked_movie_ids=disliked_ml_ids,
                watched_movie_ids=watched_ml_ids,
                n=req.n,
                res=res
            )
            for rec in ml_recs:
                mid = rec["movieId"]
                candidate_map[mid] = {
                    "movieId": mid,
                    "movieLensId": mid,
                    "title": rec["title"],
                    "genres": rec["genres"],
                    "score": round(float(rec["score"]), 4),
                    "source": "collaborative",
                    "imdbId": rec.get("imdbId") or movieLensToImdb.get(mid),
                    "tmdbId": rec.get("tmdbId") or movieLensToTmdb.get(mid)
                }

        recommendations = sorted(candidate_map.values(), key=lambda x: x["score"], reverse=True)[:req.n]

        return {
            "success": True,
            "count": len(recommendations),
            "recommendations": recommendations
        }
    except Exception as e:
        logger.error(f"Error in /recommend/unified: {e}", exc_info=True)
        return {
            "success": False,
            "count": 0,
            "recommendations": [],
            "error": str(e)
        }


# ============================================================
# MAIN ENTRYPOINT
# ============================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    host = "0.0.0.0"

    print()
    print("=" * 60)
    print("FLIXREC RECOMMENDATION API (Fast Startup & Lazy Loading)")
    print(f"Host: {host}:{port}")
    print("=" * 60)
    print()

    uvicorn.run(
        "recommender:app",
        host=host,
        port=port,
        reload=False
    )