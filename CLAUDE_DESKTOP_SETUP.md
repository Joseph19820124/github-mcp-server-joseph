# Claude Desktop 連接 GitHub MCP Server 指南

## 方式一：使用 HTTP/SSE 端點（推薦用於開發）

由於您的 MCP server 是基於 HTTP/SSE 的，而 Claude Desktop 的 MCP 集成主要支持通過 stdio 通信的服務器，您需要創建一個橋接腳本。

### 1. 創建 MCP 橋接腳本

首先創建一個橋接腳本來連接 HTTP 服務器：

```bash
# 在項目根目錄創建 mcp-bridge.js
```

### 2. 配置 Claude Desktop

編輯 Claude Desktop 配置文件：
`~/Library/Application Support/Claude/claude_desktop_config.json`

添加您的服務器配置：

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your_token_here"
      }
    },
    "github-custom": {
      "command": "node",
      "args": [
        "/Users/josephchen/Documents/ai_project/github-mcp-server/mcp-bridge.js"
      ],
      "env": {
        "MCP_SERVER_URL": "http://localhost:3000",
        "GITHUB_TOKEN": "your_token_here"
      }
    }
  }
}
```

## 方式二：修改服務器支持 stdio（更好的集成）

為了更好地與 Claude Desktop 集成，建議修改您的服務器以支持 MCP 的 stdio 協議。

### 1. 創建 stdio 版本的服務器

創建一個新文件 `mcp-stdio-server.js` 來支持標準輸入/輸出通信。

### 2. 更新 Docker 配置

在 `docker-compose.yml` 中添加新的服務來運行 stdio 版本。

### 3. 配置 Claude Desktop

使用本地運行的 stdio 服務器：

```json
{
  "mcpServers": {
    "github-local": {
      "command": "node",
      "args": [
        "/Users/josephchen/Documents/ai_project/github-mcp-server/mcp-stdio-server.js"
      ],
      "env": {
        "GITHUB_TOKEN": "your_github_token_here"
      }
    }
  }
}
```

## 方式三：使用 Docker 容器（生產環境）

如果要在 Claude Desktop 中使用 Docker 容器中的 MCP 服務器：

### 1. 創建 Docker 執行腳本

創建 `docker-mcp-wrapper.sh`：

```bash
#!/bin/bash
docker exec -i github-mcp-server node /app/mcp-stdio-server.js
```

### 2. 配置 Claude Desktop

```json
{
  "mcpServers": {
    "github-docker": {
      "command": "/Users/josephchen/Documents/ai_project/github-mcp-server/docker-mcp-wrapper.sh",
      "env": {
        "GITHUB_TOKEN": "your_github_token_here"
      }
    }
  }
}
```

## 測試連接

1. 重啟 Claude Desktop 應用
2. 在 Claude 中輸入相關 GitHub 查詢來測試 MCP 服務器是否正常工作
3. 查看 Docker 日誌確認請求是否到達服務器：
   ```bash
   docker-compose logs -f
   ```

## 注意事項

1. **Token 安全性**：確保您的 GitHub token 有適當的權限
2. **端口衝突**：確保 3000 端口沒有被其他服務佔用
3. **防火牆**：確保本地防火牆允許訪問 3000 端口
4. **錯誤處理**：檢查 Claude Desktop 的日誌文件以排查連接問題

## 常見問題

### Q: Claude Desktop 無法連接到 MCP 服務器
A: 檢查以下幾點：
- 服務器是否正在運行：`docker-compose ps`
- 端口是否可訪問：`curl http://localhost:3000/health`
- 配置文件語法是否正確
- 重啟 Claude Desktop

### Q: 如何查看 MCP 通信日誌？
A: 
- Docker 日誌：`docker-compose logs -f`
- Claude Desktop 日誌：查看 `~/Library/Logs/Claude/` 目錄

### Q: 如何更新 GitHub Token？
A: 
1. 更新 `.env` 文件中的 `GITHUB_TOKEN`
2. 更新 Claude Desktop 配置文件中的 token
3. 重啟服務：`docker-compose restart`
4. 重啟 Claude Desktop