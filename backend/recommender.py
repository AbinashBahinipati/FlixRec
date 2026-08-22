import os
import pickle
from typing import List, Optional

import numpy as np
import pandas as pd
import torch
import torch.nn as nn

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import re
import string


# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")

MODEL_PATH = os.path.join(
    MODEL_DIR,
    "movie_recommendation_model_final.pth"
)

MOVIE_MAP_PATH = os.path.join(
    MODEL_DIR,
    "movie_to_idx.pkl"
)

USER_MAP_PATH = os.path.join(
    MODEL_DIR,
    "user_to_idx.pkl"
)

MOVIES_PATH = os.path.join(
    MODEL_DIR,
    "movies.csv"
)

LINKS_PATH = os.path.join(
    MODEL_DIR,
    "links.csv"
)


# ============================================================
# DEVICE
# ============================================================

DEVICE = torch.device("cpu")


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="FLIXREC Recommendation API",
    description="AI Movie Recommendation System",
    version="1.0.0"
)


# ============================================================
# CORS
# ============================================================

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
# MATRIX FACTORIZATION MODEL
# ============================================================

class MovieRecommendationModel(nn.Module):

    def __init__(
        self,
        num_users,
        num_movies,
        embedding_dim=32
    ):

        super().__init__()

        self.user_embedding = nn.Embedding(
            num_users,
            embedding_dim
        )

        self.movie_embedding = nn.Embedding(
            num_movies,
            embedding_dim
        )

        self.user_bias = nn.Embedding(
            num_users,
            1
        )

        self.movie_bias = nn.Embedding(
            num_movies,
            1
        )


    def forward(
        self,
        user_ids,
        movie_ids
    ):

        user_emb = self.user_embedding(
            user_ids
        )

        movie_emb = self.movie_embedding(
            movie_ids
        )

        user_bias = self.user_bias(
            user_ids
        ).squeeze()

        movie_bias = self.movie_bias(
            movie_ids
        ).squeeze()

        interaction = (
            user_emb * movie_emb
        ).sum(dim=1)

        return (
            interaction
            +
            user_bias
            +
            movie_bias
        )


# ============================================================
# LOAD MOVIE DATA
# ============================================================

print("Loading movie data...")

movies_df = pd.read_csv(
    MOVIES_PATH
)

print(
    f"Movies loaded: {len(movies_df)}"
)

# ============================================================
# LOAD LINKS DATA
# ============================================================
print("Loading links data...")
links_df = pd.read_csv(
    LINKS_PATH, 
    dtype=str
)
print(f"Links loaded: {len(links_df)}")

# Multi-variant mappings
imdbToMovieLens = {}
tmdbToMovieLens = {}
movieLensToImdb = {}
movieLensToTmdb = {}

for _, row in links_df.iterrows():
    try:
        mid = int(row['movieId'])
    except Exception:
        continue
    
    imdb_raw = str(row['imdbId']).strip() if pd.notna(row.get('imdbId')) else None
    if imdb_raw and imdb_raw != 'nan' and imdb_raw != '':
        imdbToMovieLens[imdb_raw] = mid
        imdbToMovieLens['tt' + imdb_raw] = mid
        padded = imdb_raw.zfill(7)
        imdbToMovieLens[padded] = mid
        imdbToMovieLens['tt' + padded] = mid
        if imdb_raw.isdigit():
            stripped = str(int(imdb_raw))
            imdbToMovieLens[stripped] = mid
            imdbToMovieLens['tt' + stripped] = mid
        movieLensToImdb[mid] = 'tt' + padded
        
    tmdb_raw = str(row['tmdbId']).strip() if pd.notna(row.get('tmdbId')) else None
    if tmdb_raw and tmdb_raw != 'nan' and tmdb_raw != '':
        if tmdb_raw.endswith('.0'): tmdb_raw = tmdb_raw[:-2]
        tmdbToMovieLens[tmdb_raw] = mid
        if tmdb_raw.isdigit():
            tmdbToMovieLens[str(int(tmdb_raw))] = mid
        movieLensToTmdb[mid] = tmdb_raw

