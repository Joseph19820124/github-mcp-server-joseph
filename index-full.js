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

// Helper function to handle API responses
function handleResponse(res, apiCall, logMessage) {
  console.log(`API request: ${logMessage}`);
  apiCall
    .then(response => res.json(response.data))
    .catch(error => {
      console.error(`API error: ${error.message}`);
      res.status(error.status || 500).json({ 
        error: error.message,
        status: error.status,
        documentation_url: error.documentation_url 
      });
    });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// SSE endpoint for live events
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
  }, 30000);
}

// =====================
// REPOSITORY ENDPOINTS
// =====================

// Get repository
app.get('/api/repos/:owner/:repo', (req, res) => {
  const { owner, repo } = req.params;
  handleResponse(res, 
    octokit.repos.get({ owner, repo }),
    `GET /api/repos/${owner}/${repo}`
  );
});

// List user repositories
app.get('/api/users/:username/repos', (req, res) => {
  const { username } = req.params;
  const { type = 'all', sort = 'updated', direction = 'desc', per_page = 30, page = 1 } = req.query;
  handleResponse(res,
    octokit.repos.listForUser({ username, type, sort, direction, per_page: parseInt(per_page), page: parseInt(page) }),
    `GET /api/users/${username}/repos`
  );
});

// Search repositories
app.get('/api/search/repositories', (req, res) => {
  const { q, sort = 'best-match', order = 'desc', per_page = 30, page = 1 } = req.query;
  handleResponse(res,
    octokit.search.repos({ q, sort, order, per_page: parseInt(per_page), page: parseInt(page) }),
    `GET /api/search/repositories?q=${q}`
  );
});

// Create repository
app.post('/api/user/repos', (req, res) => {
  const { 
    name, description, homepage, private: isPrivate, has_issues, has_projects, 
    has_wiki, has_downloads, is_template, team_id, auto_init, gitignore_template, 
    license_template, allow_squash_merge, allow_merge_commit, allow_rebase_merge, 
    allow_auto_merge, delete_branch_on_merge 
  } = req.body;
  handleResponse(res,
    octokit.repos.createForAuthenticatedUser({ 
      name, description, homepage, private: isPrivate, has_issues, has_projects,
      has_wiki, has_downloads, is_template, team_id, auto_init, gitignore_template,
      license_template, allow_squash_merge, allow_merge_commit, allow_rebase_merge,
      allow_auto_merge, delete_branch_on_merge
    }),
    `POST /api/user/repos - Create repository: ${name}`
  );
});

// Fork repository
app.post('/api/repos/:owner/:repo/forks', (req, res) => {
  const { owner, repo } = req.params;
  const { organization } = req.body;
  handleResponse(res,
    octokit.repos.createFork({ owner, repo, organization }),
    `POST /api/repos/${owner}/${repo}/forks`
  );
});

// ===================
// FILE ENDPOINTS
// ===================

// Get file contents
app.get('/api/repos/:owner/:repo/contents/:path(*)', (req, res) => {
  const { owner, repo, path } = req.params;
  const { ref } = req.query;
  handleResponse(res,
    octokit.repos.getContent({ owner, repo, path, ref }),
    `GET /api/repos/${owner}/${repo}/contents/${path}`
  );
});

// Create or update file
app.put('/api/repos/:owner/:repo/contents/:path(*)', (req, res) => {
  const { owner, repo, path } = req.params;
  const { message, content, sha, branch } = req.body;
  handleResponse(res,
    octokit.repos.createOrUpdateFileContents({ owner, repo, path, message, content, sha, branch }),
    `PUT /api/repos/${owner}/${repo}/contents/${path}`
  );
});

// Delete file
app.delete('/api/repos/:owner/:repo/contents/:path(*)', (req, res) => {
  const { owner, repo, path } = req.params;
  const { message, sha, branch } = req.body;
  handleResponse(res,
    octokit.repos.deleteFile({ owner, repo, path, message, sha, branch }),
    `DELETE /api/repos/${owner}/${repo}/contents/${path}`
  );
});

// ==================
// COMMIT ENDPOINTS
// ==================

