# SERVER_MAP.md

## Internal API Routes (Express)

### 1. Brand & Detail Management
- `GET /api/brands`: List all brands.
- `POST /api/brands`: Create or Update a brand.
- `DELETE /api/brands/:id`: Delete a brand.
- `GET /api/brands/:id`: Get detailed brand info.
- `POST /api/brands/:id/scan`: Trigger automated offer scanning using Gemini/Web.
- `POST /api/brands/:id/offers/save`: Save detected/verified offer.

### 2. WordPress Settings
- `GET /api/wp-settings`: Retrieve WP config (omitting sensitive data if possible).
- `POST /api/wp-settings`: Save WP config (Base URL, Username, Application Password).

### 3. Content Strategy & Strategy Engine
- `GET /api/strategy/next-task`: Returns the next recommended Brand and Content Type based on rotation rules.
- `GET /api/strategy/history`: Returns the history of published posts.

### 4. WordPress API Proxy
- `POST /api/wp/publish`: Formats and sends data to WP REST API.
  - Input: `title`, `content`, `excerpt`, `status`, `categories`, `featured_image_id`.
  - Output: WP Post Object (ID, Link).
- `POST /api/wp/upload-media`: Uploads a base64 or URL image to WP Media Library.
  - Output: Media ID.

### 5. Media & Image Management
- `GET /api/media`: List all images in the local library/cache.
- `POST /api/media/upload`: Upload image metadata to library.
- `DELETE /api/media/:id`: Remove image from library.
- `POST /api/media/suggest`: Logic for selecting best image for a brand/task.

### 6. AI Content
- `POST /api/ai/generate`: Prompts Gemini for content.
  - Input: `brand`, `type`, `niche`.
  - Output: `title`, `slug`, `content`, `excerpt`.

## WordPress REST API Endpoints Used
- `POST [BaseURL]/wp-json/wp/v2/posts`
- `POST [BaseURL]/wp-json/wp/v2/media`
- `GET [BaseURL]/wp-json/wp/v2/categories`
- `GET [BaseURL]/wp-json/wp/v2/posts?slug=[slug]` (Duplicate check)

## Error Handling
- Standard HTTP status codes (200, 400, 401, 500).
- WP Error response parsing to return actionable feedback to the UI.
- Retry logic for temporary AI generation failures.