# Backward compatibility aliases
imdb_to_ml = imdbToMovieLens
tmdb_to_ml = tmdbToMovieLens
ml_to_imdb = movieLensToImdb
ml_to_tmdb = movieLensToTmdb


# ============================================================
# LOAD MOVIE MAPPING
# ============================================================

print("Loading movie mapping...")

with open(
    MOVIE_MAP_PATH,
    "rb"
) as f:

    movie_to_idx = pickle.load(f)


idx_to_movie = {
    int(index): int(movie_id)
    for movie_id, index in movie_to_idx.items()
}


# ============================================================
# LOAD USER MAPPING
# ============================================================

print("Loading user mapping...")

with open(
    USER_MAP_PATH,
    "rb"
) as f:

    user_to_idx = pickle.load(f)


# ============================================================
# CREATE MOVIE LOOKUP & TITLE NORMALIZATION
# ============================================================

movies_df["movieId"] = (
    movies_df["movieId"]
    .astype(int)
)


movie_lookup = (
    movies_df
    .set_index("movieId")
)

def clean_movie_title(t: str) -> str:
    if not isinstance(t, str): return ""
    t = re.sub(r'\s*\(\d{4}\)$', '', t).strip()
    match = re.match(r'^(.*),\s*(The|A|An)$', t, re.IGNORECASE)
    if match:
        t = f"{match.group(2)} {match.group(1)}"
    t = re.sub(r'[^\w\s]', '', t)
    return " ".join(t.lower().split())

movies_df['normalized_title'] = movies_df['title'].apply(clean_movie_title)


# ============================================================
# GENRE PARSER
# ============================================================

def parse_genres(genre_string):

    if pd.isna(genre_string):

        return set()

    genre_string = str(
        genre_string
    )

    if genre_string == "(no genres listed)":

        return set()

    return set(
        genre_string.split("|")
    )


# ============================================================
# MOVIE GENRE CACHE
# ============================================================

movie_genres = {}

for movie_id, row in movies_df.iterrows():

    actual_movie_id = int(
        row["movieId"]
    )

    movie_genres[
        actual_movie_id
    ] = parse_genres(
        row["genres"]
    )


# ============================================================
# MOVIE TITLE
# ============================================================

def get_movie_title(movie_id):

    try:

        title = movie_lookup.loc[
            movie_id,
            "title"
        ]

        return str(title)

    except Exception:

        return "Unknown Movie"


# ============================================================
# MOVIE GENRES
# ============================================================

def get_movie_genres(movie_id):

    genres = movie_genres.get(
        movie_id,
        set()
    )

    if not genres:

        return []

    return sorted(
        list(genres)
    )


# ============================================================
# LOAD MODEL
# ============================================================

print("Loading recommendation model...")

checkpoint = torch.load(
    MODEL_PATH,
    map_location=DEVICE,
    weights_only=False
)


# ============================================================
# DETERMINE STATE DICT
# ============================================================

if isinstance(
    checkpoint,
    dict
):

    if "state_dict" in checkpoint:

        state_dict = checkpoint[
            "state_dict"
        ]

    elif "model_state_dict" in checkpoint:

        state_dict = checkpoint[
            "model_state_dict"
        ]

    else:

        state_dict = checkpoint

else:

    raise ValueError(
        "Unsupported model checkpoint format."
    )


# ============================================================
# REMOVE POSSIBLE PREFIX
# ============================================================

clean_state_dict = {}

for key, value in state_dict.items():

    new_key = key

    if new_key.startswith(
        "module."
    ):

        new_key = new_key[
            len("module.") :
        ]

    clean_state_dict[
        new_key
    ] = value


state_dict = clean_state_dict


# ============================================================
# DETERMINE MODEL SIZE
# ============================================================

num_users = (
    state_dict[
        "user_embedding.weight"
    ].shape[0]
)

