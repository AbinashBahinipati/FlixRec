import os
import uvicorn
from recommender import app, recommend_movies, get_recommendation_resources

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    host = "0.0.0.0"
    uvicorn.run(app, host=host, port=port)