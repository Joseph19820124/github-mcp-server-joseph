const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { Octokit } = require('@octokit/rest');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(compression());
app.use(express.json());

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const clients = new Map();

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/sse/github/:owner/:repo', async (req, res) => {
  const { owner, repo } = req.params;
  const clientId = Date.now();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const client = {
    id: clientId,
    response: res,
    owner,
    repo
  };

  clients.set(clientId, client);

  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

  req.on('close', () => {
    clients.delete(clientId);
    console.log(`Client ${clientId} disconnected`);
  });

  sendInitialData(client);
  setupPolling(client);
});

async function sendInitialData(client) {
  try {
    const [repoData, commits, issues, pulls] = await Promise.all([
      octokit.repos.get({ owner: client.owner, repo: client.repo }),
      octokit.repos.listCommits({ owner: client.owner, repo: client.repo, per_page: 10 }),
      octokit.issues.listForRepo({ owner: client.owner, repo: client.repo, state: 'open', per_page: 10 }),
      octokit.pulls.list({ owner: client.owner, repo: client.repo, state: 'open', per_page: 10 })
    ]);

    const data = {
      type: 'initial_data',
      repository: repoData.data,
      recent_commits: commits.data,
      open_issues: issues.data,
      open_pulls: pulls.data
    };

    client.response.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (error) {
    console.error('Error fetching initial data:', error.message);
    client.response.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
  }
}

function setupPolling(client) {
  const pollInterval = setInterval(async () => {
    if (!clients.has(client.id)) {
      clearInterval(pollInterval);
      return;
    }

    try {
      const events = await octokit.activity.listRepoEvents({
        owner: client.owner,
        repo: client.repo,
        per_page: 5
      });

      if (events.data.length > 0) {
        client.response.write(`data: ${JSON.stringify({
          type: 'events',
          events: events.data
        })}\n\n`);
      }
    } catch (error) {
      console.error('Polling error:', error.message);
    }
  }, 30000); // Poll every 30 seconds
}

app.get('/api/repos/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    console.log(`API request: GET /api/repos/${owner}/${repo}`);
    const data = await octokit.repos.get({ owner, repo });
    res.json(data.data);
  } catch (error) {
    console.error(`API error: ${error.message}`);
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/repos/:owner/:repo/commits', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { page = 1, per_page = 30 } = req.query;
    const data = await octokit.repos.listCommits({ owner, repo, page, per_page });
    res.json(data.data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`GitHub MCP Server running on port ${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse/github/:owner/:repo`);
});