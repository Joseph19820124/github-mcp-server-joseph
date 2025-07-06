#!/bin/bash

echo "Setting up GitHub MCP Server for Claude Desktop"
echo "=============================================="

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "jq is required but not installed. Please install it with: brew install jq"
    exit 1
fi

# Claude Desktop config file path
CONFIG_FILE="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
PROJECT_DIR="$(pwd)"

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Creating Claude Desktop config file..."
    mkdir -p "$(dirname "$CONFIG_FILE")"
    echo '{"mcpServers": {}}' > "$CONFIG_FILE"
fi

# Backup existing config
cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
echo "Backed up existing config to $CONFIG_FILE.backup"

# Add our MCP server to the config
echo "Adding GitHub MCP Server to Claude Desktop config..."

# Create temporary file with new server config
jq --arg cmd "node" \
   --arg script "$PROJECT_DIR/mcp-bridge.js" \
   --arg token "${GITHUB_TOKEN:-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}" \
   '.mcpServers["github-custom"] = {
      "command": $cmd,
      "args": [$script],
      "env": {
        "MCP_SERVER_URL": "http://localhost:3000",
        "GITHUB_TOKEN": $token
      }
    }' "$CONFIG_FILE" > "$CONFIG_FILE.tmp"

# Replace config file
mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"

echo "✅ Configuration updated successfully!"
echo ""
echo "Next steps:"
echo "1. Make sure the Docker container is running:"
echo "   docker-compose up -d"
echo ""
echo "2. Restart Claude Desktop"
echo ""
echo "3. Test by asking Claude about GitHub repositories"
echo ""
echo "Available MCP tools in Claude:"
echo "- github_repository_info: Get repository information"
echo "- github_commits: Get recent commits"
echo "- github_live_events: Subscribe to live repository events"