num_movies = (
    state_dict[
        "movie_embedding.weight"
    ].shape[0]
)

embedding_dim = (
    state_dict[
        "user_embedding.weight"
    ].shape[1]
)


print(
    f"Users: {num_users}"
)

print(
    f"Movies: {num_movies}"
)

print(
    f"Embedding dimension: {embedding_dim}"
)


# ============================================================
# CREATE MODEL
# ============================================================

model = MovieRecommendationModel(
    num_users=num_users,

    num_movies=num_movies,

    embedding_dim=embedding_dim
)


# ============================================================
# LOAD WEIGHTS
# ============================================================

model.load_state_dict(
    state_dict
)

model.to(
    DEVICE
)

model.eval()


print(
    "Model loaded successfully!"
)


# ============================================================
# GET MOVIE EMBEDDING
# ============================================================

def get_movie_embedding(
    movie_id
):

    if movie_id not in movie_to_idx:

        return None

    movie_index = movie_to_idx[
        movie_id
    ]

    movie_tensor = torch.tensor(
        [movie_index],
        dtype=torch.long,
        device=DEVICE
    )

    with torch.no_grad():

        embedding = (
            model.movie_embedding(
                movie_tensor
            )[0]
        )

    return embedding


# ============================================================
# BUILD USER PROFILE
# ============================================================

def build_user_profile(
    liked_movie_ids,
    disliked_movie_ids
):

    liked_embeddings = []

    disliked_embeddings = []


    # --------------------------------------------------------
    # LIKED MOVIES
    # --------------------------------------------------------

    for movie_id in liked_movie_ids:

        embedding = get_movie_embedding(
            movie_id
        )

        if embedding is not None:

            liked_embeddings.append(
                embedding
            )


    # --------------------------------------------------------
    # DISLIKED MOVIES
    # --------------------------------------------------------

    for movie_id in disliked_movie_ids:

        embedding = get_movie_embedding(
            movie_id
        )

        if embedding is not None:

            disliked_embeddings.append(
                embedding
            )


    # --------------------------------------------------------
    # NO LIKES
    # --------------------------------------------------------

    if not liked_embeddings:

        return None


    # --------------------------------------------------------
    # AVERAGE LIKED EMBEDDINGS
    # --------------------------------------------------------

    liked_profile = torch.stack(
        liked_embeddings
    ).mean(
        dim=0
    )


    # --------------------------------------------------------
    # DISLIKED PROFILE
    # --------------------------------------------------------

    if disliked_embeddings:

        disliked_profile = (
            torch.stack(
                disliked_embeddings
            ).mean(
                dim=0
            )
        )

    else:

        disliked_profile = torch.zeros_like(
            liked_profile
        )


    # --------------------------------------------------------
    # COMBINE
    # --------------------------------------------------------

    profile = (
        liked_profile
        -
        0.35 * disliked_profile
    )


    return profile


# ============================================================
# GENRE PREFERENCES
# ============================================================

def build_genre_preferences(
    liked_movie_ids,
    disliked_movie_ids
):

    liked_counts = {}

    disliked_counts = {}


    # --------------------------------------------------------
    # LIKED GENRES
    # --------------------------------------------------------

    for movie_id in liked_movie_ids:

        genres = movie_genres.get(
            movie_id,
            set()
        )

        for genre in genres:

            liked_counts[
                genre
            ] = liked_counts.get(
                genre,
                0
            ) + 1


    # --------------------------------------------------------
    # DISLIKED GENRES
    # --------------------------------------------------------

    for movie_id in disliked_movie_ids:

        genres = movie_genres.get(
            movie_id,
            set()
        )

        for genre in genres:

            disliked_counts[
                genre
            ] = disliked_counts.get(
                genre,
                0
            ) + 1


    return (
        liked_counts,
        disliked_counts
    )


# ============================================================
# RECOMMENDATION FUNCTION
# ============================================================

