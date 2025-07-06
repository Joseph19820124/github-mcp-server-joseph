#!/usr/bin/env node

const EventSource = require('eventsource');
const http = require('http');
const readline = require('readline');

// MCP Protocol Constants
const JSONRPC_VERSION = "2.0";
const PROTOCOL_VERSION = "2024-11-05";

// Configuration
const SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';

// Debug logging to stderr
function debug(message) {
  console.error(`[mcp-bridge] ${new Date().toISOString()} ${message}`);
}

debug('Starting enhanced MCP bridge...');
debug(`Server URL: ${SERVER_URL}`);

// Setup readline interface for stdio communication
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Helper function to send JSON-RPC response
function sendResponse(id, result, error = null) {
  const response = {
    jsonrpc: JSONRPC_VERSION,
    id: id
  };
  
  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }
  
  const responseStr = JSON.stringify(response);
  debug(`Sending response: ${responseStr.substring(0, 200)}...`);
  console.log(responseStr);
}

// Helper function to send notification
function sendNotification(method, params) {
  const notification = {
    jsonrpc: JSONRPC_VERSION,
    method: method,
    params: params
  };
  
  const notificationStr = JSON.stringify(notification);
  debug(`Sending notification: ${notificationStr}`);
  console.log(notificationStr);
}

