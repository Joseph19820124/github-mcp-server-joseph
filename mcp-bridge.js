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

debug('Starting MCP bridge...');
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
  debug(`Sending response: ${responseStr}`);
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

// Available tools/functions
const tools = [
  {
    name: "github_repository_info",
    description: "Get information about a GitHub repository",
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
    name: "github_commits",
    description: "Get recent commits from a GitHub repository",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        page: { type: "number", description: "Page number", default: 1 },
        per_page: { type: "number", description: "Items per page", default: 30 }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_live_events",
    description: "Subscribe to live events from a GitHub repository",
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
            name: "github-mcp-server",
            version: "1.0.0"
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
        // Client notification that initialization is complete
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

// Handle tool calls
async function handleToolCall(id, params) {
  const { name, arguments: args } = params;
  
  debug(`Tool call: ${name} with args: ${JSON.stringify(args)}`);
  
  switch (name) {
    case 'github_repository_info':
      fetchRepositoryInfo(id, args);
      break;
      
    case 'github_commits':
      fetchCommits(id, args);
      break;
      
    case 'github_live_events':
      subscribeToEvents(id, args);
      break;
      
    default:
      sendResponse(id, null, {
        code: -32602,
        message: `Unknown tool: ${name}`
      });
  }
}

// Fetch repository information
function fetchRepositoryInfo(id, args) {
  const { owner, repo } = args;
  const url = `${SERVER_URL}/api/repos/${owner}/${repo}`;
  
  debug(`Fetching repository info: ${url}`);
  
  http.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        sendResponse(id, { 
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        });
      } catch (error) {
        debug(`Error parsing response: ${error.message}`);
        sendResponse(id, null, {
          code: -32603,
          message: `Failed to parse response: ${error.message}`
        });
      }
    });
  }).on('error', (error) => {
    debug(`HTTP request failed: ${error.message}`);
    sendResponse(id, null, {
      code: -32603,
      message: `HTTP request failed: ${error.message}`
    });
  });
}

// Fetch commits
function fetchCommits(id, args) {
  const { owner, repo, page = 1, per_page = 30 } = args;
  const url = `${SERVER_URL}/api/repos/${owner}/${repo}/commits?page=${page}&per_page=${per_page}`;
  
  debug(`Fetching commits: ${url}`);
  
  http.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        sendResponse(id, {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        });
      } catch (error) {
        debug(`Error parsing response: ${error.message}`);
        sendResponse(id, null, {
          code: -32603,
          message: `Failed to parse response: ${error.message}`
        });
      }
    });
  }).on('error', (error) => {
    debug(`HTTP request failed: ${error.message}`);
    sendResponse(id, null, {
      code: -32603,
      message: `HTTP request failed: ${error.message}`
    });
  });
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
        text: `Connected to live events for ${owner}/${repo}`
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
          data: data
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
        error: 'Connection closed'
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

debug('MCP bridge started and waiting for commands...');