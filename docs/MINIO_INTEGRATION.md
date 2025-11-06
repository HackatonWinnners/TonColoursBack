# MinIO Integration Summary

## What We've Built

A complete **MinIO-based storage solution** for TON Colours NFT SVG images with intelligent fallbacks and GetGems compatibility.

## Architecture

```
┌─────────────┐
│ Mint Request│
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ 1. Upload to MinIO  │  ← SVG generated and stored
│    svgs/FF0000.svg  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 2. Mint NFT on TON  │  ← Metadata references MinIO URL
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 3. GetGems fetches  │  ← Fast, cached, permanent URL
│    from MinIO       │
└─────────────────────┘
```

## Key Features

### 1. **Smart URL Strategy**
- **Primary**: MinIO URL (if configured)
- **Fallback 1**: Backend `/image` endpoint
- **Fallback 2**: Base64 `image_data` in metadata

### 2. **Automatic Deduplication**
```javascript
// First mint of red
uploadColorSvgToMinio('#FF0000') // → Uploads to MinIO
// Second mint of red  
uploadColorSvgToMinio('#FF0000') // → Skips (already exists)
```

### 3. **Production-Ready**
- ✅ Aggressive caching (1 year TTL)
- ✅ Public read access
- ✅ Proper content types
- ✅ Metadata timestamps
- ✅ Error handling with fallbacks

## Setup Options

### Option A: Local Development (Docker)

```bash
# 1. Start MinIO
docker-compose up -d

# 2. Test integration
npm run test:minio

# 3. Start backend
npm start
```

MinIO will be accessible at:
- API: `http://localhost:9000`
- Console: `http://localhost:9001`
- Bucket: `ton-colours` (auto-created, public read)

### Option B: Production (Cloud)

#### Deploy MinIO to Server

```bash
# Example: DigitalOcean Droplet
ssh root@your-server

# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone repo and start MinIO
git clone https://github.com/HackatonWinnners/TonColoursBack.git
cd TonColoursBack
docker-compose up -d
```

#### Configure Public Access

**Option 1: Direct Domain**
```env
MINIO_ENDPOINT=http://your-server-ip:9000
MINIO_PUBLIC_URL=http://your-server-ip:9000
```

**Option 2: Ngrok Tunnel**
```bash
ngrok http 9000
```
```env
MINIO_PUBLIC_URL=https://abc-def.ngrok-free.dev
```

**Option 3: CloudFlare + Custom Domain**
```
minio.yourproject.com → Server IP (CloudFlare proxy ON)
```
```env
MINIO_PUBLIC_URL=https://minio.yourproject.com
```

## Environment Variables

```env
# Required
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=ton-colours

# Optional
MINIO_REGION=us-east-1
MINIO_PUBLIC_URL=https://your-cdn.com  # For production
```

## Testing

### 1. Test MinIO Connection
```bash
npm run test:minio
```

Expected output:
```
✅ MinIO configured
✅ #FF0000 → http://localhost:9000/ton-colours/svgs/FF0000.svg
✅ #00FF00 → http://localhost:9000/ton-colours/svgs/00FF00.svg
✅ Duplicate upload skipped
```

### 2. Test Full Mint Flow
```bash
curl -X POST http://localhost:3000/mint \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "EQCzb...",
    "telegramUserId": 123,
    "color": "#FF0000"
  }'
```

Response includes:
```json
{
  "status": "submitted",
  "minioUrl": "http://localhost:9000/ton-colours/svgs/FF0000.svg",
  "metadataUri": "https://your-backend/metadata/1?color=FF0000&..."
}
```

### 3. Verify Metadata
```bash
curl "http://localhost:3000/metadata/1?color=FF0000&tg=123"
```

Should show:
```json
{
  "image": "http://localhost:9000/ton-colours/svgs/FF0000.svg",
  "image_data": "PD94bWwg...",
  ...
}
```

## Benefits Over Backend-Only

| Feature | Backend URL | MinIO URL |
|---------|-------------|-----------|
| **Survives restarts** | ❌ Needs server running | ✅ Persistent |
| **CDN-ready** | ❌ Not scalable | ✅ Add CloudFlare |
| **Deduplication** | ❌ Generated each time | ✅ Stored once |
| **Bandwidth cost** | ❌ Server bandwidth | ✅ MinIO/CDN |
| **GetGems reliable** | ⚠️ May timeout | ✅ Fast, cached |

## Troubleshooting

### MinIO not accessible
```bash
# Check if running
docker ps | grep minio

# Check logs
docker logs ton-colours-minio

# Restart
docker-compose restart
```

### Bucket not created
```bash
# Manual creation
docker exec -it ton-colours-minio \
  mc mb myminio/ton-colours --ignore-existing

# Set public read
docker exec -it ton-colours-minio \
  mc anonymous set download myminio/ton-colours
```

### Upload fails with 403
Check credentials in `.env` match container:
```bash
docker exec -it ton-colours-minio env | grep MINIO_ROOT
```

## Next Steps

1. **Local Testing**: Start MinIO with `docker-compose up -d`
2. **Mint NFT**: Test full flow with Telegram bot
3. **Verify GetGems**: Check if NFT appears on marketplace
4. **Production**: Deploy MinIO to cloud + setup domain/CDN
5. **Scale**: Add CloudFlare for global CDN distribution

## Production Checklist

- [ ] MinIO deployed to server with public IP
- [ ] Domain pointed to MinIO (e.g., `minio.project.com`)
- [ ] CloudFlare proxy enabled (optional but recommended)
- [ ] `MINIO_PUBLIC_URL` set in production `.env`
- [ ] HTTPS enabled (Let's Encrypt or CloudFlare)
- [ ] Backup strategy configured for MinIO data
- [ ] Monitoring added (uptime, storage usage)

---

**Result**: Permanent, fast, CDN-ready SVG storage for TON NFTs! 🚀