// Complete GitHub MCP Tools (26 tools)
const tools = [
  // Repository Tools
  {
    name: "github_get_repository",
    description: "Get detailed information about a GitHub repository",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_list_repositories",
    description: "List repositories for a user or organization",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "Username or organization" },
        type: { type: "string", enum: ["all", "owner", "member"], default: "all" },
        sort: { type: "string", enum: ["created", "updated", "pushed", "full_name"], default: "updated" },
        direction: { type: "string", enum: ["asc", "desc"], default: "desc" },
        per_page: { type: "number", default: 30, maximum: 100 },
        page: { type: "number", default: 1 }
      },
      required: ["username"]
    }
  },
  {
    name: "github_search_repositories",
    description: "Search for repositories on GitHub",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query" },
        sort: { type: "string", enum: ["stars", "forks", "help-wanted-issues", "updated"], default: "best-match" },
        order: { type: "string", enum: ["asc", "desc"], default: "desc" },
        per_page: { type: "number", default: 30, maximum: 100 },
        page: { type: "number", default: 1 }
      },
      required: ["q"]
    }
  },
  {
    name: "github_create_repository",
    description: "Create a new repository",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Repository name" },
        description: { type: "string", description: "Repository description" },
        homepage: { type: "string", description: "Repository homepage URL" },
        private: { type: "boolean", default: false, description: "Create private repository" },
        has_issues: { type: "boolean", default: true, description: "Enable issues" },
        has_projects: { type: "boolean", default: true, description: "Enable projects" },
        has_wiki: { type: "boolean", default: true, description: "Enable wiki" },
        has_downloads: { type: "boolean", default: true, description: "Enable downloads" },
        is_template: { type: "boolean", default: false, description: "Create as template repository" },
        team_id: { type: "number", description: "Team ID for organization repositories" },
        auto_init: { type: "boolean", default: false, description: "Initialize with README" },
        gitignore_template: { type: "string", description: "Gitignore template name" },
        license_template: { type: "string", description: "License template name" },
        allow_squash_merge: { type: "boolean", default: true, description: "Allow squash merge" },
        allow_merge_commit: { type: "boolean", default: true, description: "Allow merge commit" },
        allow_rebase_merge: { type: "boolean", default: true, description: "Allow rebase merge" },
        allow_auto_merge: { type: "boolean", default: false, description: "Allow auto merge" },
        delete_branch_on_merge: { type: "boolean", default: false, description: "Delete head branch on merge" }
      },
      required: ["name"]
    }
  },
  {
    name: "github_fork_repository",
    description: "Fork a repository",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        organization: { type: "string", description: "Optional organization to fork to" }
      },
      required: ["owner", "repo"]
    }
  },
  
  // File and Content Tools
  {
    name: "github_get_file_contents",
    description: "Get contents of a file from a repository",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        path: { type: "string", description: "File path" },
        ref: { type: "string", description: "Branch, tag, or commit SHA" }
      },
      required: ["owner", "repo", "path"]
    }
  },
  {
    name: "github_create_or_update_file",
    description: "Create or update a file in a repository",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        path: { type: "string", description: "File path" },
        message: { type: "string", description: "Commit message" },
        content: { type: "string", description: "File content (base64 encoded)" },
        sha: { type: "string", description: "SHA of file being replaced (for updates)" },
        branch: { type: "string", description: "Branch name" }
      },
      required: ["owner", "repo", "path", "message", "content"]
    }
  },
  {
    name: "github_delete_file",
    description: "Delete a file from a repository",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        path: { type: "string", description: "File path" },
        message: { type: "string", description: "Commit message" },
        sha: { type: "string", description: "SHA of the file to delete" },
        branch: { type: "string", description: "Branch name" }
      },
      required: ["owner", "repo", "path", "message", "sha"]
    }
  },
  
  // Commit Tools
  {
    name: "github_list_commits",
    description: "List commits in a repository",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        sha: { type: "string", description: "SHA or branch to start listing commits from" },
        path: { type: "string", description: "Only commits containing this file path" },
        author: { type: "string", description: "GitHub username or email address" },
        since: { type: "string", description: "ISO 8601 date format: YYYY-MM-DDTHH:MM:SSZ" },
        until: { type: "string", description: "ISO 8601 date format: YYYY-MM-DDTHH:MM:SSZ" },
        per_page: { type: "number", default: 30, maximum: 100 },
        page: { type: "number", default: 1 }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_get_commit",
    description: "Get a specific commit",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        ref: { type: "string", description: "Commit SHA" }
      },
      required: ["owner", "repo", "ref"]
    }
  },
  {
    name: "github_compare_commits",
    description: "Compare two commits",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        base: { type: "string", description: "Base commit SHA" },
        head: { type: "string", description: "Head commit SHA" }
      },
      required: ["owner", "repo", "base", "head"]
    }
  },
  
  // Branch Tools
  {
    name: "github_list_branches",
    description: "List branches in a repository",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        protected: { type: "boolean", description: "Return only protected branches" },
        per_page: { type: "number", default: 30, maximum: 100 },
        page: { type: "number", default: 1 }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_get_branch",
    description: "Get a specific branch",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        branch: { type: "string", description: "Branch name" }
      },
      required: ["owner", "repo", "branch"]
    }
  },
  {
    name: "github_create_branch",
    description: "Create a new branch",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        ref: { type: "string", description: "New branch name" },
        sha: { type: "string", description: "SHA to create branch from" }
      },
      required: ["owner", "repo", "ref", "sha"]
    }
  },
  
  // Issue Tools
  {
    name: "github_list_issues",
    description: "List issues in a repository",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        milestone: { type: "string", description: "Milestone number or title" },
        state: { type: "string", enum: ["open", "closed", "all"], default: "open" },
        assignee: { type: "string", description: "Username of assignee" },
        creator: { type: "string", description: "Username of creator" },
        mentioned: { type: "string", description: "Username mentioned in issues" },
        labels: { type: "string", description: "Comma-separated list of label names" },
        sort: { type: "string", enum: ["created", "updated", "comments"], default: "created" },
        direction: { type: "string", enum: ["asc", "desc"], default: "desc" },
        since: { type: "string", description: "ISO 8601 date format" },
        per_page: { type: "number", default: 30, maximum: 100 },
        page: { type: "number", default: 1 }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_get_issue",
    description: "Get a specific issue",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        issue_number: { type: "number", description: "Issue number" }
      },
      required: ["owner", "repo", "issue_number"]
    }
  },
  {
    name: "github_create_issue",
    description: "Create a new issue",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        title: { type: "string", description: "Issue title" },
        body: { type: "string", description: "Issue body" },
        assignees: { type: "array", items: { type: "string" }, description: "Usernames to assign" },
        milestone: { type: "number", description: "Milestone number" },
        labels: { type: "array", items: { type: "string" }, description: "Label names" }
      },
      required: ["owner", "repo", "title"]
    }
  },
  {
    name: "github_update_issue",
    description: "Update an issue",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        issue_number: { type: "number", description: "Issue number" },
        title: { type: "string", description: "Issue title" },
        body: { type: "string", description: "Issue body" },
        state: { type: "string", enum: ["open", "closed"] },
        assignees: { type: "array", items: { type: "string" }, description: "Usernames to assign" },
        labels: { type: "array", items: { type: "string" }, description: "Label names" }
      },
      required: ["owner", "repo", "issue_number"]
    }
  },
  
  // Pull Request Tools
  {
    name: "github_list_pull_requests",
    description: "List pull requests in a repository",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        state: { type: "string", enum: ["open", "closed", "all"], default: "open" },
        head: { type: "string", description: "Filter by head branch" },
        base: { type: "string", description: "Filter by base branch" },
        sort: { type: "string", enum: ["created", "updated", "popularity"], default: "created" },
        direction: { type: "string", enum: ["asc", "desc"], default: "desc" },
        per_page: { type: "number", default: 30, maximum: 100 },
        page: { type: "number", default: 1 }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_get_pull_request",
    description: "Get a specific pull request",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        pull_number: { type: "number", description: "Pull request number" }
      },
      required: ["owner", "repo", "pull_number"]
    }
  },
  {
    name: "github_create_pull_request",
    description: "Create a new pull request",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        title: { type: "string", description: "Pull request title" },
        head: { type: "string", description: "Head branch name" },
        base: { type: "string", description: "Base branch name" },
        body: { type: "string", description: "Pull request body" },
        maintainer_can_modify: { type: "boolean", description: "Allow maintainers to edit" },
        draft: { type: "boolean", description: "Create as draft" }
      },
      required: ["owner", "repo", "title", "head", "base"]
    }
  },
  {
    name: "github_update_pull_request",
    description: "Update a pull request",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        pull_number: { type: "number", description: "Pull request number" },
        title: { type: "string", description: "Pull request title" },
        body: { type: "string", description: "Pull request body" },
        state: { type: "string", enum: ["open", "closed"] },
        base: { type: "string", description: "Base branch name" }
      },
      required: ["owner", "repo", "pull_number"]
    }
  },
  {
    name: "github_merge_pull_request",
    description: "Merge a pull request",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        pull_number: { type: "number", description: "Pull request number" },
        commit_title: { type: "string", description: "Commit title" },
        commit_message: { type: "string", description: "Commit message" },
        merge_method: { type: "string", enum: ["merge", "squash", "rebase"], default: "merge" }
      },
      required: ["owner", "repo", "pull_number"]
    }
  },
  
  // User Tools
  {
    name: "github_get_user",
    description: "Get information about a user",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "GitHub username" }
      },
      required: ["username"]
    }
  },
  {
    name: "github_get_authenticated_user",
    description: "Get information about the authenticated user",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  
  // Search Tools
  {
    name: "github_search_code",
    description: "Search for code in repositories",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query" },
        sort: { type: "string", enum: ["indexed"], description: "Sort field" },
        order: { type: "string", enum: ["asc", "desc"], default: "desc" },
        per_page: { type: "number", default: 30, maximum: 100 },
        page: { type: "number", default: 1 }
      },
      required: ["q"]
    }
  },
  {
    name: "github_search_issues",
    description: "Search for issues and pull requests",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query" },
        sort: { type: "string", enum: ["comments", "reactions", "reactions-+1", "reactions--1", "reactions-smile", "reactions-thinking_face", "reactions-heart", "reactions-tada", "interactions", "created", "updated"], description: "Sort field" },
        order: { type: "string", enum: ["asc", "desc"], default: "desc" },
        per_page: { type: "number", default: 30, maximum: 100 },
        page: { type: "number", default: 1 }
      },
      required: ["q"]
    }
  },
  
  // Real-time Tools
  {
    name: "github_live_events",
    description: "Subscribe to live events from a GitHub repository using SSE",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" }
      },
      required: ["owner", "repo"]
    }
  }
];

