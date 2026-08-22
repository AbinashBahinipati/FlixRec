from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import re

from recommender import recommend_for_new_user, movies_df


app = FastAPI(
    title="FLIXREC Recommendation API",
    description="AI Movie Recommendation Backend",
    version="1.0.0"
)


# Allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RecommendationRequest(BaseModel):

    liked_movie_ids: List[int] = []
    disliked_movie_ids: List[int] = []
    watched_movie_ids: List[int] = []
    n: int = 10


@app.get("/")
def home():

    return {
        "message": "FLIXREC AI Recommendation API is running!"
    }


@app.post("/recommend")
def recommend(request: RecommendationRequest):

    recommendations = recommend_for_new_user(
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

@app.get("/map_movie")
def map_movie(title: str = Query(...), year: str = Query(None)):
    escaped_title = re.escape(title)
    
    # 1. Try to match exact title with any year
    pattern1 = f"^{escaped_title} \\(\\d{{4}}\\)$"
    matches = movies_df[movies_df['title'].str.contains(pattern1, case=False, na=False, regex=True)]
    
    if not matches.empty:
        if year:
            year_matches = matches[matches['title'].str.contains(f"\\({year}\\)", regex=True)]
            if not year_matches.empty:
                return {"ml_id": int(year_matches.iloc[0]['movieId'])}
        return {"ml_id": int(matches.iloc[0]['movieId'])}
        
    # 2. Try exact match
    exact_matches = movies_df[movies_df['title'].str.lower() == title.lower()]
    if not exact_matches.empty:
        return {"ml_id": int(exact_matches.iloc[0]['movieId'])}
        
    # 3. Fallback to general contains
    partial_matches = movies_df[movies_df['title'].str.contains(escaped_title, case=False, na=False, regex=True)]
    if not partial_matches.empty:
        return {"ml_id": int(partial_matches.iloc[0]['movieId'])}
        
    return {"ml_id": None}