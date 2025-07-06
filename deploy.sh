#!/bin/bash

echo "GitHub MCP Server Docker Deployment"
echo "=================================="

if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    echo "Please copy .env.example to .env and configure your GitHub token."
    exit 1
fi

if ! grep -q "GITHUB_TOKEN=" .env || grep -q "GITHUB_TOKEN=your_github_personal_access_token" .env; then
    echo "Error: GITHUB_TOKEN not configured in .env file!"
    echo "Please add your GitHub personal access token to the .env file."
    exit 1
fi

echo "Building Docker image..."
docker-compose build

echo "Starting services..."
docker-compose up -d

echo "Waiting for services to be healthy..."
sleep 5

if docker-compose ps | grep -q "healthy"; then
    echo "✅ GitHub MCP Server is running!"
    echo ""
    echo "Access points:"
    echo "- Health check: http://localhost:3000/health"
    echo "- SSE endpoint: http://localhost:3000/sse/github/:owner/:repo"
    echo "- API endpoint: http://localhost:3000/api/repos/:owner/:repo"
    echo ""
    echo "Example SSE URL: http://localhost:3000/sse/github/facebook/react"
    echo ""
    echo "To view logs: docker-compose logs -f"
    echo "To stop: docker-compose down"
else
    echo "❌ Services failed to start properly"
    echo "Check logs with: docker-compose logs"
    exit 1
fi