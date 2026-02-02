#!/bin/bash
set -e

echo "Setting up Convex for your bot..."

# Check if convex is already initialized
if [ -f "convex.json" ]; then
    echo "✅ Convex already initialized"
    exit 0
fi

# Install convex CLI if not present
if ! command -v convex &> /dev/null; then
    echo "Installing Convex CLI..."
    npm install -g convex
fi

# Initialize Convex
echo "Initializing Convex project..."
convex init

# Install convex package
echo "Installing convex package..."
bun add convex

# Copy schema from skill
echo "Setting up schema..."
cp skills/convex/convex/schema.ts convex/schema.ts

# Push schema
echo "Pushing schema to Convex..."
convex dev &
DEV_PID=$!
sleep 5
kill $DEV_PID 2>/dev/null || true

echo ""
echo "✅ Convex setup complete!"
echo ""
echo "Add these to your .env.local:"
echo "CONVEX_URL=$(grep 'deploymentUrl' convex.json | head -1 | cut -d'"' -f4)"
echo ""
echo "Run 'convex dev' to start the dev server"