def recommend_movies(
    liked_movie_ids,
    disliked_movie_ids,
    watched_movie_ids,
    n=10
):

    # --------------------------------------------------------
    # LIMIT NUMBER
    # --------------------------------------------------------

    n = max(
        1,
        min(
            int(n),
            50
        )
    )


    # --------------------------------------------------------
    # REMOVE DUPLICATES
    # --------------------------------------------------------

    liked_movie_ids = list(
        dict.fromkeys(
            liked_movie_ids
        )
    )

    disliked_movie_ids = list(
        dict.fromkeys(
            disliked_movie_ids
        )
    )

    watched_movie_ids = list(
        dict.fromkeys(
            watched_movie_ids
        )
    )


    # --------------------------------------------------------
    # USER PROFILE
    # --------------------------------------------------------

    user_profile = build_user_profile(
        liked_movie_ids,
        disliked_movie_ids
    )


    # --------------------------------------------------------
    # GENRE PROFILE
    # --------------------------------------------------------

    (
        liked_genres,
        disliked_genres
    ) = build_genre_preferences(
        liked_movie_ids,
        disliked_movie_ids
    )


    # --------------------------------------------------------
    # FALLBACK
    # --------------------------------------------------------

    if user_profile is None:

        # If there are no likes,
        # use popular/high-quality movies.

        available = []

        for _, row in movies_df.iterrows():

            movie_id = int(
                row["movieId"]
            )

            if movie_id in (
                set(liked_movie_ids)
                |
                set(disliked_movie_ids)
                |
                set(watched_movie_ids)
            ):

                continue

            if movie_id not in movie_to_idx:

                continue

            available.append(
                {
                    "movieId": movie_id,
                    "title": str(row["title"]),
                    "genres": get_movie_genres(movie_id),
                    "score": 0.0,
                    "imdbId": ml_to_imdb.get(movie_id),
                    "tmdbId": ml_to_tmdb.get(movie_id)
                }
            )

            if len(available) >= n:
                break

        return available


    # --------------------------------------------------------
    # NORMALIZE USER PROFILE
    # --------------------------------------------------------

    user_profile = (
        user_profile
        /
        (
            torch.norm(
                user_profile
            )
            +
            1e-8
        )
    )


    # --------------------------------------------------------
    # CANDIDATE MOVIE EMBEDDINGS
    # --------------------------------------------------------

    movie_embeddings = (
        model.movie_embedding.weight
    )


    movie_embeddings_normalized = (
        movie_embeddings
        /
        (
            torch.norm(
                movie_embeddings,
                dim=1,
                keepdim=True
            )
            +
            1e-8
        )
    )


    # --------------------------------------------------------
    # EMBEDDING SIMILARITY
    # --------------------------------------------------------

    similarity_scores = torch.matmul(
        movie_embeddings_normalized,
        user_profile
    )


    # --------------------------------------------------------
    # MOVIE BIAS
    # --------------------------------------------------------

    movie_bias = (
        model.movie_bias.weight
        .squeeze()
    )


    # Normalize bias

    bias_min = movie_bias.min()

    bias_max = movie_bias.max()

    normalized_bias = (
        movie_bias - bias_min
    ) / (
        bias_max - bias_min + 1e-8
    )


    # --------------------------------------------------------
    # BASE SCORE
    # --------------------------------------------------------

    base_scores = (
        0.80 * similarity_scores
        +
        0.20 * normalized_bias
    )


    # --------------------------------------------------------
    # INTERACTION SET
    # --------------------------------------------------------

    excluded_movies = (
        set(liked_movie_ids)
        |
        set(disliked_movie_ids)
        |
        set(watched_movie_ids)
    )


    # --------------------------------------------------------
    # CREATE CANDIDATES
    # --------------------------------------------------------

    candidates = []


    for movie_index in range(
        num_movies
    ):

        movie_id = idx_to_movie.get(
            movie_index
        )

        if movie_id is None:

            continue


        # ----------------------------------------------------
        # SKIP INTERACTED MOVIES
        # ----------------------------------------------------

        if movie_id in excluded_movies:

            continue


        # ----------------------------------------------------
        # SKIP UNKNOWN MOVIES
        # ----------------------------------------------------

        if movie_id not in movie_lookup.index:

            continue


        genres = movie_genres.get(
            movie_id,
            set()
        )


        if not genres:

            continue


        # ----------------------------------------------------
        # GENRE MATCH
        # ----------------------------------------------------

        liked_match = sum(
            liked_genres.get(
                genre,
                0
            )
            for genre in genres
        )


        disliked_match = sum(
            disliked_genres.get(
                genre,
                0
            )
            for genre in genres
        )


        # ----------------------------------------------------
        # NORMALIZE GENRE MATCH
        # ----------------------------------------------------

        total_liked = max(
            sum(
                liked_genres.values()
            ),
            1
        )


        total_disliked = max(
            sum(
                disliked_genres.values()
            ),
            1
        )


        genre_bonus = (
            liked_match
            /
            total_liked
        )


        genre_penalty = (
            disliked_match
            /
            total_disliked
        )


        # ----------------------------------------------------
        # FINAL SCORE
        # ----------------------------------------------------

        raw_score = float(
            base_scores[
                movie_index
            ].item()
        )


        final_score = (
            raw_score

            +
            0.30 * genre_bonus

            -
            0.35 * genre_penalty
        )


        candidates.append(
            {
                "movieId": movie_id,

                "title": get_movie_title(
                    movie_id
                ),

                "genres": get_movie_genres(
                    movie_id
                ),

                "score": final_score,

                "movie_index": movie_index,

                "imdbId": ml_to_imdb.get(movie_id),

                "tmdbId": ml_to_tmdb.get(movie_id)
            }
        )


    # ========================================================
    # SORT
    # ========================================================

    candidates.sort(
        key=lambda x: x["score"],
        reverse=True
    )


    # ========================================================
    # DIVERSITY
    # ========================================================

    selected = []

    used_genres = {}


    for candidate in candidates:

        if len(selected) >= n:

            break


        candidate_genres = set(
            candidate["genres"]
        )


        # ----------------------------------------------------
        # GENRE REPETITION PENALTY
        # ----------------------------------------------------

        repetition = sum(
            used_genres.get(
                genre,
                0
            )
            for genre in candidate_genres
        )


        diversity_score = (
            candidate["score"]
            -
            0.02 * repetition
        )


        candidate[
            "final_score"
        ] = diversity_score


        selected.append(
            candidate
        )


        for genre in candidate_genres:

            used_genres[
                genre
            ] = used_genres.get(
                genre,
                0
            ) + 1


    # ========================================================
    # FINAL SORT
    # ========================================================

    selected.sort(
        key=lambda x: x["final_score"],
        reverse=True
    )


    # ========================================================
    # RETURN CLEAN RESPONSE
    # ========================================================

    results = []


    for candidate in selected:

        movie_id_int = int(candidate["movieId"])
        results.append(
            {
                "movieId": movie_id_int,
                "title": candidate["title"],
                "genres": "|".join(candidate["genres"]),
                "score": round(float(candidate["final_score"]), 4),
                "imdbId": ml_to_imdb.get(movie_id_int),
                "tmdbId": ml_to_tmdb.get(movie_id_int)
            }
        )


    return results


