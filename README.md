# 🌦️ OpenWeatherMap MCP Server

This is an MCP-compatible server that integrates with the OpenWeatherMap API to provide current weather and forecast data via tool calls.

## 🚀 Features

- Get current weather by city name or coordinates
- Fetch 5-day / 3-hour forecast data
- Supports multiple units (`metric`, `imperial`, `standard`)
- Language localization for weather descriptions

## 🛠️ Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/your-username/okx-mcp-server.git
   cd okx-mcp-server

2. Install dependencies:

        npm install

3. Create a .env file:

      Set your open weather map api in environment variable  OPENWEATHERMAP_API_KEY=your_api_key_here


4. To compile the typescript code, run the below command in project folder
     npx tsc

5. Start the server, run the below command in project folder
     node build/index.js
    

## How to use Model context protocol Inspector ##

open a new terminal in project folder and run the below command

npx @modelcontextprotocol/inspector build/index.js

give y if it asks for procced.

MCP Inspector will open in a browser if this command runs successfull.

In the UI, select the trasport type and click connect to connect MCP Inspector with MCP server

In the ui, it will display the list of tools of mcp server, if we select the tool, in the right pane, we have to provide the input and execute to get the response.