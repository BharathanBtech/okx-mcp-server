#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
dotenv.config();


import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

interface CurrentWeatherResponse {
  coord: { lon: number; lat: number };
  weather: Array<{ description: string; icon: string }>;
  main: {
    temp: number;
    feels_like: number;
    temp_min: number;
    temp_max: number;
    pressure: number;
    humidity: number;
  };
  wind: { speed: number; deg?: number; gust?: number };
  sys: { country?: string; sunrise?: number; sunset?: number };
  name: string;
  dt: number;
  timezone: number;
}

interface ForecastItem {
  dt: number;
  main: {
    temp: number;
    feels_like: number;
    temp_min: number;
    temp_max: number;
    pressure: number;
    humidity: number;
  };
  weather: Array<{ description: string; icon: string }>;
  wind: { speed: number; deg?: number; gust?: number };
  dt_txt?: string;
}

interface ForecastResponse {
  city: {
    name: string;
    country?: string;
    coord: { lon: number; lat: number };
    timezone?: number;
  };
  list: ForecastItem[];
}

class WeatherServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    console.error('[Setup] Initializing OpenWeatherMap MCP server...');

    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENWEATHERMAP_API_KEY environment variable');
    }

    this.server = new Server(
      { name: 'openweathermap-mcp-server', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );

    this.axiosInstance = axios.create({
      baseURL: 'https://api.openweathermap.org/data/2.5',
      timeout: 8000,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      params: { appid: apiKey },
    });

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('[Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // Tool discovery
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_current_weather',
          description: 'Get current weather by city or coordinates (OpenWeatherMap /weather)',
          inputSchema: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name, e.g., London or London,UK' },
              lat: { type: 'number', description: 'Latitude (e.g., 28.6139)' },
              lon: { type: 'number', description: 'Longitude (e.g., 77.2090)' },
              units: {
                type: 'string',
                description: 'Units of measurement: standard (K), metric (C), imperial (F)',
                enum: ['standard', 'metric', 'imperial'],
                default: 'metric',
              },
              lang: {
                type: 'string',
                description: 'Language code for descriptions (e.g., en, hi, ta)',
                default: 'en',
              },
            },
            anyOf: [
              { required: ['city'] },
              { required: ['lat', 'lon'] },
            ],
          },
        },
        {
          name: 'get_forecast',
          description: 'Get 5 day / 3 hour forecast by city or coordinates (OpenWeatherMap /forecast)',
          inputSchema: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name, e.g., Tirunelveli,IN' },
              lat: { type: 'number', description: 'Latitude' },
              lon: { type: 'number', description: 'Longitude' },
              units: {
                type: 'string',
                description: 'Units of measurement: standard (K), metric (C), imperial (F)',
                enum: ['standard', 'metric', 'imperial'],
                default: 'metric',
              },
              lang: {
                type: 'string',
                description: 'Language code for descriptions (e.g., en, hi, ta)',
                default: 'en',
              },
              limit: {
                type: 'number',
                description: 'Number of forecast items to return (1–40)',
                default: 12,
              },
            },
            anyOf: [
              { required: ['city'] },
              { required: ['lat', 'lon'] },
            ],
          },
        },
      ],
    }));

    // Tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const name = request.params.name;
        const args = request.params.arguments as {
          city?: string;
          lat?: number;
          lon?: number;
          units?: 'standard' | 'metric' | 'imperial';
          lang?: string;
          limit?: number;
        };

        const params: Record<string, string | number> = {
          units: args.units ?? 'metric',
          lang: args.lang ?? 'en',
        };

        if (args.city) {
          params.q = args.city;
        } else if (typeof args.lat === 'number' && typeof args.lon === 'number') {
          params.lat = args.lat;
          params.lon = args.lon;
        } else {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Provide either city or both lat and lon'
          );
        }

        if (name === 'get_current_weather') {
          const response = await this.axiosInstance.get<CurrentWeatherResponse>('/weather', {
            params,
          });

          const w = response.data;
          const payload = {
            location: {
              name: w.name,
              country: w.sys.country ?? null,
              coord: w.coord,
              timezoneOffsetSeconds: w.timezone,
            },
            observationTimeISO: new Date((w.dt + (w.timezone ?? 0)) * 1000).toISOString(),
            conditions: {
              description: w.weather?.[0]?.description ?? 'N/A',
              icon: w.weather?.[0]?.icon ?? null,
            },
            temperature: {
              value: w.main.temp,
              feelsLike: w.main.feels_like,
              min: w.main.temp_min,
              max: w.main.temp_max,
              units: params.units,
            },
            humidity: w.main.humidity,
            pressure: w.main.pressure,
            wind: w.wind,
            sun: {
              sunriseISO: w.sys.sunrise ? new Date(w.sys.sunrise * 1000).toISOString() : null,
              sunsetISO: w.sys.sunset ? new Date(w.sys.sunset * 1000).toISOString() : null,
            },
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          };
        }

        if (name === 'get_forecast') {
          let cnt = Math.max(1, Math.min(40, Math.floor(args.limit ?? 12)));
          const response = await this.axiosInstance.get<ForecastResponse>('/forecast', {
            params: { ...params, cnt },
          });

          const f = response.data;
          const items = (f.list ?? []).slice(0, cnt).map((it) => ({
            timeISO: new Date(it.dt * 1000).toISOString(),
            description: it.weather?.[0]?.description ?? 'N/A',
            icon: it.weather?.[0]?.icon ?? null,
            temperature: {
              value: it.main.temp,
              feelsLike: it.main.feels_like,
              min: it.main.temp_min,
              max: it.main.temp_max,
              units: params.units,
            },
            humidity: it.main.humidity,
            pressure: it.main.pressure,
            wind: it.wind,
            textTime: it.dt_txt ?? null,
          }));

          const payload = {
            location: {
              name: f.city?.name ?? null,
              country: f.city?.country ?? null,
              coord: f.city?.coord ?? null,
              timezoneOffsetSeconds: f.city?.timezone ?? null,
            },
            count: items.length,
            items,
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          };
        }

        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      } catch (err: any) {
        console.error('[Error] Failed to fetch data:', err);
        const message =
          (err?.response?.data && JSON.stringify(err.response.data)) ||
          err?.message ||
          'Unknown error';
        throw new McpError(ErrorCode.InternalError, `Failed to fetch data: ${message}`);
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('OpenWeatherMap MCP server running on stdio');
  }
}

const server = new WeatherServer();
server.run().catch(console.error);
