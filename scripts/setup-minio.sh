#!/bin/bash

# MinIO Setup Script for TON Colours Backend
# This script helps you set up MinIO for NFT image storage

echo "🎨 TON Colours - MinIO Setup"
echo "============================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first:"
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker daemon is not running."
    echo "   Please start Docker Desktop and try again."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Start MinIO
echo "🚀 Starting MinIO..."
docker-compose up -d

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ MinIO started successfully!"
    echo ""
    echo "📋 MinIO Details:"
    echo "   API:     http://localhost:9000"
    echo "   Console: http://localhost:9001"
    echo "   User:    minioadmin"
    echo "   Pass:    minioadmin123"
    echo "   Bucket:  ton-colours"
    echo ""
    echo "⏳ Waiting for MinIO to initialize..."
    sleep 5
    echo ""
    echo "🧪 Running integration test..."
    npm run test:minio
else
    echo ""
    echo "❌ Failed to start MinIO"
    exit 1
fi
