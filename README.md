# GitHub MCP Server

A Model Context Protocol (MCP) server for GitHub integration with real-time event streaming.

## Features

- Real-time GitHub repository events via Server-Sent Events (SSE)
- RESTful API for GitHub data access
- Docker support with production-ready configuration
- Environment variable configuration for security

## Quick Start

### Using Docker Compose

1. **Clone the repository:**
```bash
git clone https://github.com/Joseph19820124/github-mcp-server-joseph.git
cd github-mcp-server-joseph
```

2. **Set up environment variables:**
```bash
cp .env.example .env
```

3. **Edit `.env` file and add your GitHub token:**
```bash
GITHUB_TOKEN=your_github_personal_access_token
PORT=3000
```

4. **Start the server:**
```bash
docker-compose up -d
```

### Alternative: Direct Docker Run

You can also run the container directly with environment variables:

```bash
# Build the image
docker build -t github-mcp-server .

# Run with environment variable
docker run -d \
  --name github-mcp-server \
  -p 3000:3000 \
  -e GITHUB_TOKEN=your_github_personal_access_token \
  -e PORT=3000 \
  github-mcp-server:latest
```

### Local Development

```bash
# Install dependencies
npm install

# Set environment variables
export GITHUB_TOKEN=your_github_personal_access_token
export PORT=3000

# Start the server
npm start
```

## GitHub Token Setup

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate a new token with these permissions:
   - `repo` (for repository access)
   - `read:org` (for organization data)
   - `user` (for user information)
3. Copy the token and use it in your environment configuration

## API Endpoints

- `GET /health` - Health check
- `GET /sse/github/:owner/:repo` - SSE endpoint for real-time events
- `GET /api/repos/:owner/:repo` - Get repository information
- `GET /api/repos/:owner/:repo/commits` - Get repository commits

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | Yes | - |
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment (development/production) | No | development |

## Security

- Never commit your GitHub token to version control
- Use environment variables for sensitive configuration
- The Docker image does not contain any hardcoded tokens
- All tokens are injected at runtime through environment variables

## Health Check

The server includes a health check endpoint at `/health` that returns:
```json
{
  "status": "healthy",
  "timestamp": "2025-07-06T11:00:00.000Z"
}
```

## Production Deployment

For production deployment, use the provided `docker-compose.prod.yml`:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

This includes:
- Nginx reverse proxy
- Health checks
- Log rotation
- Restart policies

## Troubleshooting

### Common Issues

1. **"Bad credentials" error**: Check your GitHub token permissions
2. **Port already in use**: Change the PORT environment variable
3. **Docker build fails**: Ensure Docker is running and you have internet access

### Logs

View container logs:
```bash
docker-compose logs -f github-mcp-server
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License.