# ============================================================
# API ENDPOINT
# ============================================================

@app.post(
    "/recommend"
)
def recommend(
    request: RecommendationRequest
):

    try:

        recommendations = recommend_movies(

            liked_movie_ids=
            request.liked_movie_ids,

            disliked_movie_ids=
            request.disliked_movie_ids,

            watched_movie_ids=
            request.watched_movie_ids,

            n=request.n
        )


        return {
            "success": True,

            "count": len(
                recommendations
            ),

            "recommendations":
                recommendations
        }


    except Exception as e:

        return {
            "success": False,

            "count": 0,

            "recommendations": [],

            "error": str(e)
        }


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/")
def root():

    return {
        "status": "online",

        "service":
            "FLIXREC Recommendation API",

        "model":
            "Matrix Factorization",

        "movies":
            num_movies
    }


# ============================================================
# TEST ENDPOINT
# ============================================================

@app.get("/health")
def health():

    return {
        "status": "healthy"
    }


# ============================================================
# RESOLUTION FUNCTIONS & ENDPOINTS
# ============================================================

def resolve_external_to_movielens(imdb_id: Optional[str] = None, tmdb_id: Optional[str] = None, title: Optional[str] = None, year: Optional[int] = None, media_type: Optional[str] = "movie"):
    if media_type in ["series", "tv", "tv_series"]:
        return {
            "resolved": False,
            "found": False, 
            "movieLensId": None, 
            "imdbId": str(imdb_id) if imdb_id else None,
            "tmdbId": str(tmdb_id) if tmdb_id else None,
            "reason": "TV/Web series are not indexed in the MovieLens dataset"
        }
        
    # 1. Try IMDb ID (handles tt-prefix, zero-padded, raw numbers)
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
                "title": get_movie_title(mid)
            }
        
    # 2. Try TMDB ID (handles integers, floats, strings)
    if tmdb_id:
        clean_tmdb = str(tmdb_id).strip()
        if clean_tmdb.endswith('.0'): clean_tmdb = clean_tmdb[:-2]
        if clean_tmdb in tmdbToMovieLens:
            mid = int(tmdbToMovieLens[clean_tmdb])
            return {
                "resolved": True,
                "found": True, 
                "movieLensId": mid, 
                "imdbId": movieLensToImdb.get(mid),
                "tmdbId": movieLensToTmdb.get(mid),
                "title": get_movie_title(mid)
            }
        
    # 3. Fallback to Title + Year matching
    if title:
        norm_title = clean_movie_title(title)
        matches = movies_df[movies_df['normalized_title'] == norm_title]
        if not matches.empty:
            if year:
                year_matches = matches[matches['title'].str.contains(f"\\({year}\\)")]
                if not year_matches.empty:
                    mid = int(year_matches.iloc[0]['movieId'])
                    return {
                        "resolved": True,
                        "found": True, 
                        "movieLensId": mid, 
                        "imdbId": movieLensToImdb.get(mid),
                        "tmdbId": movieLensToTmdb.get(mid),
                        "title": year_matches.iloc[0]['title']
                    }
            mid = int(matches.iloc[0]['movieId'])
            return {
                "resolved": True,
                "found": True, 
                "movieLensId": mid, 
                "imdbId": movieLensToImdb.get(mid),
                "tmdbId": movieLensToTmdb.get(mid),
                "title": matches.iloc[0]['title']
            }
            
    return {
        "resolved": False,
        "found": False, 
        "movieLensId": None,
        "imdbId": str(imdb_id) if imdb_id else None,
        "tmdbId": str(tmdb_id) if tmdb_id else None,
        "reason": "No MovieLens mapping found"
    }