// Active EventSource connections
const activeConnections = new Map();

// Handle JSON-RPC requests
async function handleRequest(request) {
  const { id, method, params } = request;
  
  debug(`Handling request: ${method}`);
  
  try {
    switch (method) {
      case 'initialize':
        sendResponse(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          },
          serverInfo: {
            name: "github-mcp-server-enhanced",
            version: "2.0.0"
          }
        });
        break;
        
      case 'tools/list':
        sendResponse(id, { tools });
        break;
        
      case 'tools/call':
        await handleToolCall(id, params);
        break;
        
      case 'notifications/initialized':
        debug('Client initialized');
        break;
        
      default:
        sendResponse(id, null, {
          code: -32601,
          message: "Method not found"
        });
    }
  } catch (error) {
    debug(`Error handling request: ${error.message}`);
    sendResponse(id, null, {
      code: -32603,
      message: error.message
    });
  }
}

// Handle tool calls - this is where we route to the appropriate handler
async function handleToolCall(id, params) {
  const { name, arguments: args } = params;
  
  debug(`Tool call: ${name} with args: ${JSON.stringify(args)}`);
  
  // Route tool calls to appropriate handlers
  if (name.startsWith('github_')) {
    await handleGitHubTool(id, name, args);
  } else {
    sendResponse(id, null, {
      code: -32602,
      message: `Unknown tool: ${name}`
    });
  }
}

