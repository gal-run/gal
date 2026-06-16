/**
 * Vision MCP Tools
 *
 * Provides tools for image and video analysis using Gemini 2.0 Flash.
 * Tools match the Z.AI Vision MCP server API for compatibility.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { VisionClient } from '../vision-client.js';
import { mimeTypeFromPath, isImageMimeType, isVideoMimeType } from '../vision-client.js';

const MAX_VIDEO_SIZE_MB = 8;

function fileToBase64(filePath: string): { data: string; mimeType: string } {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const buffer = readFileSync(filePath);
  const mimeType = mimeTypeFromPath(filePath);

  if (isVideoMimeType(mimeType)) {
    const sizeMB = buffer.length / (1024 * 1024);
    if (sizeMB > MAX_VIDEO_SIZE_MB) {
      throw new Error(`Video file too large: ${sizeMB.toFixed(2)}MB (max ${MAX_VIDEO_SIZE_MB}MB)`);
    }
  }

  return {
    data: buffer.toString('base64'),
    mimeType,
  };
}

function resolveImagePath(input: string): string {
  if (existsSync(input)) {
    return input;
  }

  const cwd = process.cwd();
  const fullPath = `${cwd}/${input}`;
  if (existsSync(fullPath)) {
    return fullPath;
  }

  throw new Error(`Image file not found: ${input} (searched in cwd: ${cwd})`);
}

export function registerVisionTools(server: McpServer, client: VisionClient): void {
  server.tool(
    'image_analysis',
    'General-purpose image understanding. Analyze any image and describe its contents, answer questions, or extract information.',
    {
      image_path: z.string().describe('Path to the image file (relative to cwd or absolute)'),
      prompt: z.string().optional().describe('Custom analysis prompt (default: describe the image)'),
    },
    async ({ image_path, prompt }) => {
      try {
        const resolvedPath = resolveImagePath(image_path);
        const { data, mimeType } = fileToBase64(resolvedPath);

        if (!isImageMimeType(mimeType)) {
          return {
            content: [{ type: 'text' as const, text: `Error: Not an image file: ${mimeType}` }],
            isError: true,
          };
        }

        const analysisPrompt = prompt || 'Analyze this image and provide a detailed description of its contents.';

        const result = await client.analyzeImage(data, mimeType, analysisPrompt);

        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error analyzing image: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'extract_text_from_screenshot',
    'OCR screenshots for code, terminals, docs, and general text. Extracts text content from images with high accuracy.',
    {
      image_path: z.string().describe('Path to the screenshot image file'),
      context: z.string().optional().describe('Context hint (e.g., "terminal output", "code editor", "document")'),
    },
    async ({ image_path, context }) => {
      try {
        const resolvedPath = resolveImagePath(image_path);
        const { data, mimeType } = fileToBase64(resolvedPath);

        if (!isImageMimeType(mimeType)) {
          return {
            content: [{ type: 'text' as const, text: `Error: Not an image file: ${mimeType}` }],
            isError: true,
          };
        }

        const contextHint = context ? `Context: ${context}. ` : '';
        const prompt = `${contextHint}Extract all text from this image. Preserve formatting, indentation, and structure as much as possible. If this is code, preserve the exact syntax. If this is terminal output, preserve the exact output format.`;

        const result = await client.analyzeImage(data, mimeType, prompt);

        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error extracting text: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ui_to_artifact',
    'Turn UI screenshots into code, prompts, specs, or descriptions. Useful for replicating UI designs or generating implementation code.',
    {
      image_path: z.string().describe('Path to the UI screenshot'),
      output_type: z.enum(['code', 'spec', 'description', 'prompt']).describe('Desired output type'),
      framework: z.string().optional().describe('Target framework (e.g., "react", "vue", "html/css")'),
    },
    async ({ image_path, output_type, framework }) => {
      try {
        const resolvedPath = resolveImagePath(image_path);
        const { data, mimeType } = fileToBase64(resolvedPath);

        if (!isImageMimeType(mimeType)) {
          return {
            content: [{ type: 'text' as const, text: `Error: Not an image file: ${mimeType}` }],
            isError: true,
          };
        }

        const frameworkHint = framework ? `Target framework: ${framework}. ` : '';
        const prompts: Record<string, string> = {
          code: `${frameworkHint}Generate implementation code for this UI. Use modern best practices and clean, maintainable code. Include all necessary styling.`,
          spec: `${frameworkHint}Create a detailed specification for this UI. Include layout, colors, typography, spacing, components, and interactions.`,
          description: 'Describe this UI in detail, including layout, design patterns, visual hierarchy, and user experience considerations.',
          prompt: `${frameworkHint}Create a detailed prompt that could be used to generate this UI. Include all visual and structural details.`,
        };

        const result = await client.analyzeImage(data, mimeType, prompts[output_type]);

        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error converting UI to artifact: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'diagnose_error_screenshot',
    'Analyze error snapshots and propose actionable fixes. Useful for debugging terminal errors, IDE error messages, or application crashes.',
    {
      image_path: z.string().describe('Path to the error screenshot'),
      context: z.string().optional().describe('Additional context about what was being attempted'),
    },
    async ({ image_path, context }) => {
      try {
        const resolvedPath = resolveImagePath(image_path);
        const { data, mimeType } = fileToBase64(resolvedPath);

        if (!isImageMimeType(mimeType)) {
          return {
            content: [{ type: 'text' as const, text: `Error: Not an image file: ${mimeType}` }],
            isError: true,
          };
        }

        const contextHint = context ? `Context: ${context}\n\n` : '';
        const prompt = `${contextHint}Analyze this error screenshot. Identify:
1. The error type and message
2. The likely root cause
3. Step-by-step actionable fixes
4. Prevention tips if applicable

Be specific and practical in your suggestions.`;

        const result = await client.analyzeImage(data, mimeType, prompt);

        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error diagnosing screenshot: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'understand_technical_diagram',
    'Interpret architecture, flow, UML, ER, and system diagrams. Extracts structure and explains the technical concepts.',
    {
      image_path: z.string().describe('Path to the diagram image'),
      diagram_type: z.enum(['architecture', 'flow', 'uml', 'er', 'network', 'other']).optional().describe('Type of diagram (auto-detected if not specified)'),
    },
    async ({ image_path, diagram_type }) => {
      try {
        const resolvedPath = resolveImagePath(image_path);
        const { data, mimeType } = fileToBase64(resolvedPath);

        if (!isImageMimeType(mimeType)) {
          return {
            content: [{ type: 'text' as const, text: `Error: Not an image file: ${mimeType}` }],
            isError: true,
          };
        }

        const typeHint = diagram_type ? `This is a ${diagram_type} diagram. ` : '';
        const prompt = `${typeHint}Analyze this technical diagram and provide:
1. A summary of what the diagram represents
2. Key components/entities and their roles
3. Relationships and data flows
4. Technical implications and considerations
5. If applicable, suggest improvements or potential issues

Be thorough and precise in your analysis.`;

        const result = await client.analyzeImage(data, mimeType, prompt);

        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error analyzing diagram: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'analyze_data_visualization',
    'Read charts and dashboards to surface insights and trends. Extracts data points and provides analytical insights.',
    {
      image_path: z.string().describe('Path to the chart/dashboard image'),
      focus: z.string().optional().describe('Specific aspect to focus on (e.g., "trends", "anomalies", "comparison")'),
    },
    async ({ image_path, focus }) => {
      try {
        const resolvedPath = resolveImagePath(image_path);
        const { data, mimeType } = fileToBase64(resolvedPath);

        if (!isImageMimeType(mimeType)) {
          return {
            content: [{ type: 'text' as const, text: `Error: Not an image file: ${mimeType}` }],
            isError: true,
          };
        }

        const focusHint = focus ? `Focus on: ${focus}. ` : '';
        const prompt = `${focusHint}Analyze this data visualization and provide:
1. Chart type and what it represents
2. Key data points and values (extract specific numbers where visible)
3. Trends, patterns, and insights
4. Notable anomalies or outliers
5. Conclusions and recommendations based on the data

Be precise with numbers and thorough with insights.`;

        const result = await client.analyzeImage(data, mimeType, prompt);

        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error analyzing visualization: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ui_diff_check',
    'Compare two UI screenshots to flag visual or implementation drift. Useful for regression testing.',
    {
      image_path_1: z.string().describe('Path to the first (baseline) UI screenshot'),
      image_path_2: z.string().describe('Path to the second (comparison) UI screenshot'),
      threshold: z.enum(['strict', 'moderate', 'lenient']).optional().describe('Sensitivity of comparison (default: moderate)'),
    },
    async ({ image_path_1, image_path_2, threshold = 'moderate' }) => {
      try {
        const resolvedPath1 = resolveImagePath(image_path_1);
        const resolvedPath2 = resolveImagePath(image_path_2);

        const { data: data1, mimeType: mime1 } = fileToBase64(resolvedPath1);
        const { data: data2, mimeType: mime2 } = fileToBase64(resolvedPath2);

        if (!isImageMimeType(mime1) || !isImageMimeType(mime2)) {
          return {
            content: [{ type: 'text' as const, text: `Error: Both files must be images` }],
            isError: true,
          };
        }

        const thresholds = {
          strict: 'Report any differences, no matter how small.',
          moderate: 'Report noticeable differences that could affect user experience.',
          lenient: 'Only report significant differences that change functionality or major visual elements.',
        };

        const prompt = `Compare these two UI screenshots.

Baseline: ${basename(image_path_1)}
Comparison: ${basename(image_path_2)}

Sensitivity: ${thresholds[threshold]}

Provide:
1. Overall similarity assessment (percentage if possible)
2. List of differences found (position, element, nature of change)
3. Severity of each difference (critical, major, minor, trivial)
4. Whether this represents a regression or intended change
5. Recommendations`;

        const result1 = await client.analyzeImage(data1, mime1, 'Analyze this baseline UI screenshot and describe its key elements, layout, colors, and structure.');
        const result2 = await client.analyzeImage(data2, mime2, 'Analyze this comparison UI screenshot and describe its key elements, layout, colors, and structure.');

        const combinedPrompt = `${prompt}

BASELINE ANALYSIS:
${result1}

COMPARISON ANALYSIS:
${result2}

Now provide the diff comparison analysis.`;

        const result = await client.analyzeImage(data1, mime1, combinedPrompt);

        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error comparing UI screenshots: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'video_analysis',
    'Inspect videos (local files ≤8MB; MP4/MOV/M4V/WebM) to describe scenes, moments, and entities.',
    {
      video_path: z.string().describe('Path to the video file (max 8MB)'),
      prompt: z.string().optional().describe('Custom analysis prompt (default: summarize the video)'),
    },
    async ({ video_path, prompt }) => {
      try {
        const resolvedPath = resolveImagePath(video_path);
        const { data, mimeType } = fileToBase64(resolvedPath);

        if (!isVideoMimeType(mimeType)) {
          return {
            content: [{ type: 'text' as const, text: `Error: Not a video file: ${mimeType}. Supported formats: MP4, MOV, M4V, WebM` }],
            isError: true,
          };
        }

        const analysisPrompt = prompt || `Analyze this video and provide:
1. Overall summary of what happens
2. Key scenes and moments (with timestamps if possible)
3. People, objects, and entities detected
4. Actions and events
5. Audio/transcript if speech is present
6. Notable visual or audio elements`;

        const result = await client.analyzeVideo(data, mimeType, analysisPrompt);

        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error analyzing video: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
