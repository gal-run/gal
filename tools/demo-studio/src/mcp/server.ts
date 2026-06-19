#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Recorder, RecordingConfigSchema } from '../core/recorder.js';
import { ZoomEngine, ZoomConfigSchema } from '../effects/zoom.js';
import { CursorEngine, CursorConfigSchema } from '../effects/cursor.js';
import { TTSEngine, TTSEngineConfigSchema } from '../tts/index.js';
import { TimelineEditor } from '../timeline/editor.js';
import { Renderer, RenderConfigSchema } from '../renderer/index.js';

const recorder = new Recorder();
const zoomEngine = new ZoomEngine();
const cursorEngine = new CursorEngine();
const ttsEngine = new TTSEngine();
const timeline = new TimelineEditor();

const server = new Server(
  {
    name: 'demo-studio',
    version: '0.1.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

const tools = [
  {
    name: 'start_recording',
    description: 'Begin screen recording with specified configuration',
    inputSchema: {
      type: 'object',
      properties: {
        output: { type: 'string', description: 'Output file path (default: output.mp4)' },
        fps: { type: 'number', description: 'Frames per second (default: 30)' },
        captureAudio: { type: 'boolean', description: 'Capture system audio (default: true)' },
        region: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' }
          },
          description: 'Screen region to capture (optional)'
        }
      }
    }
  },
  {
    name: 'stop_recording',
    description: 'Stop current recording and save to file',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'add_zoom_region',
    description: 'Add a zoom effect region for a specific time range',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X position (0-1, relative to screen)' },
        y: { type: 'number', description: 'Y position (0-1, relative to screen)' },
        scale: { type: 'number', description: 'Zoom scale (1-4)' },
        startTime: { type: 'number', description: 'Start time in seconds' },
        endTime: { type: 'number', description: 'End time in seconds' },
        duration: { type: 'number', description: 'Transition duration (default: 0.5)' },
        easing: { type: 'string', enum: ['linear', 'ease-in', 'ease-out', 'ease-in-out'] }
      },
      required: ['x', 'y', 'scale', 'startTime', 'endTime']
    }
  },
  {
    name: 'add_click_marker',
    description: 'Add an animated click indicator at specified position',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X position in pixels' },
        y: { type: 'number', description: 'Y position in pixels' },
        timestamp: { type: 'number', description: 'Time of click in seconds' },
        duration: { type: 'number', description: 'Click animation duration (default: 0.3)' }
      },
      required: ['x', 'y', 'timestamp']
    }
  },
  {
    name: 'add_keystroke_overlay',
    description: 'Display keyboard shortcut on screen',
    inputSchema: {
      type: 'object',
      properties: {
        keys: { type: 'string', description: 'Keyboard shortcut (e.g., "Cmd+K")' },
        timestamp: { type: 'number', description: 'Time to display in seconds' },
        duration: { type: 'number', description: 'Display duration (default: 2)' },
        position: { type: 'string', enum: ['top-left', 'top-right', 'bottom-left', 'bottom-center'] }
      },
      required: ['keys', 'timestamp']
    }
  },
  {
    name: 'add_text_overlay',
    description: 'Add text annotation to the video',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text content' },
        x: { type: 'number', description: 'X position' },
        y: { type: 'number', description: 'Y position' },
        startTime: { type: 'number', description: 'Start time in seconds' },
        endTime: { type: 'number', description: 'End time in seconds' },
        style: {
          type: 'object',
          properties: {
            fontSize: { type: 'number' },
            color: { type: 'string' },
            backgroundColor: { type: 'string' }
          }
        }
      },
      required: ['text', 'startTime', 'endTime']
    }
  },
  {
    name: 'set_cursor_style',
    description: 'Configure cursor appearance and behavior',
    inputSchema: {
      type: 'object',
      properties: {
        visible: { type: 'boolean', description: 'Show cursor' },
        style: { type: 'string', enum: ['arrow', 'pointer', 'text', 'crosshair', 'hand'] },
        color: { type: 'string', description: 'Cursor color (hex)' },
        size: { type: 'number', description: 'Cursor size in pixels' },
        smoothness: { type: 'number', description: 'Movement smoothing (0-1)' },
        highlightOnClick: { type: 'boolean', description: 'Show highlight on click' }
      }
    }
  },
  {
    name: 'add_voiceover',
    description: 'Add TTS voiceover segment',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to speak' },
        startTime: { type: 'number', description: 'Start time in seconds' },
        voice: { type: 'string', description: 'Voice identifier' },
        provider: { type: 'string', enum: ['openai', 'elevenlabs', 'coqui', 'local'] }
      },
      required: ['text', 'startTime']
    }
  },
  {
    name: 'export_video',
    description: 'Render and export final video',
    inputSchema: {
      type: 'object',
      properties: {
        output: { type: 'string', description: 'Output file path' },
        resolution: {
          type: 'object',
          properties: {
            width: { type: 'number' },
            height: { type: 'number' }
          }
        },
        fps: { type: 'number', description: 'Frames per second' },
        quality: { type: 'string', enum: ['draft', 'standard', 'high', 'production'] }
      }
    }
  },
  {
    name: 'run_demo_script',
    description: 'Execute a complete demo script with all effects and voiceover',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['record', 'click', 'keystroke', 'zoom', 'voiceover', 'text'] },
                  duration: { type: 'number' },
                  x: { type: 'number' },
                  y: { type: 'number' },
                  scale: { type: 'number' },
                  keys: { type: 'string' },
                  text: { type: 'string' }
                }
              }
            }
          }
        }
      },
      required: ['script']
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'start_recording': {
        const config = RecordingConfigSchema.partial().parse(args || {});
        await recorder.startRecording();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ 
              status: 'recording', 
              config: recorder.getState().config 
            })
          }]
        };
      }

      case 'stop_recording': {
        const outputPath = await recorder.stopRecording();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ 
              status: 'stopped', 
              outputPath,
              duration: recorder.getState().startTime 
                ? Date.now() - recorder.getState().startTime! 
                : 0
            })
          }]
        };
      }

      case 'add_zoom_region': {
        const { x, y, scale, startTime, endTime, duration, easing } = args as any;
        const id = zoomEngine.addZoomRegion(
          { x, y, scale, duration: duration || 0.5, easing: easing || 'ease-out' },
          startTime,
          endTime
        );
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ status: 'added', zoomRegionId: id })
          }]
        };
      }

      case 'add_click_marker': {
        const { x, y, timestamp, duration } = args as any;
        cursorEngine.addClick(x, y, timestamp, duration || 0.3);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ status: 'added', position: { x, y }, timestamp })
          }]
        };
      }

      case 'add_keystroke_overlay': {
        const { keys, timestamp, duration, position } = args as any;
        timeline.addClip({
          type: 'text',
          source: keys,
          startTime: timestamp,
          endTime: timestamp + (duration || 2),
          track: 0
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ status: 'added', keys, timestamp })
          }]
        };
      }

      case 'add_text_overlay': {
        const { text, startTime, endTime, x, y, style } = args as any;
        const clipId = timeline.addClip({
          type: 'text',
          source: text,
          startTime,
          endTime,
          track: 0,
          transforms: { x: x || 0, y: y || 0, scale: 1, rotation: 0, opacity: 1 }
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ status: 'added', clipId })
          }]
        };
      }

      case 'set_cursor_style': {
        cursorEngine.setConfig(args || {});
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ status: 'updated', config: cursorEngine.getConfig() })
          }]
        };
      }

      case 'add_voiceover': {
        const { text, startTime, voice, provider } = args as any;
        if (provider) {
          ttsEngine.setConfig({ provider });
        }
        const segment = ttsEngine.addSegment(text, startTime);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ status: 'added', segmentId: segment.id })
          }]
        };
      }

      case 'export_video': {
        const renderConfig = RenderConfigSchema.partial().parse(args || {});
        const renderer = new Renderer(renderConfig, timeline, zoomEngine, cursorEngine);
        const outputPath = await renderer.render((progress) => {
          console.error(`Render progress: ${Math.round(progress * 100)}%`);
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ status: 'complete', outputPath })
          }]
        };
      }

      case 'run_demo_script': {
        const { script } = args as any;
        const result = await executeDemoScript(script);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result)
          }]
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, error.message);
    }
    throw error;
  }
});

