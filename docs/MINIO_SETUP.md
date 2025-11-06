# MinIO Storage for TON Colours NFTs

This project uses MinIO as S3-compatible object storage for NFT SVG images.

## Why MinIO?

- **Self-hosted**: Full control over your data
- **S3-compatible**: Works with AWS S3 SDK
- **Fast**: High-performance object storage
- **Cost-effective**: No bandwidth/storage fees
- **Reliable**: Better than serving images from backend
- **GetGems compatible**: Permanent, cacheable URLs

## Quick Start

### 1. Start MinIO with Docker

```bash
docker-compose up -d
```

This starts:
- MinIO server on `http://localhost:9000` (API)
- MinIO Console on `http://localhost:9001` (Web UI)
- Auto-creates `ton-colours` bucket with public read access

### 2. Access MinIO Console

Open http://localhost:9001 in your browser:
- Username: `minioadmin`
- Password: `minioadmin123`

### 3. Configure Environment

Already configured in `.env`:
```env
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=ton-colours
```

### 4. Test Upload

```bash
npm run test:minio
```

## Production Setup

### Option 1: Ngrok Tunnel (Development/Testing)

1. Start ngrok for MinIO:
```bash
ngrok http 9000
```

2. Update `.env`:
```env
MINIO_PUBLIC_URL=https://your-minio-tunnel.ngrok-free.dev
```

### Option 2: Cloud Deployment

Deploy MinIO to:
- **AWS EC2** + Elastic IP
- **DigitalOcean Droplet** + Domain
- **Fly.io** + Custom domain
- **Kubernetes** cluster

Then set `MINIO_PUBLIC_URL` to your domain.

## How It Works

### Minting Flow

1. User requests mint via `/mint` endpoint
2. Backend generates SVG for color (e.g., `#FF0000`)
3. **Upload to MinIO**: `svgs/FF0000.svg`
4. MinIO returns public URL
5. Mint NFT with metadata pointing to MinIO URL
6. GetGems fetches SVG from MinIO (fast, cached)

### Deduplication

Same color = same MinIO object:
- First mint of `#FF0000` → uploads to MinIO
- Second mint of `#FF0000` → skips upload (already exists)
- Saves storage and bandwidth

### Metadata Structure

```json
{
  "name": "TON Colour #FF0000",
  "image": "http://localhost:9000/ton-colours/svgs/FF0000.svg",
  "image_data": "PD94bWwgdmVyc2lvbj0iMS4wIj4...",
  "background_color": "FF0000"
}
```

- `image`: MinIO URL (primary)
- `image_data`: Base64 SVG (fallback)

## Benefits

✅ **Permanent URLs**: SVGs don't disappear if backend restarts  
✅ **CDN-ready**: Add CloudFlare/CloudFront in front of MinIO  
✅ **Scalable**: Handle millions of NFTs  
✅ **Fast**: Aggressive caching (1 year TTL)  
✅ **GetGems compatible**: No "metadata unavailable" errors  

## Troubleshooting

### Connection Refused

```bash
docker-compose ps  # Check if MinIO is running
docker-compose logs minio  # Check logs
```

### Upload Fails

1. Check bucket exists:
```bash
docker exec -it ton-colours-minio mc ls myminio/
```

2. Verify permissions:
```bash
docker exec -it ton-colours-minio mc anonymous get myminio/ton-colours
# Should show: download
```

### URLs Not Accessible

- **Local development**: Use `http://localhost:9000/ton-colours/svgs/FF0000.svg`
- **Production**: Set `MINIO_PUBLIC_URL` to your domain

## Advanced: MinIO with CloudFlare

1. Deploy MinIO to server with public IP
2. Point domain to server: `minio.yourproject.com`
3. Add to CloudFlare (proxy enabled)
4. Update `.env`:
```env
MINIO_PUBLIC_URL=https://minio.yourproject.com
```

Now all SVGs are served via CloudFlare CDN! 🚀
