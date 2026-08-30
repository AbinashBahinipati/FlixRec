# 🎬 FLIXREC — AI Movie & Web Series Recommendation System

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js" />
  <img src="https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/Python-3.9+-yellow?style=for-the-badge&logo=python" />
  <img src="https://img.shields.io/badge/FastAPI-green?style=for-the-badge&logo=fastapi" />
  <img src="https://img.shields.io/badge/PyTorch-red?style=for-the-badge&logo=pytorch" />
  <img src="https://img.shields.io/badge/MongoDB-green?style=for-the-badge&logo=mongodb" />
</p>

<p align="center">
  <b>An intelligent movie and web series recommendation platform that learns from your preferences.</b>
</p>

<p align="center">
  🌐 <b>Live Demo:</b> https://flixrec.vercel.app/
</p>

---

## 📌 About The Project

**FlixRec** is an AI-powered movie and web series recommendation system designed to provide personalized recommendations based on a user's interests and viewing activity.

The system combines:

- 🤖 Collaborative Filtering
- 🎯 Content-Based Recommendation
- 🧠 PyTorch Matrix Factorization
- 🎬 MovieLens Dataset
- 🌐 Watchmode API
- 🎞️ TMDB / IMDb metadata
- 💾 MongoDB user preferences

Unlike a basic recommendation system, FlixRec supports both **movies and TV/web series**, including newer titles that may not exist in the MovieLens dataset.

---

## ✨ Features

### 🎯 Personalized Recommendations

Recommendations are generated based on the user's:

- Liked movies
- Liked web series
- Watched content
- Disliked content
- Genres and content preferences

The system combines collaborative and content-based recommendation techniques to generate personalized results.

### ❤️ Like / Unlike System

Users can:

- Like movies
- Unlike movies
- Like web series
- Remove likes
- Maintain preferences across sessions

User preferences are synchronized and persisted using the application's preference system and MongoDB authentication backend.

### 🎬 Movie & Web Series Support

FlixRec supports:

- Movies
- TV shows
- Web series
- New releases
- Older movies
- Content that is not present in MovieLens

### 🔎 Search

Users can search for movies and series and interact with the results.

### 📋 Watchlist

Users can save content to their personal watchlist for later.

### 👤 User Authentication

FlixRec provides:

- User registration
- User login
- Secure sessions
- Password hashing
- Persistent user preferences

### ⭐ Ratings & Metadata

Movie and series information includes:

- Ratings
- Posters
- Backdrops
- Genres
- Overview
- Release information
- Streaming availability where available

---

# 🧠 Recommendation Architecture

FlixRec uses a **hybrid recommendation architecture**.

```text
                    USER
                     │
                     ▼
              User Preferences
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
   MovieLens IDs          Media Metadata
          │                     │
          ▼                     ▼
 Collaborative            Content-Based
 Filtering                Recommendation
          │                     │
          └──────────┬──────────┘
                     ▼
              Hybrid Ranking
                     │
                     ▼
              Recommendation
                  Results
                     │
                     ▼
             Watchmode Enrichment
                     │
                     ▼
             Posters + Details