async function executeDemoScript(script: { name: string; steps: any[] }): Promise<object> {
  let currentTime = 0;
  const results: any[] = [];

  for (const step of script.steps) {
    switch (step.type) {
      case 'record':
        if (step.duration) {
          currentTime += step.duration;
        }
        results.push({ step: 'record', time: currentTime });
        break;

      case 'click':
        if (step.x !== undefined && step.y !== undefined) {
          cursorEngine.addClick(step.x, step.y, currentTime, step.duration || 0.3);
          if (step.zoom) {
            zoomEngine.addZoomRegion(
              { x: step.x / 1920, y: step.y / 1080, scale: step.zoom.scale || 1.5, duration: 0.5, easing: 'ease-out' },
              currentTime,
              currentTime + (step.duration || 1)
            );
          }
        }
        results.push({ step: 'click', position: { x: step.x, y: step.y }, time: currentTime });
        if (step.duration) currentTime += step.duration;
        break;

      case 'keystroke':
        if (step.keys) {
          timeline.addClip({
            type: 'text',
            source: step.keys,
            startTime: currentTime,
            endTime: currentTime + (step.duration || 2),
            track: 0
          });
        }
        results.push({ step: 'keystroke', keys: step.keys, time: currentTime });
        if (step.duration) currentTime += step.duration;
        break;

      case 'zoom':
        if (step.x !== undefined && step.y !== undefined && step.scale) {
          zoomEngine.addZoomRegion(
            { x: step.x, y: step.y, scale: step.scale, duration: step.duration || 0.5, easing: 'ease-out' },
            currentTime,
            currentTime + (step.duration || 2)
          );
        }
        results.push({ step: 'zoom', config: step, time: currentTime });
        if (step.duration) currentTime += step.duration;
        break;

      case 'voiceover':
        if (step.text) {
          ttsEngine.addSegment(step.text, currentTime);
        }
        results.push({ step: 'voiceover', text: step.text, time: currentTime });
        break;

      case 'text':
        if (step.text) {
          timeline.addClip({
            type: 'text',
            source: step.text,
            startTime: currentTime,
            endTime: currentTime + (step.duration || 2),
            track: 0
          });
        }
        results.push({ step: 'text', text: step.text, time: currentTime });
        if (step.duration) currentTime += step.duration;
        break;
    }
  }

  return {
    status: 'script_executed',
    name: script.name,
    totalDuration: currentTime,
    steps: results
  };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Demo Studio MCP server running on stdio');
}

main().catch(console.error);
