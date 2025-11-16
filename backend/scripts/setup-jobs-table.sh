#!/bin/bash

# Script to create jobs table via admin endpoint
# Run with: bash scripts/setup-jobs-table.sh

BACKEND_URL=${BACKEND_URL:-http://localhost:3001}

echo "🔍 Checking if jobs table exists..."
curl -s "${BACKEND_URL}/admin/check-jobs-table" | jq '.'

echo ""
echo "📦 Creating jobs table..."
curl -X POST -s "${BACKEND_URL}/admin/create-jobs-table" | jq '.'

echo ""
echo "✅ Done! Verify the table was created:"
curl -s "${BACKEND_URL}/admin/check-jobs-table" | jq '.'