// List commits
app.get('/api/repos/:owner/:repo/commits', (req, res) => {
  const { owner, repo } = req.params;
  const { sha, path, author, since, until, per_page = 30, page = 1 } = req.query;
  handleResponse(res,
    octokit.repos.listCommits({ 
      owner, repo, sha, path, author, since, until, 
      per_page: parseInt(per_page), page: parseInt(page) 
    }),
    `GET /api/repos/${owner}/${repo}/commits`
  );
});

// Get specific commit
app.get('/api/repos/:owner/:repo/commits/:ref', (req, res) => {
  const { owner, repo, ref } = req.params;
  handleResponse(res,
    octokit.repos.getCommit({ owner, repo, ref }),
    `GET /api/repos/${owner}/${repo}/commits/${ref}`
  );
});

// Compare commits
app.get('/api/repos/:owner/:repo/compare/:basehead', (req, res) => {
  const { owner, repo, basehead } = req.params;
  handleResponse(res,
    octokit.repos.compareCommits({ owner, repo, basehead }),
    `GET /api/repos/${owner}/${repo}/compare/${basehead}`
  );
});

// ==================
// BRANCH ENDPOINTS
// ==================

// List branches
app.get('/api/repos/:owner/:repo/branches', (req, res) => {
  const { owner, repo } = req.params;
  const { protected: isProtected, per_page = 30, page = 1 } = req.query;
  handleResponse(res,
    octokit.repos.listBranches({ 
      owner, repo, protected: isProtected === 'true', 
      per_page: parseInt(per_page), page: parseInt(page) 
    }),
    `GET /api/repos/${owner}/${repo}/branches`
  );
});

// Get specific branch
app.get('/api/repos/:owner/:repo/branches/:branch', (req, res) => {
  const { owner, repo, branch } = req.params;
  handleResponse(res,
    octokit.repos.getBranch({ owner, repo, branch }),
    `GET /api/repos/${owner}/${repo}/branches/${branch}`
  );
});

// Create branch (via git refs)
app.post('/api/repos/:owner/:repo/git/refs', (req, res) => {
  const { owner, repo } = req.params;
  const { ref, sha } = req.body;
  handleResponse(res,
    octokit.git.createRef({ owner, repo, ref, sha }),
    `POST /api/repos/${owner}/${repo}/git/refs`
  );
});

// =================
// ISSUE ENDPOINTS
// =================

// List issues
app.get('/api/repos/:owner/:repo/issues', (req, res) => {
  const { owner, repo } = req.params;
  const { 
    milestone, state = 'open', assignee, creator, mentioned, labels, 
    sort = 'created', direction = 'desc', since, per_page = 30, page = 1 
  } = req.query;
  handleResponse(res,
    octokit.issues.listForRepo({ 
      owner, repo, milestone, state, assignee, creator, mentioned, labels,
      sort, direction, since, per_page: parseInt(per_page), page: parseInt(page)
    }),
    `GET /api/repos/${owner}/${repo}/issues`
  );
});

// Get specific issue
app.get('/api/repos/:owner/:repo/issues/:issue_number', (req, res) => {
  const { owner, repo, issue_number } = req.params;
  handleResponse(res,
    octokit.issues.get({ owner, repo, issue_number: parseInt(issue_number) }),
    `GET /api/repos/${owner}/${repo}/issues/${issue_number}`
  );
});

// Create issue
app.post('/api/repos/:owner/:repo/issues', (req, res) => {
  const { owner, repo } = req.params;
  const { title, body, assignees, milestone, labels } = req.body;
  handleResponse(res,
    octokit.issues.create({ owner, repo, title, body, assignees, milestone, labels }),
    `POST /api/repos/${owner}/${repo}/issues`
  );
});

// Update issue
app.patch('/api/repos/:owner/:repo/issues/:issue_number', (req, res) => {
  const { owner, repo, issue_number } = req.params;
  const { title, body, state, assignees, labels } = req.body;
  handleResponse(res,
    octokit.issues.update({ 
      owner, repo, issue_number: parseInt(issue_number), 
      title, body, state, assignees, labels 
    }),
    `PATCH /api/repos/${owner}/${repo}/issues/${issue_number}`
  );
});