def resolve_movielens_to_external(movieLensId: int):
    tmdb = movieLensToTmdb.get(movieLensId)
    imdb = movieLensToImdb.get(movieLensId)
    
    if pd.isna(tmdb): tmdb = None
    if pd.isna(imdb): imdb = None
    
    return {
        "resolved": bool(tmdb or imdb),
        "found": bool(tmdb or imdb), 
        "movieLensId": movieLensId, 
        "imdbId": str(imdb) if imdb else None, 
        "tmdbId": str(tmdb) if tmdb else None
    }


@app.post("/resolve-external")
@app.post("/resolve-movie")
def resolve_external(req: ResolveExternalRequest):
    return resolve_external_to_movielens(
        imdb_id=req.imdbId,
        tmdb_id=req.tmdbId,
        title=req.title,
        year=req.year,
        media_type=req.type
    )


@app.get("/resolve/{movieLensId}")
def resolve_ml_id(movieLensId: int):
    return resolve_movielens_to_external(movieLensId)


# ============================================================
# UNIFIED HYBRID RECOMMENDATION ENDPOINT
# ============================================================

@app.post("/recommend/unified")
def recommend_unified(req: UnifiedRecommendationRequest):
    try:
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
                
        # Exclude set
        excluded_ids = set(liked_ml_ids + disliked_ml_ids + watched_ml_ids)
        liked_genre_set = set(all_liked_genres)

        candidate_map = {}

        # 1. Generate Collaborative ML candidates if valid ML IDs exist
        if liked_ml_ids:
            ml_recs = recommend_movies(
                liked_movie_ids=liked_ml_ids,
                disliked_movie_ids=disliked_ml_ids,
                watched_movie_ids=watched_ml_ids,
                n=max(req.n * 3, 30)
            )
            for rec in ml_recs:
                mid = rec["movieId"]
                if mid in excluded_ids:
                    continue
                rec_genres = set(rec["genres"].split("|")) if isinstance(rec["genres"], str) else set()
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

        # 2. Generate Content-based candidates matching liked genres (for TV / unresolved titles)
        if liked_genre_set:
            genre_pattern = "|".join([re.escape(g) for g in liked_genre_set if g])
            if genre_pattern:
                matching_movies = movies_df[movies_df['genres'].str.contains(genre_pattern, case=False, na=False)]
                scored_content = []
                for _, row in matching_movies.iterrows():
                    mid = int(row['movieId'])
                    if mid in excluded_ids or mid in candidate_map:
                        continue
                    rec_genres = set(str(row['genres']).split("|"))
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
                        "title": row['title'],
                        "genres": row['genres'],
                        "score": round(0.85 * content_score, 4),
                        "source": "content",
                        "imdbId": movieLensToImdb.get(mid),
                        "tmdbId": movieLensToTmdb.get(mid)
                    }

        # If no candidates found, fallback to standard recommend_movies
        if not candidate_map:
            ml_recs = recommend_movies(
                liked_movie_ids=liked_ml_ids,
                disliked_movie_ids=disliked_ml_ids,
                watched_movie_ids=watched_ml_ids,
                n=req.n
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
        return {
            "success": False,
            "count": 0,
            "recommendations": [],
            "error": str(e)
        }


if __name__ == "__main__":

    import uvicorn


    print()
    print("=" * 60)
    print("FLIXREC RECOMMENDATION API")
    print("=" * 60)

    print(
        f"Movies: {num_movies}"
    )

    print(
        f"Users: {num_users}"
    )

    print(
        f"Embedding: {embedding_dim}"
    )

    print("=" * 60)


    # --------------------------------------------------------
    # TEST MOVIES
    # --------------------------------------------------------

    test_liked = [
        2571,      # Matrix
        27205,     # Inception
        157336     # Interstellar
    ]

    test_disliked = []

    test_watched = []


    print()
    print(
        "Testing recommendation system..."
    )

    print(
        "Liked:",
        test_liked
    )

    print(
        "Disliked:",
        test_disliked
    )

    print(
        "Watched:",
        test_watched
    )


    results = recommend_movies(

        liked_movie_ids=
        test_liked,

        disliked_movie_ids=
        test_disliked,

        watched_movie_ids=
        test_watched,

        n=10
    )


    print()
    print("=" * 60)
    print("FINAL RECOMMENDATIONS")
    print("=" * 60)


    for i, movie in enumerate(
        results,
        start=1
    ):

        print(
            f"{i}. "
            f"{movie['title']} | "
            f"Genres: {movie['genres']} | "
            f"Score: {movie['score']}"
        )


    print("=" * 60)

    print(
        f"Total recommendations: "
        f"{len(results)}"
    )

    print("=" * 60)


    # --------------------------------------------------------
    # START SERVER
    # --------------------------------------------------------

    print()
    print(
        "Starting FastAPI server..."
    )

    print(
        "API: http://127.0.0.1:8000"
    )

    print(
        "Docs: http://127.0.0.1:8000/docs"
    )

    print()


    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000
    )