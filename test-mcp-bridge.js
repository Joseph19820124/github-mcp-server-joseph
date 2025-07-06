#!/usr/bin/env node

// Test script to simulate MCP client interaction

const { spawn } = require('child_process');
const readline = require('readline');

// Spawn the MCP bridge
const bridge = spawn('node', ['mcp-bridge.js'], {
  env: {
    ...process.env,
    MCP_SERVER_URL: 'http://localhost:3000'
  }
});

// Create readline interface for bridge output
const rl = readline.createInterface({
  input: bridge.stdout,
  crlfDelay: Infinity
});

// Handle responses
rl.on('line', (line) => {
  console.log('Response:', line);
  try {
    const response = JSON.parse(line);
    console.log('Parsed response:', JSON.stringify(response, null, 2));
  } catch (e) {
    // Not JSON
  }
});

// Handle errors
bridge.stderr.on('data', (data) => {
  console.error('Bridge stderr:', data.toString());
});

bridge.on('error', (error) => {
  console.error('Failed to start bridge:', error);
});

bridge.on('close', (code) => {
  console.log('Bridge process exited with code', code);
  process.exit(code);
});

// Send test requests
async function runTests() {
  console.log('Sending initialize request...');
  const initRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  };
  
  bridge.stdin.write(JSON.stringify(initRequest) + '\n');
  
  // Wait a bit for response
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\nSending tools/list request...');
  const toolsRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  };
  
  bridge.stdin.write(JSON.stringify(toolsRequest) + '\n');
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\nSending tool call request...');
  const toolCallRequest = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "github_repository_info",
      arguments: {
        owner: "facebook",
        repo: "react"
      }
    }
  };
  
  bridge.stdin.write(JSON.stringify(toolCallRequest) + '\n');
  
  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('\nTests complete. Closing bridge...');
  bridge.stdin.end();
}

// Run tests after a short delay
setTimeout(runTests, 500);