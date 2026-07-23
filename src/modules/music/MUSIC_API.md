# Music API Documentation

## Overview

The Music API is a single shared sound library used by Posts, Stories,
BusinessPosts, and BusinessStories — a TikTok/Instagram-style system for
attaching a track to a piece of content, browsing a song's own page, and
turning a creator's own clip audio into a reusable "Original sound".

This extends the existing backend. No existing model, route, or field was
removed or renamed.

## Base URL
```
/music
```

## Endpoints

### 1. List music library
**GET** `/music?cursor=&take=20&source=`

Paginated, newest first. `source` optionally filters to `library` or
`original`.

**Authentication:** Not required.

**Response:**
```json
{
  "items": [
    {
      "id": "music-123",
      "title": "Sunny Day",
      "artist": "DJ Sample",
      "album": null,
      "artworkUrl": "https://...",
      "audioUrl": "https://...",
      "duration": 32,
      "source": "library",
      "status": "ready",
      "uploadedById": null,
      "playCount": 0,
      "useCount": 128,
      "favoriteCount": 14,
      "createdAt": "2026-07-01T10:00:00Z",
      "updatedAt": "2026-07-01T10:00:00Z"
    }
  ],
  "nextCursor": "2026-07-01T10:00:00Z"
}
```

---

### 2. Get a song page
**GET** `/music/:id`

**Authentication:** Optional — when a valid token is sent, the response
includes `favoritedByMe`.

**Response:**
```json
{
  "id": "music-123",
  "title": "Sunny Day",
  "artist": "DJ Sample",
  "artworkUrl": "https://...",
  "audioUrl": "https://...",
  "duration": 32,
  "useCount": 128,
  "playCount": 402,
  "favoriteCount": 14,
  "totalVideos": 96,
  "totalStories": 22,
  "totalBusinessPosts": 8,
  "totalBusinessStories": 2,
  "favoritedByMe": false
}
```

---

### 3. Get content using a song
**GET** `/music/:id/posts?take=12`

Returns everything currently referencing the track, grouped by content
type (each capped at `take`, most recent first).

**Authentication:** Optional.

**Response:**
```json
{
  "posts": [ { "id": "...", "contentUrl": "...", "author": { "...": "..." } } ],
  "stories": [ { "id": "...", "contentUrl": "...", "user": { "...": "..." } } ],
  "businessPosts": [ { "id": "...", "business": { "...": "..." } } ],
  "businessStories": [ { "id": "...", "business": { "...": "..." } } ]
}
```

---

### 4. Trending sounds
**GET** `/music/trending?take=20`

Ranked by current `useCount`, tie-broken by `playCount`.

**Authentication:** Not required.

---

### 5. Search
**GET** `/music/search?q=sunny&cursor=&take=20`

Matches `title`, `artist`, and `album` (case-insensitive).

**Authentication:** Not required.

---

### 6. Upload a sound
**POST** `/music/upload`

**Authentication:** Required (JWT Bearer Token)

**Request:** `multipart/form-data`
- `audio` (file, required) — mp3/mp4/m4a/aac/wav/ogg, max 25MB
- `artwork` (file, optional) — image, max 20MB
- `title` (string, required)
- `artist` (string, optional — defaults to `@<uploader handle>` when `source` is `original`)
- `album` (string, optional)
- `source` (`library` | `original`, optional — defaults to `original`)

**Response:** the created `Music` record.

---

### 7. Use a sound
**POST** `/music/:id/use`

Increments the track's `useCount`. Called by the client when a user taps
"Use this sound", and internally whenever a Post/Story is created with a
`musicId` — see "Upload Flow" below.

**Authentication:** Required.

---

### 8. Favorite / unfavorite a sound
**POST** `/music/:id/favorite`
**DELETE** `/music/:id/favorite`

Idempotent toggle-style endpoints backed by a `MusicFavorite` join table;
`favoriteCount` on `Music` stays in sync automatically.

**Authentication:** Required.

---

## Attaching music to a Post or Story

`POST /posts` and `POST /stories` (multipart, unchanged endpoints) now
accept these additional fields:

| Field              | Type    | Notes                                              |
|--------------------|---------|-----------------------------------------------------|
| `musicId`          | string  | Reference an existing library/original track        |
| `musicStart`       | number  | Seconds into the track playback starts (default 0)  |
| `musicDuration`    | number  | Seconds of the track actually used                   |
| `musicVolume`      | number  | 0.0–1.0 mix level (default 1.0)                       |
| `useOriginalAudio` | boolean | Extract the uploaded clip's own audio into a new "Original sound - @username" track instead of referencing an existing one |

`musicId` and `useOriginalAudio` are mutually exclusive — send at most one.

Both endpoints return the created Post/Story with a `music` block:
```json
{
  "music": { "id": "...", "title": "...", "artist": "...", "artworkUrl": "..." },
  "musicStart": 12,
  "musicDuration": 15,
  "musicVolume": 0.8
}
```
`music` is `null` when no track is attached — every existing client that
ignores unknown fields keeps working unchanged.

The feed/detail endpoints (`GET /posts/feed`, `GET /posts/:id`,
`GET /stories/feed`, `GET /stories/my`) include the same `music` block on
every item.

## Upload flow (client)

1. Upload video/image as today.
2. Either:
   - Browse `/music` or `/music/search`, pick a track, pass its `id` as
     `musicId` on `POST /posts` / `POST /stories`, **or**
   - Toggle "use my own audio" and send `useOriginalAudio: true` instead —
     the server extracts the clip's audio track server-side and creates
     the Music record for you.
3. No audio file is ever duplicated: every post/story that shares a sound
   points at the same `Music.audioUrl`.

## Notes on BusinessPost / BusinessStory

`schema.prisma`'s `BusinessPost` and `BusinessStory` models now carry the
same `musicId` / `musicStart` / `musicDuration` / `musicVolume` fields and
relation as `Post` and `Story`, and `MusicService.getUsage()` already
queries both. However, the current codebase has no
`business-posts`/`business-stories` controller or service yet (only the
Prisma models exist) — so there's no existing module to "extend" for
those two content types the way there is for `PostsModule`/`StoriesModule`.
The schema and Music library are ready for them; wiring up
`BusinessPostsModule`/`BusinessStoriesModule` themselves is a separate
piece of work happy to pick up next.

## Future scalability

Nothing above assumes `library`/`original` are the only sources or that
`ready` is a same-request synchronous state — `MusicSource` and
`MusicStatus` are plain enums, so AI-generated tracks, licensed catalogue
ingestion (with a `processing` → `ready` async pipeline), podcasts, sound
effects, voiceovers, and multi-language metadata can all be added later
as new enum values / optional columns without breaking existing rows.