// GitHub tool handler
async function handleGitHubTool(id, toolName, args) {
  const tool = toolName.replace('github_', '');
  
  switch (tool) {
    // Repository tools
    case 'get_repository':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}`);
      break;
    case 'list_repositories':
      makeAPICall(id, `/api/users/${args.username}/repos`, args);
      break;
    case 'search_repositories':
      makeAPICall(id, `/api/search/repositories`, args);
      break;
    case 'create_repository':
      makeAPICall(id, `/api/user/repos`, args, 'POST');
      break;
    case 'fork_repository':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/forks`, {}, 'POST');
      break;
      
    // File and content tools
    case 'get_file_contents':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/contents/${args.path}`, args);
      break;
    case 'create_or_update_file':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/contents/${args.path}`, args, 'PUT');
      break;
    case 'delete_file':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/contents/${args.path}`, args, 'DELETE');
      break;
      
    // Commit tools
    case 'list_commits':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/commits`, args);
      break;
    case 'get_commit':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/commits/${args.ref}`);
      break;
    case 'compare_commits':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/compare/${args.base}...${args.head}`);
      break;
      
    // Branch tools
    case 'list_branches':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/branches`, args);
      break;
    case 'get_branch':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/branches/${args.branch}`);
      break;
    case 'create_branch':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/git/refs`, { ref: `refs/heads/${args.ref}`, sha: args.sha }, 'POST');
      break;
      
    // Issue tools
    case 'list_issues':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/issues`, args);
      break;
    case 'get_issue':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/issues/${args.issue_number}`);
      break;
    case 'create_issue':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/issues`, args, 'POST');
      break;
    case 'update_issue':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/issues/${args.issue_number}`, args, 'PATCH');
      break;
      
    // Pull request tools
    case 'list_pull_requests':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/pulls`, args);
      break;
    case 'get_pull_request':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/pulls/${args.pull_number}`);
      break;
    case 'create_pull_request':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/pulls`, args, 'POST');
      break;
    case 'update_pull_request':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/pulls/${args.pull_number}`, args, 'PATCH');
      break;
    case 'merge_pull_request':
      makeAPICall(id, `/api/repos/${args.owner}/${args.repo}/pulls/${args.pull_number}/merge`, args, 'PUT');
      break;
      
    // User tools
    case 'get_user':
      makeAPICall(id, `/api/users/${args.username}`);
      break;
    case 'get_authenticated_user':
      makeAPICall(id, `/api/user`);
      break;
      
    // Search tools
    case 'search_code':
      makeAPICall(id, `/api/search/code`, args);
      break;
    case 'search_issues':
      makeAPICall(id, `/api/search/issues`, args);
      break;
      
    // Real-time tools (SSE)
    case 'live_events':
      subscribeToEvents(id, args);
      break;
      
    default:
      sendResponse(id, null, {
        code: -32602,
        message: `GitHub tool not implemented: ${toolName}`
      });
  }
}

// Generic API call handler
function makeAPICall(id, endpoint, params = {}, method = 'GET') {
  const queryParams = method === 'GET' ? '?' + new URLSearchParams(params).toString() : '';
  const url = `${SERVER_URL}${endpoint}${queryParams}`;
  
  debug(`Making ${method} request to: ${url}`);
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'GitHub-MCP-Server/2.0'
    }
  };
  
  if (method !== 'GET' && Object.keys(params).length > 0) {
    options.body = JSON.stringify(params);
  }
  
  const req = require('http').request(url, options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        if (res.statusCode >= 400) {
          sendResponse(id, null, {
            code: -32603,
            message: `API error ${res.statusCode}: ${result.message || 'Unknown error'}`
          });
        } else {
          sendResponse(id, {
            content: [{
              type: "text",
              text: JSON.stringify(result, null, 2)
            }]
          });
        }
      } catch (error) {
        sendResponse(id, null, {
          code: -32603,
          message: `Failed to parse response: ${error.message}`
        });
      }
    });
  });
  
  req.on('error', (error) => {
    debug(`HTTP request failed: ${error.message}`);
    sendResponse(id, null, {
      code: -32603,
      message: `HTTP request failed: ${error.message}`
    });
  });
  
  if (method !== 'GET' && options.body) {
    req.write(options.body);
  }
  
  req.end();
}

// Subscribe to SSE events
function subscribeToEvents(id, args) {
  const { owner, repo } = args;
  const url = `${SERVER_URL}/sse/github/${owner}/${repo}`;
  
  debug(`Subscribing to events: ${url}`);
  
  // Close existing connection if any
  const existingConnection = activeConnections.get(`${owner}/${repo}`);
  if (existingConnection) {
    existingConnection.close();
  }
  
  const eventSource = new EventSource(url);
  activeConnections.set(`${owner}/${repo}`, eventSource);
  
  eventSource.onopen = () => {
    debug(`Connected to SSE stream for ${owner}/${repo}`);
    sendResponse(id, {
      content: [{
        type: "text",
        text: `Connected to live events for ${owner}/${repo}. You will receive real-time updates about repository activity.`
      }]
    });
  };
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      sendNotification('tools/event', {
        tool: 'github_live_events',
        event: {
          repository: `${owner}/${repo}`,
          data: data,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      debug(`Error parsing SSE event: ${error.message}`);
    }
  };
  
  eventSource.onerror = (error) => {
    debug(`SSE error for ${owner}/${repo}: ${error.message || 'Connection closed'}`);
    eventSource.close();
    activeConnections.delete(`${owner}/${repo}`);
    sendNotification('tools/event', {
      tool: 'github_live_events',
      event: {
        repository: `${owner}/${repo}`,
        error: 'Connection closed',
        timestamp: new Date().toISOString()
      }
    });
  };
}

// Process input line by line
rl.on('line', (line) => {
  debug(`Received: ${line}`);
  try {
    const request = JSON.parse(line);
    if (request.jsonrpc === JSONRPC_VERSION) {
      handleRequest(request);
    }
  } catch (error) {
    debug(`Error parsing input: ${error.message}`);
  }
});

// Keep the process alive
process.stdin.resume();

// Cleanup on exit
process.on('SIGINT', () => {
  debug('Received SIGINT, cleaning up...');
  activeConnections.forEach(connection => connection.close());
  process.exit(0);
});

process.on('SIGTERM', () => {
  debug('Received SIGTERM, cleaning up...');
  activeConnections.forEach(connection => connection.close());
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  debug(`Uncaught exception: ${error.message}`);
  console.error(error);
});

process.on('unhandledRejection', (reason, promise) => {
  debug(`Unhandled rejection at ${promise}: ${reason}`);
});

debug('Enhanced GitHub MCP bridge started with 28 tools...');