// ========================
// PULL REQUEST ENDPOINTS
// ========================

// List pull requests
app.get('/api/repos/:owner/:repo/pulls', (req, res) => {
  const { owner, repo } = req.params;
  const { 
    state = 'open', head, base, sort = 'created', 
    direction = 'desc', per_page = 30, page = 1 
  } = req.query;
  handleResponse(res,
    octokit.pulls.list({ 
      owner, repo, state, head, base, sort, direction,
      per_page: parseInt(per_page), page: parseInt(page)
    }),
    `GET /api/repos/${owner}/${repo}/pulls`
  );
});

// Get specific pull request
app.get('/api/repos/:owner/:repo/pulls/:pull_number', (req, res) => {
  const { owner, repo, pull_number } = req.params;
  handleResponse(res,
    octokit.pulls.get({ owner, repo, pull_number: parseInt(pull_number) }),
    `GET /api/repos/${owner}/${repo}/pulls/${pull_number}`
  );
});

// Create pull request
app.post('/api/repos/:owner/:repo/pulls', (req, res) => {
  const { owner, repo } = req.params;
  const { title, head, base, body, maintainer_can_modify, draft } = req.body;
  handleResponse(res,
    octokit.pulls.create({ 
      owner, repo, title, head, base, body, maintainer_can_modify, draft 
    }),
    `POST /api/repos/${owner}/${repo}/pulls`
  );
});

// Update pull request
app.patch('/api/repos/:owner/:repo/pulls/:pull_number', (req, res) => {
  const { owner, repo, pull_number } = req.params;
  const { title, body, state, base } = req.body;
  handleResponse(res,
    octokit.pulls.update({ 
      owner, repo, pull_number: parseInt(pull_number), 
      title, body, state, base 
    }),
    `PATCH /api/repos/${owner}/${repo}/pulls/${pull_number}`
  );
});

// Merge pull request
app.put('/api/repos/:owner/:repo/pulls/:pull_number/merge', (req, res) => {
  const { owner, repo, pull_number } = req.params;
  const { commit_title, commit_message, merge_method = 'merge' } = req.body;
  handleResponse(res,
    octokit.pulls.merge({ 
      owner, repo, pull_number: parseInt(pull_number), 
      commit_title, commit_message, merge_method 
    }),
    `PUT /api/repos/${owner}/${repo}/pulls/${pull_number}/merge`
  );
});

// ================
// USER ENDPOINTS
// ================

// Get user
app.get('/api/users/:username', (req, res) => {
  const { username } = req.params;
  handleResponse(res,
    octokit.users.getByUsername({ username }),
    `GET /api/users/${username}`
  );
});

// Get authenticated user
app.get('/api/user', (req, res) => {
  handleResponse(res,
    octokit.users.getAuthenticated(),
    `GET /api/user`
  );
});

// =================
// SEARCH ENDPOINTS
// =================

// Search code
app.get('/api/search/code', (req, res) => {
  const { q, sort, order = 'desc', per_page = 30, page = 1 } = req.query;
  handleResponse(res,
    octokit.search.code({ q, sort, order, per_page: parseInt(per_page), page: parseInt(page) }),
    `GET /api/search/code?q=${q}`
  );
});

// Search issues
app.get('/api/search/issues', (req, res) => {
  const { q, sort, order = 'desc', per_page = 30, page = 1 } = req.query;
  handleResponse(res,
    octokit.search.issuesAndPullRequests({ q, sort, order, per_page: parseInt(per_page), page: parseInt(page) }),
    `GET /api/search/issues?q=${q}`
  );
});

// Start server
app.listen(PORT, () => {
  console.log(`Enhanced GitHub MCP Server running on port ${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`- Health: http://localhost:${PORT}/health`);
  console.log(`- SSE: http://localhost:${PORT}/sse/github/:owner/:repo`);
  console.log(`- Repository APIs: /api/repos/*`);
  console.log(`- User APIs: /api/users/*`);
  console.log(`- Search APIs: /api/search/*`);
  console.log(`- Total MCP Tools: 27`);
});