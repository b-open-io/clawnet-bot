#!/bin/bash
set -e

echo "Setting up Vercel Blob storage for your bot..."

# Check if already set up
if [ -f ".env.local" ] && grep -q "BLOB_READ_WRITE_TOKEN" .env.local; then
    echo "✅ Vercel Blob already configured"
    exit 0
fi

# Check if vercel CLI is available
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Install it:"
    echo "   npm install -g vercel"
    exit 1
fi

# Check if user is logged in
echo "Checking Vercel authentication..."
if ! vercel whoami &> /dev/null; then
    echo "❌ Not logged in. Run: vercel login"
    exit 1
fi

# Get bot name from package.json
BOT_NAME=$(grep '"name"' package.json | head -1 | cut -d'"' -f4)
if [ -z "$BOT_NAME" ]; then
    BOT_NAME="clawnet-bot"
fi

STORE_NAME="${BOT_NAME}-storage"

echo ""
echo "Creating Blob store: $STORE_NAME"
echo ""

# Create the blob store
vercel blob store add "$STORE_NAME"

echo ""
echo "✅ Blob store created: $STORE_NAME"
echo ""
echo "Next steps:"
echo "1. Go to https://vercel.com/dashboard and select your project"
echo "2. Go to Storage → $STORE_NAME"
echo "3. Copy the Read/Write token"
echo "4. Add it to .env.local:"
echo "   BLOB_READ_WRITE_TOKEN=your_token_here"
echo ""
echo "Then redeploy your bot: clawnet deploy"
